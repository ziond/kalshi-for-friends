package communities

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

// List handles GET /communities.
func (h *Handler) List(c *fiber.Ctx) error {
	list, err := h.svc.ListMine(c.UserContext(), middleware.UserID(c))
	if err != nil {
		return err
	}
	return c.JSON(list)
}

// Create handles POST /communities.
func (h *Handler) Create(c *fiber.Ctx) error {
	var req CreateCommunityRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.Validation("Request body must be valid JSON", nil)
	}
	d, err := h.svc.Create(c.UserContext(), middleware.UserID(c), req)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(d)
}

// Join handles POST /communities/join.
func (h *Handler) Join(c *fiber.Ctx) error {
	var req JoinCommunityRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.Validation("Request body must be valid JSON", nil)
	}
	d, err := h.svc.Join(c.UserContext(), middleware.UserID(c), req)
	if err != nil {
		return err
	}
	return c.JSON(d)
}

// Get handles GET /communities/:id.
func (h *Handler) Get(c *fiber.Ctx) error {
	id, err := pathID(c, "id", errNotFound)
	if err != nil {
		return err
	}
	d, err := h.svc.Get(c.UserContext(), id, middleware.UserID(c))
	if err != nil {
		return err
	}
	return c.JSON(d)
}

// Update handles PATCH /communities/:id.
func (h *Handler) Update(c *fiber.Ctx) error {
	id, err := pathID(c, "id", errNotFound)
	if err != nil {
		return err
	}
	var req UpdateCommunityRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.Validation("Request body must be valid JSON", nil)
	}
	d, err := h.svc.Update(c.UserContext(), id, middleware.UserID(c), req)
	if err != nil {
		return err
	}
	return c.JSON(d)
}

// RegenerateInviteCode handles POST /communities/:id/invite-code.
func (h *Handler) RegenerateInviteCode(c *fiber.Ctx) error {
	id, err := pathID(c, "id", errNotFound)
	if err != nil {
		return err
	}
	resp, err := h.svc.RegenerateInviteCode(c.UserContext(), id, middleware.UserID(c))
	if err != nil {
		return err
	}
	return c.JSON(resp)
}

// ListMembers handles GET /communities/:id/members.
func (h *Handler) ListMembers(c *fiber.Ctx) error {
	id, err := pathID(c, "id", errNotFound)
	if err != nil {
		return err
	}
	list, err := h.svc.ListMembers(c.UserContext(), id, middleware.UserID(c))
	if err != nil {
		return err
	}
	return c.JSON(list)
}

// UpdateMemberRole handles PATCH /communities/:id/members/:userId.
func (h *Handler) UpdateMemberRole(c *fiber.Ctx) error {
	id, err := pathID(c, "id", errNotFound)
	if err != nil {
		return err
	}
	target, err := pathID(c, "userId", errMemberNotFound)
	if err != nil {
		return err
	}
	var req UpdateMemberRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.Validation("Request body must be valid JSON", nil)
	}
	m, err := h.svc.UpdateMemberRole(c.UserContext(), id, middleware.UserID(c), target, req)
	if err != nil {
		return err
	}
	return c.JSON(m)
}

// RemoveMember handles DELETE /communities/:id/members/:userId.
func (h *Handler) RemoveMember(c *fiber.Ctx) error {
	id, err := pathID(c, "id", errNotFound)
	if err != nil {
		return err
	}
	target, err := pathID(c, "userId", errMemberNotFound)
	if err != nil {
		return err
	}
	if err := h.svc.RemoveMember(c.UserContext(), id, middleware.UserID(c), target); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func pathID(c *fiber.Ctx, name string, notFound *apperror.Error) (int64, error) {
	id, err := strconv.ParseInt(c.Params(name), 10, 64)
	if err != nil || id <= 0 {
		return 0, notFound
	}
	return id, nil
}
