package middleware

import (
	"github.com/gofiber/fiber/v2"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSEC09RequestSecurity(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	app.Use(RequestSecurity([]string{"https://frontend.test"}))
	app.Post("/", func(c *fiber.Ctx) error { return c.SendStatus(204) })
	for _, tc := range []struct {
		origin, content string
		status          int
	}{{"https://evil.test", "application/json", 403}, {"https://frontend.test", "text/plain", 400}, {"https://frontend.test", "application/json", 204}, {"", "application/json", 204}} {
		req := httptest.NewRequest("POST", "http://backend.test/", strings.NewReader(`{}`))
		req.Header.Set("Origin", tc.origin)
		req.Header.Set("Content-Type", tc.content)
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != tc.status {
			t.Fatalf("%s: got %d", tc.origin, res.StatusCode)
		}
	}
}
