// Package config loads and validates application configuration from the
// process environment.
package config

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env  string
	Port string

	DatabaseURL string

	JWTPrivateKey  ed25519.PrivateKey
	JWTPublicKey   ed25519.PublicKey
	SessionTTL     time.Duration
	CookieName     string
	CookieDomain   string
	CookieSecure   bool
	CookieSameSite string

	// CORSOrigins is empty when the frontend reaches the API same-origin
	// (e.g. through Next.js server components or a proxy).
	CORSOrigins []string

	// InitialBalance is granted through an INITIAL_BONUS ledger entry at
	// registration, never through a wallet column default.
	InitialBalance int64
}

func Load() (*Config, error) {
	cfg := &Config{
		Env:            getEnv("APP_ENV", "development"),
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		CookieName:     getEnv("COOKIE_NAME", "oracle_session"),
		CookieDomain:   os.Getenv("COOKIE_DOMAIN"),
		CookieSameSite: getEnv("COOKIE_SAME_SITE", "Lax"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}
	key, err := ParseEd25519PrivateKey(os.Getenv("JWT_PRIVATE_KEY"))
	if err != nil {
		return nil, fmt.Errorf("config: JWT_PRIVATE_KEY: %w", err)
	}
	cfg.JWTPrivateKey = key
	cfg.JWTPublicKey = key.Public().(ed25519.PublicKey)

	ttl, err := time.ParseDuration(getEnv("SESSION_TTL", "168h"))
	if err != nil || ttl <= 0 {
		return nil, fmt.Errorf("config: invalid SESSION_TTL")
	}
	cfg.SessionTTL = ttl

	secure, err := strconv.ParseBool(getEnv("COOKIE_SECURE", strconv.FormatBool(cfg.Env == "production")))
	if err != nil {
		return nil, fmt.Errorf("config: invalid COOKIE_SECURE: %w", err)
	}
	cfg.CookieSecure = secure

	switch cfg.CookieSameSite {
	case "Lax", "Strict", "None":
	default:
		return nil, fmt.Errorf("config: COOKIE_SAME_SITE must be Lax, Strict, or None")
	}
	if cfg.CookieSameSite == "None" && !cfg.CookieSecure {
		return nil, fmt.Errorf("config: COOKIE_SAME_SITE=None requires COOKIE_SECURE=true")
	}

	balance, err := strconv.ParseInt(getEnv("INITIAL_BALANCE", "1000"), 10, 64)
	if err != nil || balance <= 0 || balance > 9007199254740991 {
		return nil, fmt.Errorf("config: INITIAL_BALANCE must be a positive safe integer")
	}
	cfg.InitialBalance = balance

	for _, origin := range strings.Split(os.Getenv("CORS_ORIGINS"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			cfg.CORSOrigins = append(cfg.CORSOrigins, origin)
		}
	}

	return cfg, nil
}

// ParseEd25519PrivateKey decodes a PKCS#8 PEM key, e.g. from
// `openssl genpkey -algorithm ed25519`. Literal "\n" sequences are accepted
// so the key fits on one line in an env file.
func ParseEd25519PrivateKey(pemText string) (ed25519.PrivateKey, error) {
	pemText = strings.ReplaceAll(strings.TrimSpace(pemText), `\n`, "\n")
	if pemText == "" {
		return nil, errors.New("required")
	}
	block, _ := pem.Decode([]byte(pemText))
	if block == nil {
		return nil, errors.New("not a PEM block")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(ed25519.PrivateKey)
	if !ok {
		return nil, errors.New("not an Ed25519 key")
	}
	return key, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
