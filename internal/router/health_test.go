package router

import (
	"context"
	"errors"
	"github.com/gofiber/fiber/v2"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDatabaseHealth(t *testing.T) {
	for _, tc := range []struct {
		name    string
		failure error
		status  int
		want    string
	}{
		{"ready", nil, 200, `"database":"connected"`},
		{"unavailable", errors.New("secret-database-details"), 503, `"code":"DATABASE_UNAVAILABLE"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/health", healthHandler(func(ctx context.Context) error {
				if _, ok := ctx.Deadline(); !ok {
					t.Error("database ping has no timeout")
				}
				return tc.failure
			}))
			response, err := app.Test(httptest.NewRequest("GET", "/health", nil))
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			body, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatal(err)
			}
			if response.StatusCode != tc.status || !strings.Contains(string(body), tc.want) {
				t.Fatalf("unexpected response: %d %s", response.StatusCode, body)
			}
			if strings.Contains(string(body), "secret-database-details") {
				t.Fatal("database details leaked")
			}
		})
	}
}
