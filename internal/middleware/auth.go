// Package middleware contains shared HTTP request middleware.
package middleware

import (
	"github.com/gofiber/fiber/v2"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
)

const userIDKey = "userID"

// TokenVerifier returns the user ID a session token was issued for.
type TokenVerifier func(token string) (int64, error)

// RequireAuth rejects requests without a valid session cookie and exposes
// the verified user ID to handlers through UserID.
func RequireAuth(cookieName string, verify TokenVerifier) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := c.Cookies(cookieName)
		if token == "" {
			return apperror.Unauthorized("Not signed in")
		}
		userID, err := verify(token)
		if err != nil {
			return apperror.Unauthorized("Session is invalid or expired")
		}
		c.Locals(userIDKey, userID)
		return c.Next()
	}
}

// UserID returns the authenticated user's ID. Only valid behind RequireAuth.
func UserID(c *fiber.Ctx) int64 {
	id, _ := c.Locals(userIDKey).(int64)
	return id
}
