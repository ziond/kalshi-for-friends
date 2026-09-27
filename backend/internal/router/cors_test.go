package router_test

import (
	"crypto/ed25519"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ziond/kalshi-for-friends/backend/internal/config"
	"github.com/ziond/kalshi-for-friends/backend/internal/router"
)

func TestCredentialedCORS(t *testing.T) {
	pub, key, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	allowed := "https://frontend.example"
	app := router.New(&config.Config{Env: "test", JWTPrivateKey: key, JWTPublicKey: pub, SessionTTL: time.Minute, RefreshTTL: time.Hour, CORSOrigins: []string{allowed}}, nil)
	for _, tc := range []struct {
		method, origin string
		status         int
	}{
		{"OPTIONS", allowed, 204}, {"GET", allowed, 401}, {"GET", "https://untrusted.example", 401},
	} {
		req := httptest.NewRequest(tc.method, "/api/v1/me", nil)
		req.Header.Set("Origin", tc.origin)
		if tc.method == "OPTIONS" {
			req.Header.Set("Access-Control-Request-Method", "PATCH")
			req.Header.Set("Access-Control-Request-Headers", "content-type")
		}
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != tc.status {
			t.Fatalf("%s: status %d", tc.method, res.StatusCode)
		}
		origin := res.Header.Get("Access-Control-Allow-Origin")
		if tc.origin == allowed {
			if origin != allowed || res.Header.Get("Access-Control-Allow-Credentials") != "true" {
				t.Fatalf("missing credentialed CORS: %v", res.Header)
			}
		} else if origin != "" {
			t.Fatal("untrusted origin allowed")
		}
	}
}
