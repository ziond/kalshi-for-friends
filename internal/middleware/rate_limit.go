package middleware

import (
	"github.com/gofiber/fiber/v2"
	"sync"
	"time"
)

// AuthLimit caps login/register attempts per IP.
func AuthLimit() fiber.Handler {
	return ipLimit(30, "Too many authentication attempts; try again shortly")
}

// PublicInviteLimit caps signed-out invite lookups per IP so codes cannot be
// guessed by brute force. The Next.js server calls it on behalf of every
// link-preview bot and signed-out visitor, so its budget is shared; the
// frontend caches each code for 5 minutes, which keeps real traffic well under.
func PublicInviteLimit() fiber.Handler {
	return ipLimit(120, "Too many invite lookups; try again shortly")
}

// A bounded per-process limit of perMinute requests per IP. Behind ngrok this
// conservatively shares the proxy IP budget; never trust arbitrary forwarded
// IP headers for bypasses.
func ipLimit(perMinute int, message string) fiber.Handler {
	type bucket struct {
		count   int
		expires time.Time
	}
	var mu sync.Mutex
	buckets := map[string]bucket{}
	return func(c *fiber.Ctx) error {
		now := time.Now()
		key := c.IP()
		mu.Lock()
		for ip, b := range buckets {
			if !now.Before(b.expires) {
				delete(buckets, ip)
			}
		}
		b, exists := buckets[key]
		blocked := b.count >= perMinute || (!exists && len(buckets) >= 10000)
		if !blocked {
			if !exists {
				b.expires = now.Add(time.Minute)
			}
			b.count++
			buckets[key] = b
		}
		mu.Unlock()
		if blocked {
			c.Set("Retry-After", "60")
			return c.Status(429).JSON(fiber.Map{"error": fiber.Map{"code": "FORBIDDEN", "message": message}})
		}
		return c.Next()
	}
}
