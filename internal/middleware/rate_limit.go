package middleware

import (
	"github.com/gofiber/fiber/v2"
	"sync"
	"time"
)

// A bounded per-process limit. Behind ngrok this conservatively shares the
// proxy IP budget; never trust arbitrary forwarded IP headers for bypasses.
func AuthLimit() fiber.Handler {
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
		blocked := b.count >= 30 || (!exists && len(buckets) >= 10000)
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
			return c.Status(429).JSON(fiber.Map{"error": fiber.Map{"code": "FORBIDDEN", "message": "Too many authentication attempts; try again shortly"}})
		}
		return c.Next()
	}
}
