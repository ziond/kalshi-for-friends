package communities

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
)

const (
	nameMaxLen        = 100
	descriptionMaxLen = 2000

	inviteCodeLen = 10
	// No 0/O or 1/I so codes survive being read aloud or retyped.
	inviteCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	inviteCodeAttempts = 5
)

var (
	errNotFound       = apperror.NotFound("Community not found")
	errMemberNotFound = apperror.NotFound("Member not found")
	errAdminOnly      = apperror.Forbidden("Only community admins can do this")
	errLastAdmin      = apperror.New(http.StatusForbidden, "FORBIDDEN",
		"A community must keep at least one admin; promote another member first")
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) ListMine(ctx context.Context, userID int64) ([]CommunitySummary, error) {
	list, err := listForUser(ctx, s.pool, userID)
	if err != nil {
		return nil, fmt.Errorf("communities: list: %w", err)
	}
	return list, nil
}

// Get returns the community if the user is a member. Non-members get
// NOT_FOUND so community IDs cannot be probed.
func (s *Service) Get(ctx context.Context, communityID, userID int64) (*CommunityDetail, error) {
	d, err := getDetail(ctx, s.pool, communityID, userID)
	if database.IsNoRows(err) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("communities: get: %w", err)
	}
	if d.MyRole == nil && d.Visibility == "PRIVATE" {
		return nil, apperror.Forbidden("This community is invite-only")
	}
	if d.MyRole == nil || !d.MyRole.CanSeeInviteCode() {
		d.InviteCode = nil
	}
	return d, nil
}

// Create inserts the community and the creator's ADMIN membership atomically.
func (s *Service) Create(ctx context.Context, userID int64, req CreateCommunityRequest) (*CommunityDetail, error) {
	name := strings.TrimSpace(req.Name)
	description := normalizeDescription(req.Description)

	fields := map[string]string{}
	if req.Visibility != "PUBLIC" && req.Visibility != "PRIVATE" {
		fields["visibility"] = "Choose PUBLIC or PRIVATE"
	}
	if msg := validateName(name); msg != "" {
		fields["name"] = msg
	}
	if msg := validateDescription(description); msg != "" {
		fields["description"] = msg
	}
	if len(fields) > 0 {
		return nil, apperror.Validation("Invalid community details", fields)
	}

	var communityID int64
	err := retryOnInviteCollision(func(code string) error {
		return database.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
			id, err := insertCommunity(ctx, tx, name, description, code, userID)
			if err != nil {
				return err
			}
			if _, err := insertMember(ctx, tx, id, userID, RoleAdmin); err != nil {
				return err
			}
			communityID = id
			if _, err := tx.Exec(ctx, `UPDATE communities SET visibility=$2 WHERE id=$1`, id, req.Visibility); err != nil {
				return err
			}
			if req.Visibility == "PUBLIC" {
				for _, username := range req.ModeratorUsernames {
					var moderatorID int64
					if err := tx.QueryRow(ctx, `SELECT id FROM users WHERE lower(username)=lower($1)`, strings.TrimSpace(username)).Scan(&moderatorID); err != nil {
						if database.IsNoRows(err) {
							return apperror.Validation("Unknown moderator", map[string]string{"moderatorUsernames": "Unknown username: " + username})
						}
						return err
					}
					if _, err := insertMember(ctx, tx, id, moderatorID, RoleModerator); err != nil {
						return err
					}
				}
			}
			return nil
		})
	})
	if err != nil {
		return nil, fmt.Errorf("communities: create: %w", err)
	}
	return s.Get(ctx, communityID, userID)
}

func (s *Service) Join(ctx context.Context, userID int64, req JoinCommunityRequest) (*CommunityDetail, error) {
	code := strings.ToUpper(strings.TrimSpace(req.InviteCode))
	invalid := apperror.New(http.StatusNotFound, "INVALID_INVITE_CODE", "Invite code is invalid or has been replaced")
	if code == "" {
		return nil, invalid
	}

	communityID, err := findIDByInviteCode(ctx, s.pool, code)
	if database.IsNoRows(err) {
		return nil, invalid
	}
	if err != nil {
		return nil, fmt.Errorf("communities: join: %w", err)
	}

	err = database.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		if err := lockCommunity(ctx, tx, communityID); err != nil {
			return err
		}
		var current string
		if err := tx.QueryRow(ctx, `SELECT invite_code FROM communities WHERE id=$1`, communityID).Scan(&current); err != nil {
			return err
		}
		if current != code {
			return invalid
		}
		inserted, err := insertMember(ctx, tx, communityID, userID, RoleMember)
		if err != nil {
			return err
		}
		if !inserted {
			return apperror.New(http.StatusConflict, "ALREADY_MEMBER", "You are already a member of this community")
		}
		return nil
	})
	if err != nil {
		return nil, wrap("join", err)
	}
	return s.Get(ctx, communityID, userID)
}

func (s *Service) Update(ctx context.Context, communityID, userID int64, req UpdateCommunityRequest) (*CommunityDetail, error) {
	var name string
	fields := map[string]string{}
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if msg := validateName(name); msg != "" {
			fields["name"] = msg
		}
	}
	description := normalizeDescription(req.Description)
	if msg := validateDescription(description); msg != "" {
		fields["description"] = msg
	}
	if len(fields) > 0 {
		return nil, apperror.Validation("Invalid community details", fields)
	}

	err := database.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		if err := s.requireAdmin(ctx, tx, communityID, userID); err != nil {
			return err
		}
		return updateCommunity(ctx, tx, communityID, req.Name != nil, name, req.Description != nil, description)
	})
	if err != nil {
		return nil, wrap("update", err)
	}
	return s.Get(ctx, communityID, userID)
}

// RegenerateInviteCode replaces the code, invalidating the old one.
func (s *Service) RegenerateInviteCode(ctx context.Context, communityID, userID int64) (*InviteCodeResponse, error) {
	var newCode string
	err := retryOnInviteCollision(func(code string) error {
		return database.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
			if err := s.requireAdmin(ctx, tx, communityID, userID); err != nil {
				return err
			}
			newCode = code
			return updateInviteCode(ctx, tx, communityID, code)
		})
	})
	if err != nil {
		return nil, wrap("regenerate invite code", err)
	}
	return &InviteCodeResponse{InviteCode: newCode}, nil
}

func (s *Service) ListMembers(ctx context.Context, communityID, userID int64) ([]CommunityMember, error) {
	if _, err := getRole(ctx, s.pool, communityID, userID); err != nil {
		if database.IsNoRows(err) {
			return nil, errNotFound
		}
		return nil, fmt.Errorf("communities: list members: %w", err)
	}
	list, err := listMembers(ctx, s.pool, communityID)
	if err != nil {
		return nil, fmt.Errorf("communities: list members: %w", err)
	}
	return list, nil
}

func (s *Service) UpdateMemberRole(ctx context.Context, communityID, actorID, targetID int64, req UpdateMemberRoleRequest) (*CommunityMember, error) {
	if !req.Role.Valid() {
		return nil, apperror.Validation("Invalid role", map[string]string{"role": "Role must be MEMBER, MODERATOR, or ADMIN"})
	}

	var member *CommunityMember
	err := database.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		if err := s.lockAsMember(ctx, tx, communityID, actorID, true); err != nil {
			return err
		}
		target, err := getMember(ctx, tx, communityID, targetID)
		if database.IsNoRows(err) {
			return errMemberNotFound
		}
		if err != nil {
			return err
		}
		if target.Role == RoleAdmin && req.Role != RoleAdmin {
			if err := ensureAnotherAdmin(ctx, tx, communityID); err != nil {
				return err
			}
		}
		if err := updateMemberRole(ctx, tx, communityID, targetID, req.Role); err != nil {
			return err
		}
		target.Role = req.Role
		member = target
		return nil
	})
	if err != nil {
		return nil, wrap("update member role", err)
	}
	return member, nil
}

// RemoveMember lets an admin remove anyone, or any member leave themselves.
// Historical positions, payouts, and ledger entries are untouched.
func (s *Service) RemoveMember(ctx context.Context, communityID, actorID, targetID int64) error {
	err := database.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		if err := s.lockAsMember(ctx, tx, communityID, actorID, actorID != targetID); err != nil {
			return err
		}
		targetRole, err := getRole(ctx, tx, communityID, targetID)
		if database.IsNoRows(err) {
			return errMemberNotFound
		}
		if err != nil {
			return err
		}
		if targetRole == RoleAdmin {
			if err := ensureAnotherAdmin(ctx, tx, communityID); err != nil {
				return err
			}
		}
		return deleteMember(ctx, tx, communityID, targetID)
	})
	return wrap("remove member", err)
}

// lockAsMember locks the community row, then checks the actor's membership
// (and admin role if requireAdmin).
func (s *Service) lockAsMember(ctx context.Context, tx pgx.Tx, communityID, actorID int64, requireAdmin bool) error {
	if err := lockCommunity(ctx, tx, communityID); err != nil {
		if database.IsNoRows(err) {
			return errNotFound
		}
		return err
	}
	role, err := getRole(ctx, tx, communityID, actorID)
	if database.IsNoRows(err) {
		return errNotFound
	}
	if err != nil {
		return err
	}
	if requireAdmin && role != RoleAdmin {
		return errAdminOnly
	}
	return nil
}

func (s *Service) requireAdmin(ctx context.Context, db database.DBTX, communityID, userID int64) error {
	role, err := getRole(ctx, db, communityID, userID)
	if database.IsNoRows(err) {
		return errNotFound
	}
	if err != nil {
		return err
	}
	if role != RoleAdmin {
		return errAdminOnly
	}
	return nil
}

// ensureAnotherAdmin must be called with the community row locked.
func ensureAnotherAdmin(ctx context.Context, db database.DBTX, communityID int64) error {
	admins, err := countAdmins(ctx, db, communityID)
	if err != nil {
		return err
	}
	if admins <= 1 {
		return errLastAdmin
	}
	return nil
}

// retryOnInviteCollision calls fn with fresh random codes until it succeeds
// without violating the invite-code unique constraint.
func retryOnInviteCollision(fn func(code string) error) error {
	for attempt := 0; attempt < inviteCodeAttempts; attempt++ {
		code, err := generateInviteCode()
		if err != nil {
			return err
		}
		err = fn(code)
		if name, ok := database.UniqueViolation(err); ok && name == inviteCodeUniqueConstraint {
			continue
		}
		return err
	}
	return errors.New("could not generate a unique invite code")
}

func generateInviteCode() (string, error) {
	max := big.NewInt(int64(len(inviteCodeAlphabet)))
	b := make([]byte, inviteCodeLen)
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b[i] = inviteCodeAlphabet[n.Int64()]
	}
	return string(b), nil
}

// normalizeDescription trims the description and maps blank to NULL.
func normalizeDescription(d *string) *string {
	if d == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*d)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func validateName(name string) string {
	if n := utf8.RuneCountInString(name); n == 0 || n > nameMaxLen {
		return fmt.Sprintf("Name must be 1–%d characters", nameMaxLen)
	}
	return ""
}

func validateDescription(d *string) string {
	if d != nil && utf8.RuneCountInString(*d) > descriptionMaxLen {
		return fmt.Sprintf("Description must be at most %d characters", descriptionMaxLen)
	}
	return ""
}

// wrap passes API errors through unchanged and adds context to the rest.
func wrap(op string, err error) error {
	if err == nil {
		return nil
	}
	var appErr *apperror.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return fmt.Errorf("communities: %s: %w", op, err)
}
