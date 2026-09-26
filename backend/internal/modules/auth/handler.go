package auth

import (
	"crypto/ed25519"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
)

type CookieConfig struct {
	Name     string
	Domain   string
	Secure   bool
	SameSite string
}

type Handler struct {
	svc        *Service
	privateKey ed25519.PrivateKey
	sessionTTL time.Duration
	cookie     CookieConfig
}

func NewHandler(svc *Service, privateKey ed25519.PrivateKey, sessionTTL time.Duration, cookie CookieConfig) *Handler {
	return &Handler{svc: svc, privateKey: privateKey, sessionTTL: sessionTTL, cookie: cookie}
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
	if err := h.setSession(c, me.ID); err != nil {
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
	if err := h.setSession(c, me.ID); err != nil {
		return err
	}
	return c.JSON(me)
}

// Logout handles POST /auth/logout. Sessions are stateless JWTs, so this
// only clears the cookie.
func (h *Handler) Logout(c *fiber.Ctx) error {
	c.Cookie(h.newCookie("", time.Unix(0, 0), -1))
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) setSession(c *fiber.Ctx, userID int64) error {
	token, expiresAt, err := generateJWT(userID, h.privateKey, h.sessionTTL)
	if err != nil {
		return err
	}
	c.Cookie(h.newCookie(token, *expiresAt, int(time.Until(*expiresAt).Seconds())))
	return nil
}

func (h *Handler) newCookie(value string, expires time.Time, maxAge int) *fiber.Cookie {
	return &fiber.Cookie{
		Name:     h.cookie.Name,
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
