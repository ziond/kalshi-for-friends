package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/config"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
)

func TestTokenContract(t *testing.T) {
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{JWTPublicKey: pub}
	for _, tc := range []struct {
		kind  string
		ttl   time.Duration
		valid bool
	}{
		{"access", time.Minute, true}, {"refresh", time.Minute, false}, {"access", -time.Minute, false},
	} {
		token, _, err := generateJWT(42, key, tc.ttl, tc.kind)
		if err != nil {
			t.Fatal(err)
		}
		id, err := NewVerifier(cfg)(token)
		if (err == nil) != tc.valid {
			t.Fatalf("%s: unexpected verification: %v", tc.kind, err)
		}
		if tc.valid && id != 42 {
			t.Fatalf("wrong user: %d", id)
		}
	}
	store := &testRefreshStore{tokens: make(map[string]bool)}
	h := NewHandler(nil, key, 15*time.Minute, 7*24*time.Hour, CookieConfig{SameSite: "Lax"}, store)
	app := fiber.New(fiber.Config{ErrorHandler: middleware.ErrorHandler})
	app.Post("/refresh", h.Refresh)
	app.Post("/logout", h.Logout)
	original, _, _ := generateJWT(42, key, time.Hour, "refresh")
	store.tokens[original] = true
	access, _, _ := generateJWT(42, key, time.Hour, "access")
	for _, token := range []string{"", "invalid", access, original} {
		req := httptest.NewRequest("POST", "/refresh", nil)
		req.Header.Set("Cookie", "refresh_token="+token)
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if token != original {
			if res.StatusCode != 401 {
				t.Fatalf("invalid refresh: %d", res.StatusCode)
			}
			continue
		}
		if res.StatusCode != 204 || len(res.Cookies()) != 2 {
			t.Fatalf("refresh response: %v", res)
		}
		for _, cookie := range res.Cookies() {
			if cookie.Path != "/" || !cookie.HttpOnly {
				t.Fatalf("unsafe cookie: %s", cookie.Name)
			}
			kind := "access"
			if cookie.Name == "refresh_token" {
				kind = "refresh"
				if cookie.Value == original {
					t.Fatal("not rotated")
				}
			}
			if id, err := verifier(cfg, kind)(cookie.Value); err != nil || id != 42 {
				t.Fatalf("bad issued token: %v", err)
			}
		}
	}
	// AUTH-19: the old refresh token cannot be reused.
	replay := httptest.NewRequest("POST", "/refresh", nil)
	replay.Header.Set("Cookie", "refresh_token="+original)
	replayed, err := app.Test(replay)
	if err != nil {
		t.Fatal(err)
	}
	replayed.Body.Close()
	if replayed.StatusCode != 401 {
		t.Fatal("AUTH-19: replay accepted")
	}
	var active string
	for token := range store.tokens {
		active = token
	}
	logout := httptest.NewRequest("POST", "/logout", nil)
	logout.Header.Set("Cookie", "refresh_token="+active)
	res, err := app.Test(logout)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 204 || len(res.Cookies()) != 2 {
		t.Fatal("logout must clear both cookies")
	}
	for _, cookie := range res.Cookies() {
		if cookie.Value != "" || cookie.Expires.IsZero() || !cookie.Expires.Before(time.Now()) {
			t.Fatal("cookie not cleared")
		}
	}
	replay.Header.Set("Cookie", "refresh_token="+active)
	replayed, err = app.Test(replay)
	if err != nil {
		t.Fatal(err)
	}
	replayed.Body.Close()
	if replayed.StatusCode != 401 {
		t.Fatal("AUTH-20: revoked token accepted")
	}
}

// Test-only store; production always uses PostgreSQL.
type testRefreshStore struct{ tokens map[string]bool }

func (s *testRefreshStore) Replace(_ context.Context, old, next string, _ int64, _ time.Time) error {
	if old != "" && !s.tokens[old] {
		return apperror.Unauthorized("already used")
	}
	delete(s.tokens, old)
	s.tokens[next] = true
	return nil
}
func (s *testRefreshStore) Revoke(_ context.Context, token string) error {
	delete(s.tokens, token)
	return nil
}
