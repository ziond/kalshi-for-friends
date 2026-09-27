package auth

import (
	"crypto/ed25519"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/config"
)

type CookieConfig struct {
	Name     string
	Domain   string
	Secure   bool
	SameSite string
}

type Handler struct {
	svc          *Service
	privateKey   ed25519.PrivateKey
	sessionTTL   time.Duration
	refreshTTL   time.Duration
	cookie       CookieConfig
	refreshStore RefreshStore
}

func NewHandler(svc *Service, privateKey ed25519.PrivateKey, sessionTTL, refreshTTL time.Duration, cookie CookieConfig, store RefreshStore) *Handler {
	return &Handler{svc: svc, privateKey: privateKey, sessionTTL: sessionTTL, refreshTTL: refreshTTL, cookie: cookie, refreshStore: store}
}

// Register handles POST /auth/register. Registration also signs the user in.
func (h *Handler) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.Validation("Request body must be valid JSON", nil)
	}
	me, err := h.svc.Register(c.UserContext(), req)
	if err != nil {
		return err
	}
	if err := h.setSession(c, me.ID, ""); err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(me)
}

// Login handles POST /auth/login.
func (h *Handler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.Validation("Request body must be valid JSON", nil)
	}
	me, err := h.svc.Login(c.UserContext(), req)
	if err != nil {
		return err
	}
	if err := h.setSession(c, me.ID, ""); err != nil {
		return err
	}
	return c.JSON(me)
}

// Logout revokes the presented refresh token and clears both cookies.
func (h *Handler) Logout(c *fiber.Ctx) error {
	if token := c.Cookies("refresh_token"); token != "" {
		if err := h.refreshStore.Revoke(c.UserContext(), token); err != nil {
			return err
		}
	}
	c.Set("Cache-Control", "no-store")
	for _, name := range []string{"access_token", "refresh_token"} {
		c.Cookie(h.newCookie(name, "", time.Unix(0, 0), -1))
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) setSession(c *fiber.Ctx, userID int64, oldRefresh string) error {
	token, expiresAt, err := generateJWT(userID, h.privateKey, h.sessionTTL, "access")
	if err != nil {
		return err
	}
	refresh, refreshExpires, err := generateJWT(userID, h.privateKey, h.refreshTTL, "refresh")
	if err != nil {
		return err
	}
	if err := h.refreshStore.Replace(c.UserContext(), oldRefresh, refresh, userID, *refreshExpires); err != nil {
		return err
	}
	c.Set("Cache-Control", "no-store")
	c.Cookie(h.newCookie("access_token", token, *expiresAt, int(time.Until(*expiresAt).Seconds())))
	c.Cookie(h.newCookie("refresh_token", refresh, *refreshExpires, int(time.Until(*refreshExpires).Seconds())))
	return nil
}

// Refresh atomically consumes the old token before issuing a new pair.
func (h *Handler) Refresh(c *fiber.Ctx) error {
	cfg := &config.Config{JWTPublicKey: h.privateKey.Public().(ed25519.PublicKey)}
	id, err := verifier(cfg, "refresh")(c.Cookies("refresh_token"))
	if err != nil {
		return apperror.Unauthorized("Refresh token is invalid or expired")
	}
	if err := h.setSession(c, id, c.Cookies("refresh_token")); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) newCookie(name, value string, expires time.Time, maxAge int) *fiber.Cookie {
	return &fiber.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		Domain:   h.cookie.Domain,
		Expires:  expires,
		MaxAge:   maxAge,
		Secure:   h.cookie.Secure,
		HTTPOnly: true,
		SameSite: h.cookie.SameSite,
	}
}
