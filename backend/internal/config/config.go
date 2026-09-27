// Package config loads and validates application configuration from the
// process environment.
package config

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Env      string
	Port     string
	HTTPHost string

	DatabaseURL string

	JWTPrivateKey  ed25519.PrivateKey
	JWTPublicKey   ed25519.PublicKey
	SessionTTL     time.Duration
	RefreshTTL     time.Duration
	CookieName     string
	CookieDomain   string
	CookieSecure   bool
	CookieSameSite string

	// CORSOrigins is empty when the frontend reaches the API same-origin
	// (e.g. through Next.js server components or a proxy).
	CORSOrigins []string

	// InitialBalance is granted through an INITIAL_BONUS ledger entry at
	// registration, never through a wallet column default.
	InitialBalance  int64
	DepositsEnabled bool
}

func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		return nil, errors.New("config: cannot load .env; check its syntax and permissions")
	}
	cfg := &Config{
		Env:            getEnv("APP_ENV", "development"),
		Port:           getEnv("PORT", "8080"),
		HTTPHost:       getEnv("HTTP_HOST", "127.0.0.1"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		CookieName:     "access_token",
		CookieDomain:   os.Getenv("COOKIE_DOMAIN"),
		CookieSameSite: getEnv("COOKIE_SAME_SITE", "Lax"),
	}

	port, err := strconv.Atoi(cfg.Port)
	if err != nil || port < 1 || port > 65535 {
		return nil, errors.New("config: PORT must be between 1 and 65535")
	}
	if cfg.DatabaseURL == "" {
		cfg.DatabaseURL, err = databaseURLFromFields()
		if err != nil {
			return nil, err
		}
	}
	keyText := os.Getenv("JWT_PRIVATE_KEY")
	if keyText == "" {
		keyData, readErr := os.ReadFile(getEnv("JWT_PRIVATE_KEY_FILE", "private.pem"))
		if readErr != nil {
			return nil, errors.New("config: set JWT_PRIVATE_KEY or create the JWT_PRIVATE_KEY_FILE")
		}
		keyText = string(keyData)
	}
	key, err := ParseEd25519PrivateKey(keyText)
	if err != nil {
		return nil, fmt.Errorf("config: JWT_PRIVATE_KEY: %w", err)
	}
	cfg.JWTPrivateKey = key
	publicText := os.Getenv("JWT_PUBLIC_KEY")
	if publicText == "" {
		data, err := os.ReadFile(getEnv("JWT_PUBLIC_KEY_FILE", "public.pem"))
		if err != nil {
			return nil, errors.New("config: cannot read JWT_PUBLIC_KEY_FILE")
		}
		publicText = string(data)
	}
	cfg.JWTPublicKey, err = ParseEd25519PublicKey(publicText)
	if err != nil {
		return nil, fmt.Errorf("config: JWT_PUBLIC_KEY: %w", err)
	}
	if !key.Public().(ed25519.PublicKey).Equal(cfg.JWTPublicKey) {
		return nil, errors.New("config: JWT public and private keys do not match")
	}

	ttl, err := time.ParseDuration(getEnv("ACCESS_TOKEN_TTL", "15m"))
	if err != nil || ttl <= 0 {
		return nil, fmt.Errorf("config: invalid ACCESS_TOKEN_TTL")
	}
	cfg.SessionTTL = ttl
	cfg.RefreshTTL, err = time.ParseDuration(getEnv("REFRESH_TOKEN_TTL", "168h"))
	if err != nil || cfg.RefreshTTL <= cfg.SessionTTL {
		return nil, errors.New("config: REFRESH_TOKEN_TTL must exceed ACCESS_TOKEN_TTL")
	}

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
	cfg.DepositsEnabled, err = strconv.ParseBool(getEnv("DEPOSITS_ENABLED", "true"))
	if err != nil {
		return nil, errors.New("config: invalid DEPOSITS_ENABLED")
	}

	seenOrigins := map[string]bool{}
	origins := append([]string{os.Getenv("FRONTEND_URL")}, strings.Split(os.Getenv("CORS_ORIGINS"), ",")...)
	for _, origin := range origins {
		origin = strings.TrimSpace(origin)
		if origin == "" {
			continue
		}
		u, err := url.Parse(origin)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.ContainsAny(origin, "*#") {
			return nil, errors.New("config: FRONTEND_URL and CORS_ORIGINS must be exact HTTP(S) origins without paths, credentials, queries, fragments, or wildcards")
		}
		origin = u.Scheme + "://" + u.Host
		if !seenOrigins[origin] {
			cfg.CORSOrigins = append(cfg.CORSOrigins, origin)
			seenOrigins[origin] = true
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

// ParseEd25519PublicKey loads the SPKI PEM shared with the frontend.
func ParseEd25519PublicKey(text string) (ed25519.PublicKey, error) {
	block, rest := pem.Decode([]byte(strings.ReplaceAll(strings.TrimSpace(text), `\n`, "\n")))
	if block == nil || block.Type != "PUBLIC KEY" || len(strings.TrimSpace(string(rest))) != 0 {
		return nil, errors.New("expected one SPKI PUBLIC KEY PEM block")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, errors.New("invalid SPKI public key")
	}
	key, ok := parsed.(ed25519.PublicKey)
	if !ok {
		return nil, errors.New("not an Ed25519 public key")
	}
	return key, nil
}

func databaseURLFromFields() (string, error) {
	password := os.Getenv("DB_PASSWORD")
	if password == "" {
		return "", errors.New("config: DATABASE_URL or DB_PASSWORD is required")
	}
	port := getEnv("DB_PORT", "5432")
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return "", errors.New("config: DB_PORT must be between 1 and 65535")
	}
	sslMode := getEnv("DB_SSLMODE", "disable")
	switch sslMode {
	case "disable", "require", "verify-ca", "verify-full":
	default:
		return "", errors.New("config: invalid DB_SSLMODE")
	}
	u := url.URL{Scheme: "postgres", Host: net.JoinHostPort(getEnv("DB_HOST", "localhost"), port),
		User: url.UserPassword(getEnv("DB_USER", "kalshi_app"), password), Path: "/" + getEnv("DB_NAME", "kalshi_for_friends")}
	u.RawQuery = url.Values{"sslmode": {sslMode}, "connect_timeout": {"5"}}.Encode()
	return u.String(), nil
}
