package router_test

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ziond/kalshi-for-friends/backend/internal/config"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/router"
)

// These tests need a migrated, disposable PostgreSQL database. Every table is
// truncated before each test. Set TEST_DATABASE_URL to run them.
func setup(t *testing.T) (*fiber.App, *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `
		TRUNCATE users, wallets, communities, community_members, markets, market_options,
		         market_participants, positions, settlements, transactions
		RESTART IDENTITY CASCADE`); err != nil {
		t.Fatal(err)
	}

	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		Env:             "test",
		JWTPrivateKey:   priv,
		JWTPublicKey:    pub,
		SessionTTL:      time.Hour,
		RefreshTTL:      7 * 24 * time.Hour,
		CookieName:      "access_token",
		CookieSameSite:  "Lax",
		InitialBalance:  1000,
		DepositsEnabled: true,
		PayoutGrace:     5 * time.Minute,
	}
	return router.New(cfg, pool), pool
}

type response struct {
	status int
	body   map[string]any
	list   []any
	cookie string
}

func call(t *testing.T, app *fiber.App, method, path, cookie string, body any) response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, "/api/v1"+path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != "" {
		req.Header.Set("Cookie", "access_token="+cookie)
	}
	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	out := response{status: res.StatusCode}
	raw, _ := io.ReadAll(res.Body)
	if len(raw) > 0 {
		if raw[0] == '[' {
			_ = json.Unmarshal(raw, &out.list)
		} else {
			_ = json.Unmarshal(raw, &out.body)
		}
	}
	for _, c := range res.Cookies() {
		if c.Name == "access_token" {
			out.cookie = c.Value
		}
	}
	return out
}

func register(t *testing.T, app *fiber.App, username string) (cookie string, id float64) {
	t.Helper()
	r := call(t, app, http.MethodPost, "/auth/register", "", map[string]string{
		"username": username, "email": strings.ToLower(username) + "@example.com", "password": "password123",
	})
	if r.status != http.StatusCreated || r.cookie == "" {
		t.Fatalf("register %s: %d %v", username, r.status, r.body)
	}
	return r.cookie, r.body["id"].(float64)
}

func expect(t *testing.T, r response, status int, code string) {
	t.Helper()
	if r.status != status {
		t.Fatalf("status = %d, want %d (body %v)", r.status, status, r.body)
	}
	if code != "" {
		errBody, _ := r.body["error"].(map[string]any)
		if errBody["code"] != code {
			t.Fatalf("error code = %v, want %s", errBody["code"], code)
		}
	}
}

func TestRegisterCreatesWalletAndLedger(t *testing.T) {
	app, pool := setup(t)

	r := call(t, app, http.MethodPost, "/auth/register", "", map[string]string{
		"username": "  Owen ", "email": " Owen@Example.com ", "password": "password123",
	})
	expect(t, r, http.StatusCreated, "")
	if r.body["username"] != "Owen" || r.body["email"] != "owen@example.com" || r.body["balance"] != float64(1000) {
		t.Fatalf("unexpected me: %v", r.body)
	}
	if r.cookie == "" {
		t.Fatal("register did not set session cookie")
	}
	if _, ok := r.body["passwordHash"]; ok {
		t.Fatal("password hash leaked")
	}

	var n int
	var amount, after int64
	err := pool.QueryRow(context.Background(), `
		SELECT count(*), max(amount), max(balance_after) FROM transactions
		WHERE transaction_type = 'INITIAL_BONUS'`).Scan(&n, &amount, &after)
	if err != nil || n != 1 || amount != 1000 || after != 1000 {
		t.Fatalf("ledger: n=%d amount=%d after=%d err=%v", n, amount, after, err)
	}

	me := call(t, app, http.MethodGet, "/me", r.cookie, nil)
	expect(t, me, http.StatusOK, "")
	if me.body["balance"] != float64(1000) || me.body["accuracy"] != float64(0) {
		t.Fatalf("unexpected /me: %v", me.body)
	}
}

func TestRegisterValidationAndDuplicates(t *testing.T) {
	app, pool := setup(t)
	register(t, app, "Owen")

	r := call(t, app, http.MethodPost, "/auth/register", "", map[string]string{
		"username": "ab", "email": "nope", "password": "short",
	})
	expect(t, r, http.StatusBadRequest, "VALIDATION_ERROR")
	fields := r.body["error"].(map[string]any)["fields"].(map[string]any)
	for _, f := range []string{"username", "email", "password"} {
		if fields[f] == nil {
			t.Fatalf("missing field error for %s: %v", f, fields)
		}
	}

	r = call(t, app, http.MethodPost, "/auth/register", "", map[string]string{
		"username": "OWEN", "email": "other@example.com", "password": "password123",
	})
	expect(t, r, http.StatusBadRequest, "VALIDATION_ERROR")

	r = call(t, app, http.MethodPost, "/auth/register", "", map[string]string{
		"username": "someone", "email": "OWEN@example.com", "password": "password123",
	})
	expect(t, r, http.StatusBadRequest, "VALIDATION_ERROR")

	var users, wallets int
	_ = pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM wallets)`).Scan(&users, &wallets)
	if users != 1 || wallets != 1 {
		t.Fatalf("failed registrations left rows behind: users=%d wallets=%d", users, wallets)
	}
}

func TestLoginLogoutAndAuth(t *testing.T) {
	app, _ := setup(t)
	register(t, app, "Owen")

	expect(t, call(t, app, http.MethodGet, "/me", "", nil), http.StatusUnauthorized, "UNAUTHORIZED")
	expect(t, call(t, app, http.MethodGet, "/me", "garbage", nil), http.StatusUnauthorized, "UNAUTHORIZED")

	claims := jwt.MapClaims{"sub": 1, "exp": time.Now().Add(time.Hour).Unix()}
	_, otherKey, _ := ed25519.GenerateKey(nil)
	forged, _ := jwt.NewWithClaims(&jwt.SigningMethodEd25519{}, claims).SignedString(otherKey)
	expect(t, call(t, app, http.MethodGet, "/me", forged, nil), http.StatusUnauthorized, "UNAUTHORIZED")
	hmac, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("secret"))
	expect(t, call(t, app, http.MethodGet, "/me", hmac, nil), http.StatusUnauthorized, "UNAUTHORIZED")
	noExp, _ := jwt.NewWithClaims(&jwt.SigningMethodEd25519{}, jwt.MapClaims{"sub": 1}).SignedString(otherKey)
	expect(t, call(t, app, http.MethodGet, "/me", noExp, nil), http.StatusUnauthorized, "UNAUTHORIZED")

	bad := call(t, app, http.MethodPost, "/auth/login", "", map[string]string{"email": "owen@example.com", "password": "wrongpass1"})
	expect(t, bad, http.StatusUnauthorized, "UNAUTHORIZED")
	unknown := call(t, app, http.MethodPost, "/auth/login", "", map[string]string{"email": "ghost@example.com", "password": "password123"})
	expect(t, unknown, http.StatusUnauthorized, "UNAUTHORIZED")

	ok := call(t, app, http.MethodPost, "/auth/login", "", map[string]string{"email": "OWEN@example.com", "password": "password123"})
	expect(t, ok, http.StatusOK, "")
	if ok.cookie == "" || ok.body["username"] != "Owen" {
		t.Fatalf("login: %v", ok.body)
	}
	expect(t, call(t, app, http.MethodGet, "/me", ok.cookie, nil), http.StatusOK, "")

	out := call(t, app, http.MethodPost, "/auth/logout", ok.cookie, nil)
	expect(t, out, http.StatusNoContent, "")
}

func TestUpdateMeAndProfile(t *testing.T) {
	app, _ := setup(t)
	owen, owenID := register(t, app, "Owen")
	register(t, app, "Zion")

	r := call(t, app, http.MethodPatch, "/me", owen, map[string]string{"username": "OwenY", "avatarUrl": "https://img.example.com/a.png"})
	expect(t, r, http.StatusOK, "")
	if r.body["username"] != "OwenY" || r.body["avatarUrl"] != "https://img.example.com/a.png" {
		t.Fatalf("update: %v", r.body)
	}

	expect(t, call(t, app, http.MethodPatch, "/me", owen, map[string]string{"username": "zion"}), http.StatusBadRequest, "VALIDATION_ERROR")
	expect(t, call(t, app, http.MethodPatch, "/me", owen, map[string]string{"avatarUrl": "javascript:alert(1)"}), http.StatusBadRequest, "VALIDATION_ERROR")

	r = call(t, app, http.MethodPatch, "/me", owen, map[string]string{"avatarUrl": ""})
	expect(t, r, http.StatusOK, "")
	if r.body["avatarUrl"] != nil || r.body["username"] != "OwenY" {
		t.Fatalf("clear avatar: %v", r.body)
	}

	p := call(t, app, http.MethodGet, "/users/1", owen, nil)
	expect(t, p, http.StatusOK, "")
	if p.body["id"] != owenID || p.body["email"] != nil {
		t.Fatalf("profile: %v", p.body)
	}
	expect(t, call(t, app, http.MethodGet, "/users/999", owen, nil), http.StatusNotFound, "NOT_FOUND")
}

func TestCommunityLifecycle(t *testing.T) {
	app, _ := setup(t)
	owen, _ := register(t, app, "Owen")
	zion, zionID := register(t, app, "Zion")
	sarah, sarahID := register(t, app, "Sarah")

	expect(t, call(t, app, http.MethodPost, "/communities", owen, map[string]string{"name": "  "}), http.StatusBadRequest, "VALIDATION_ERROR")

	created := call(t, app, http.MethodPost, "/communities", owen, map[string]string{"name": " Hackathon Team ", "description": "UNB", "visibility": "PRIVATE"})
	expect(t, created, http.StatusCreated, "")
	b := created.body
	if b["name"] != "Hackathon Team" || b["myRole"] != "ADMIN" || b["memberCount"] != float64(1) || b["openMarketCount"] != float64(0) {
		t.Fatalf("create: %v", b)
	}
	code, _ := b["inviteCode"].(string)
	if len(code) != 10 {
		t.Fatalf("invite code: %v", b["inviteCode"])
	}
	id := "/communities/1"

	// Non-members cannot see the community.
	expect(t, call(t, app, http.MethodGet, id, zion, nil), http.StatusForbidden, "FORBIDDEN")

	expect(t, call(t, app, http.MethodPost, "/communities/join", zion, map[string]string{"inviteCode": "NOPE"}), http.StatusNotFound, "INVALID_INVITE_CODE")
	joined := call(t, app, http.MethodPost, "/communities/join", zion, map[string]string{"inviteCode": " " + strings.ToLower(code) + " "})
	expect(t, joined, http.StatusOK, "")
	if joined.body["myRole"] != "MEMBER" || joined.body["inviteCode"] != nil || joined.body["memberCount"] != float64(2) {
		t.Fatalf("join: %v", joined.body)
	}
	expect(t, call(t, app, http.MethodPost, "/communities/join", zion, map[string]string{"inviteCode": code}), http.StatusConflict, "ALREADY_MEMBER")

	list := call(t, app, http.MethodGet, "/communities", zion, nil)
	expect(t, list, http.StatusOK, "")
	if len(list.list) != 1 {
		t.Fatalf("list: %v", list.list)
	}
	empty := call(t, app, http.MethodGet, "/communities", sarah, nil)
	if empty.status != http.StatusOK || empty.list == nil || len(empty.list) != 0 {
		t.Fatalf("empty list should be []: %d %v", empty.status, empty.list)
	}

	// Admin-only actions.
	expect(t, call(t, app, http.MethodPatch, id, zion, map[string]string{"name": "Mine"}), http.StatusForbidden, "FORBIDDEN")
	expect(t, call(t, app, http.MethodPost, id+"/invite-code", zion, nil), http.StatusForbidden, "FORBIDDEN")

	upd := call(t, app, http.MethodPatch, id, owen, map[string]any{"description": ""})
	expect(t, upd, http.StatusOK, "")
	if upd.body["name"] != "Hackathon Team" || upd.body["description"] != nil {
		t.Fatalf("update: %v", upd.body)
	}

	regen := call(t, app, http.MethodPost, id+"/invite-code", owen, nil)
	expect(t, regen, http.StatusOK, "")
	newCode := regen.body["inviteCode"].(string)
	if newCode == code {
		t.Fatal("invite code not replaced")
	}
	expect(t, call(t, app, http.MethodPost, "/communities/join", sarah, map[string]string{"inviteCode": code}), http.StatusNotFound, "INVALID_INVITE_CODE")
	expect(t, call(t, app, http.MethodPost, "/communities/join", sarah, map[string]string{"inviteCode": newCode}), http.StatusOK, "")

	members := call(t, app, http.MethodGet, id+"/members", zion, nil)
	expect(t, members, http.StatusOK, "")
	if len(members.list) != 3 || members.list[0].(map[string]any)["role"] != "ADMIN" {
		t.Fatalf("members: %v", members.list)
	}

	// Moderators can see the invite code but still cannot administer.
	zionPath := id + "/members/" + itoa(zionID)
	promoted := call(t, app, http.MethodPatch, zionPath, owen, map[string]string{"role": "MODERATOR"})
	expect(t, promoted, http.StatusOK, "")
	if promoted.body["role"] != "MODERATOR" {
		t.Fatalf("promote: %v", promoted.body)
	}
	if call(t, app, http.MethodGet, id, zion, nil).body["inviteCode"] != newCode {
		t.Fatal("moderator should see invite code")
	}
	expect(t, call(t, app, http.MethodPatch, zionPath, owen, map[string]string{"role": "OWNER"}), http.StatusBadRequest, "VALIDATION_ERROR")

	// The last admin can neither be demoted nor leave.
	owenPath := id + "/members/1"
	expect(t, call(t, app, http.MethodPatch, owenPath, owen, map[string]string{"role": "MEMBER"}), http.StatusForbidden, "FORBIDDEN")
	expect(t, call(t, app, http.MethodDelete, owenPath, owen, nil), http.StatusForbidden, "FORBIDDEN")

	// With a second admin, the original admin may leave.
	expect(t, call(t, app, http.MethodPatch, zionPath, owen, map[string]string{"role": "ADMIN"}), http.StatusOK, "")
	expect(t, call(t, app, http.MethodDelete, owenPath, owen, nil), http.StatusNoContent, "")
	expect(t, call(t, app, http.MethodGet, id, owen, nil), http.StatusForbidden, "FORBIDDEN")

	// Members may leave themselves but not remove others.
	sarahPath := id + "/members/" + itoa(sarahID)
	expect(t, call(t, app, http.MethodDelete, zionPath, sarah, nil), http.StatusForbidden, "FORBIDDEN")
	expect(t, call(t, app, http.MethodDelete, sarahPath, sarah, nil), http.StatusNoContent, "")
	expect(t, call(t, app, http.MethodDelete, sarahPath, zion, nil), http.StatusNotFound, "NOT_FOUND")
}

func itoa(f float64) string {
	b, _ := json.Marshal(int64(f))
	return string(b)
}
