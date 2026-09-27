package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"net/url"
	"strings"
)

// Guard browser mutations, including no-body refresh/logout requests.
func RequestSecurity(allowed []string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		switch c.Method() {
		case "POST", "PATCH", "DELETE":
		default:
			return c.Next()
		}
		if len(c.Body()) > 0 && strings.ToLower(strings.TrimSpace(strings.Split(c.Get("Content-Type"), ";")[0])) != "application/json" {
			return apperror.Validation("Use application/json", map[string]string{"body": "Expected JSON"})
		}
		if origin := c.Get("Origin"); origin != "" {
			parsed, err := url.Parse(origin)
			ok := err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host == c.Hostname()
			for _, a := range allowed {
				if a == origin {
					ok = true
				}
			}
			if !ok {
				return apperror.Forbidden("Origin is not allowed")
			}
		}
		return c.Next()
	}
}
