package config

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"net/url"
	"os"
	"testing"
	"time"
)

func setupConfig(t *testing.T) {
	t.Helper()
	t.Setenv("DEPOSITS_ENABLED", "")
	t.Setenv("FRONTEND_URL", "")
	t.Chdir(t.TempDir())
	for _, name := range []string{"JWT_PUBLIC_KEY", "JWT_PUBLIC_KEY_FILE", "ACCESS_TOKEN_TTL", "REFRESH_TOKEN_TTL"} {
		t.Setenv(name, "")
	}
	for _, name := range []string{"DATABASE_URL", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_SSLMODE", "JWT_PRIVATE_KEY", "JWT_PRIVATE_KEY_FILE", "HTTP_HOST", "PORT", "COOKIE_NAME", "COOKIE_DOMAIN", "COOKIE_SECURE", "COOKIE_SAME_SITE", "APP_ENV", "INITIAL_BALANCE", "SESSION_TTL", "CORS_ORIGINS", "PAYOUT_GRACE_MINUTES"} {
		t.Setenv(name, "")
	}
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("test.pem", pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("JWT_PRIVATE_KEY_FILE", "test.pem")
	publicDER, err := x509.MarshalPKIXPublicKey(key.Public())
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("public.pem", pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestAUTH15KeyPairValidation(t *testing.T) {
	setupConfig(t)
	t.Setenv("DB_PASSWORD", "test")
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
	public, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKIXPublicKey(public)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("JWT_PUBLIC_KEY", string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})))
	if _, err := Load(); err == nil {
		t.Fatal("mismatched key pair accepted")
	}
	t.Setenv("JWT_PUBLIC_KEY", "not PEM")
	if _, err := Load(); err == nil {
		t.Fatal("malformed key accepted")
	}
}

func TestFrontendOrigins(t *testing.T) {
	setupConfig(t)
	t.Setenv("DB_PASSWORD", "test")
	t.Setenv("FRONTEND_URL", "http://localhost:3000/")
	t.Setenv("CORS_ORIGINS", "http://localhost:3000, https://frontend.example")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.CORSOrigins) != 2 || cfg.CORSOrigins[0] != "http://localhost:3000" {
		t.Fatalf("unexpected origins: %v", cfg.CORSOrigins)
	}
	for _, invalid := range []string{"*", "https://*.example", "https://frontend.example/login", "https://user:pass@frontend.example", "https://frontend.example?x=1", "null"} {
		t.Setenv("FRONTEND_URL", invalid)
		if _, err := Load(); err == nil {
			t.Fatalf("accepted invalid origin: %s", invalid)
		}
	}
}

func TestLegacyDatabaseSettings(t *testing.T) {
	setupConfig(t)
	if _, err := Load(); err == nil {
		t.Fatal("missing database credentials accepted")
	}
	password := "p@ss:/?# with spaces"
	t.Setenv("DB_PASSWORD", password)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(cfg.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := u.User.Password()
	if got != password || u.Path != "/kalshi_for_friends" {
		t.Fatal("database settings not preserved")
	}
	if len(cfg.JWTPrivateKey) != ed25519.PrivateKeySize {
		t.Fatal("key file not loaded")
	}
	if cfg.HTTPHost != "127.0.0.1" {
		t.Fatal("unexpected bind default")
	}
	t.Setenv("PORT", "65536")
	if _, err := Load(); err == nil {
		t.Fatal("invalid port accepted")
	}
}

func TestDotEnvAndExplicitURL(t *testing.T) {
	setupConfig(t)
	// An empty-but-set env key intentionally overrides dotenv; remove it for this fixture.
	os.Unsetenv("DB_PASSWORD")
	if err := os.WriteFile(".env", []byte("DB_PASSWORD=local-test\nPORT=9000\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PORT", "8081")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8081" {
		t.Fatal("dotenv replaced environment")
	}
	t.Setenv("DATABASE_URL", "postgres://example@localhost/explicit")
	cfg, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DatabaseURL != "postgres://example@localhost/explicit" {
		t.Fatal("explicit URL did not take precedence")
	}
}

func TestRES16PayoutGraceMinutes(t *testing.T) {
	setupConfig(t)
	t.Setenv("DB_PASSWORD", "test")
	cfg, err := Load()
	if err != nil || cfg.PayoutGrace != 5*time.Minute {
		t.Fatalf("default grace = %v, %v; want 5m", cfg, err)
	}
	t.Setenv("PAYOUT_GRACE_MINUTES", "10")
	if cfg, err := Load(); err != nil || cfg.PayoutGrace != 10*time.Minute {
		t.Fatalf("grace = %v, %v; want 10m", cfg, err)
	}
	for _, bad := range []string{"0", "-5", "1.5", "five", "1441"} {
		t.Setenv("PAYOUT_GRACE_MINUTES", bad)
		if _, err := Load(); err == nil {
			t.Fatalf("PAYOUT_GRACE_MINUTES=%s accepted", bad)
		}
	}
}
