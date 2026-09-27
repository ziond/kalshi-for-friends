package users

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
)

const (
	UsernameMinLen  = 3
	UsernameMaxLen  = 50
	avatarURLMaxLen = 2048

	// Unique index names from migration 000001.
	UsernameUniqueIndex = "users_username_unique"
	EmailUniqueIndex    = "users_email_unique"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) GetMe(ctx context.Context, userID int64) (*Me, error) {
	me, err := GetMe(ctx, s.pool, userID)
	if database.IsNoRows(err) {
		// The session outlived its user; treat it as signed out.
		return nil, apperror.Unauthorized("Session is invalid or expired")
	}
	if err != nil {
		return nil, fmt.Errorf("users: get me: %w", err)
	}
	return me, nil
}

func (s *Service) GetProfile(ctx context.Context, userID int64) (*UserProfile, error) {
	p, err := GetProfile(ctx, s.pool, userID)
	if database.IsNoRows(err) {
		return nil, apperror.NotFound("User not found")
	}
	if err != nil {
		return nil, fmt.Errorf("users: get profile: %w", err)
	}
	return p, nil
}

func (s *Service) UpdateMe(ctx context.Context, userID int64, req UpdateMeRequest) (*Me, error) {
	fields := map[string]string{}

	var username string
	if req.Username != nil {
		username = strings.TrimSpace(*req.Username)
		if msg := ValidateUsername(username); msg != "" {
			fields["username"] = msg
		}
	}

	var avatarURL *string
	if req.AvatarURL != nil {
		trimmed := strings.TrimSpace(*req.AvatarURL)
		if trimmed != "" {
			if msg := validateAvatarURL(trimmed); msg != "" {
				fields["avatarUrl"] = msg
			}
			avatarURL = &trimmed
		}
	}

	if len(fields) > 0 {
		return nil, apperror.Validation("Invalid profile update", fields)
	}

	err := UpdateProfile(ctx, s.pool, userID, req.Username != nil, username, req.AvatarURL != nil, avatarURL)
	if name, ok := database.UniqueViolation(err); ok && name == UsernameUniqueIndex {
		return nil, apperror.Validation("Invalid profile update", map[string]string{"username": "Username is already taken"})
	}
	if err != nil {
		return nil, fmt.Errorf("users: update profile: %w", err)
	}
	return s.GetMe(ctx, userID)
}

// ValidateUsername expects already-trimmed input and returns an error
// message, or "" when valid.
func ValidateUsername(username string) string {
	n := utf8.RuneCountInString(username)
	if n < UsernameMinLen || n > UsernameMaxLen {
		return fmt.Sprintf("Username must be %d–%d characters", UsernameMinLen, UsernameMaxLen)
	}
	return ""
}

func validateAvatarURL(raw string) string {
	if len(raw) > avatarURLMaxLen {
		return "Avatar URL is too long"
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "Avatar URL must be an http(s) URL"
	}
	return ""
}
