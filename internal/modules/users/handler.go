package users

import (
	"strconv"

	"github.com/gofiber/fiber/v2"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// GetMe handles GET /me.
func (h *Handler) GetMe(c *fiber.Ctx) error {
	me, err := h.svc.GetMe(c.UserContext(), middleware.UserID(c))
	if err != nil {
		return err
	}
	return c.JSON(me)
}

// UpdateMe handles PATCH /me.
func (h *Handler) UpdateMe(c *fiber.Ctx) error {
	var req UpdateMeRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.Validation("Request body must be valid JSON", nil)
	}
	me, err := h.svc.UpdateMe(c.UserContext(), middleware.UserID(c), req)
	if err != nil {
		return err
	}
	return c.JSON(me)
}

// LookupUsername handles GET /users/lookup?username=. Always 200:
// { user: UserSummary | null }. The create-community form checks moderator
// names with it as they're typed.
func (h *Handler) LookupUsername(c *fiber.Ctx) error {
	u, err := h.svc.LookupUsername(c.UserContext(), c.Query("username"))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"user": u})
}

// GetProfile handles GET /users/:id.
func (h *Handler) GetProfile(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id <= 0 {
		return apperror.NotFound("User not found")
	}
	p, err := h.svc.GetProfile(c.UserContext(), id)
	if err != nil {
		return err
	}
	return c.JSON(p)
}
