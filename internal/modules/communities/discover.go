package communities

import (
	"github.com/gofiber/fiber/v2"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
	"strings"
)

func (h *Handler) Discover(c *fiber.Ctx) error {
	rows, err := h.svc.pool.Query(c.UserContext(), `SELECT `+summaryColumns+` FROM communities c
 LEFT JOIN community_members cm ON cm.community_id=c.id AND cm.user_id=$1
 WHERE c.visibility='PUBLIC' ORDER BY c.id DESC`, middleware.UserID(c))
	if err != nil {
		return err
	}
	defer rows.Close()
	list := []CommunitySummary{}
	for rows.Next() {
		var item CommunitySummary
		if err := scanSummary(rows, &item); err != nil {
			return err
		}
		list = append(list, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(list)
}

func (h *Handler) JoinPublic(c *fiber.Ctx) error {
	id, err := pathID(c, "id", errNotFound)
	if err != nil {
		return err
	}
	var visibility string
	err = h.svc.pool.QueryRow(c.UserContext(), `SELECT visibility FROM communities WHERE id=$1`, id).Scan(&visibility)
	if database.IsNoRows(err) {
		return errNotFound
	}
	if err != nil {
		return err
	}
	if visibility != "PUBLIC" {
		return apperror.Forbidden("Use an invite code to join this community")
	}
	ok, err := insertMember(c.UserContext(), h.svc.pool, id, middleware.UserID(c), RoleMember)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.New(409, "ALREADY_MEMBER", "You are already a member")
	}
	item, err := h.svc.Get(c.UserContext(), id, middleware.UserID(c))
	if err != nil {
		return err
	}
	return c.JSON(item)
}

// PublicInvite is the signed-out invite lookup behind link previews. It
// returns only what the link already grants: name, visibility, member count.
func (h *Handler) PublicInvite(c *fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")
	code := strings.ToUpper(strings.TrimSpace(c.Params("code")))
	var name, visibility string
	var memberCount int64
	err := h.svc.pool.QueryRow(c.UserContext(), `SELECT c.name, c.visibility,
 (SELECT count(*) FROM community_members m WHERE m.community_id = c.id)
 FROM communities c WHERE c.invite_code = $1 AND c.invite_expires_at > clock_timestamp()`, code).Scan(&name, &visibility, &memberCount)
	if database.IsNoRows(err) {
		return apperror.New(404, "INVALID_INVITE_CODE", "Invalid invite code")
	}
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"inviteCode": code, "community": fiber.Map{
		"name": name, "visibility": visibility, "memberCount": memberCount,
	}})
}

func (h *Handler) InvitePreview(c *fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")
	code := strings.ToUpper(strings.TrimSpace(c.Params("code")))
	id, err := findIDByInviteCode(c.UserContext(), h.svc.pool, code)
	if database.IsNoRows(err) {
		return apperror.New(404, "INVALID_INVITE_CODE", "Invalid invite code")
	}
	if err != nil {
		return err
	}
	d, err := getDetail(c.UserContext(), h.svc.pool, id, middleware.UserID(c))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"inviteCode": code, "alreadyMember": d.MyRole != nil, "community": fiber.Map{
		"id": d.ID, "name": d.Name, "description": d.Description, "visibility": d.Visibility, "memberCount": d.MemberCount, "moderators": d.Moderators,
	}})
}
