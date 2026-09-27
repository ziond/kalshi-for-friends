package middleware

import (
	"github.com/gofiber/fiber/v2"
	"net/http/httptest"
	"testing"
)

func TestSEC10PublicInviteLimit(t *testing.T) {
	app := fiber.New()
	app.Get("/", PublicInviteLimit(), func(c *fiber.Ctx) error { return c.SendStatus(204) })
	for i := 1; i <= 121; i++ {
		res, err := app.Test(httptest.NewRequest("GET", "/", nil))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		want := 204
		if i == 121 {
			want = 429
		}
		if res.StatusCode != want {
			t.Fatalf("request %d: got %d, want %d", i, res.StatusCode, want)
		}
		if want == 429 && res.Header.Get("Retry-After") != "60" {
			t.Fatalf("missing Retry-After on 429")
		}
	}
}
