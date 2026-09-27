package router_test

import (
	"crypto/ed25519"
	"github.com/ziond/kalshi-for-friends/backend/internal/config"
	"github.com/ziond/kalshi-for-friends/backend/internal/router"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSEC01AllProtectedRoutes(t *testing.T) {
	pub, key, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	app := router.New(&config.Config{Env: "test", JWTPrivateKey: key, JWTPublicKey: pub, SessionTTL: time.Minute, RefreshTTL: time.Hour, CookieSameSite: "Lax"}, nil)
	for _, route := range []struct{ method, path string }{
		{"GET", "/health"}, {"GET", "/me"}, {"PATCH", "/me"}, {"GET", "/users/1"}, {"POST", "/auth/logout"},
		{"GET", "/communities"}, {"POST", "/communities"}, {"GET", "/communities/discover"}, {"POST", "/communities/join"}, {"GET", "/invites/test"},
		{"GET", "/communities/1"}, {"POST", "/communities/1/join"}, {"GET", "/communities/1/members"}, {"PATCH", "/communities/1/members/2"}, {"DELETE", "/communities/1/members/2"},
		{"GET", "/markets"}, {"GET", "/markets/1"}, {"POST", "/communities/1/markets"}, {"GET", "/communities/1/markets"},
		{"POST", "/markets/1/positions"}, {"POST", "/markets/1/resolve"}, {"POST", "/markets/1/cancel"}, {"GET", "/markets/1/activity"},
		{"GET", "/me/wallet"}, {"POST", "/me/wallet/deposit"}, {"GET", "/me/positions"}, {"GET", "/me/transactions"}, {"GET", "/me/mod-queue"}, {"GET", "/communities/1/leaderboard"},
	} {
		res, err := app.Test(httptest.NewRequest(route.method, "/api/v1"+route.path, nil))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 401 {
			t.Fatalf("%s %s: got %d", route.method, route.path, res.StatusCode)
		}
	}
}
