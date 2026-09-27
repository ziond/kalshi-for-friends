// Package config loads and validates application configuration from the
// process environment.
package config

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
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
	InitialBalance int64

	// DailyBonusPoints are claimable once every DailyBonusInterval; the
	// first claim opens one interval after signup. Missed days don't stack.
	DailyBonusPoints   int64
	DailyBonusInterval time.Duration

	// PayoutGrace is how long after a moderator picks a winner the payout
	// waits; until then the market can only be nullified.
	PayoutGrace time.Duration
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
	// Keys come from env vars first (for hosts without key files, e.g.
	// Vercel), then from files. See normalizePEM for accepted formats.
	keyText, found, err := keyFromEnvOrFile("JWT_PRIVATE_KEY", "JWT_PRIVATE_KEY_FILE", "private.pem")
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errors.New("config: set JWT_PRIVATE_KEY, or create private.pem (or the file named by JWT_PRIVATE_KEY_FILE)")
	}
	key, err := ParseEd25519PrivateKey(keyText)
	if err != nil {
		return nil, fmt.Errorf("config: JWT_PRIVATE_KEY: %w", err)
	}
	cfg.JWTPrivateKey = key
	var publicText string
	publicText, found, err = keyFromEnvOrFile("JWT_PUBLIC_KEY", "JWT_PUBLIC_KEY_FILE", "public.pem")
	switch {
	case err != nil:
		return nil, err
	case !found:
		// No public key configured anywhere: derive it from the private key.
		cfg.JWTPublicKey = key.Public().(ed25519.PublicKey)
	default:
		cfg.JWTPublicKey, err = ParseEd25519PublicKey(publicText)
		if err != nil {
			return nil, fmt.Errorf("config: JWT_PUBLIC_KEY: %w", err)
		}
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
	cfg.DailyBonusPoints, err = strconv.ParseInt(getEnv("DAILY_BONUS_POINTS", "1000"), 10, 64)
	if err != nil || cfg.DailyBonusPoints <= 0 || cfg.DailyBonusPoints > 1000000 {
		return nil, errors.New("config: DAILY_BONUS_POINTS must be a whole number from 1 to 1000000")
	}
	hours, err := strconv.Atoi(getEnv("DAILY_BONUS_HOURS", "24"))
	if err != nil || hours < 1 || hours > 720 {
		return nil, errors.New("config: DAILY_BONUS_HOURS must be a whole number from 1 to 720")
	}
	cfg.DailyBonusInterval = time.Duration(hours) * time.Hour
	grace, err := strconv.Atoi(getEnv("PAYOUT_GRACE_MINUTES", "5"))
	if err != nil || grace < 1 || grace > 1440 {
		return nil, errors.New("config: PAYOUT_GRACE_MINUTES must be a whole number from 1 to 1440")
	}
	cfg.PayoutGrace = time.Duration(grace) * time.Minute

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

// keyFromEnvOrFile returns the PEM text in envVar, or else the contents of the
// file named by fileVar (default defaultFile). found is false only when
// envVar is empty, fileVar is unset and defaultFile doesn't exist; a file
// named explicitly in fileVar must be readable.
func keyFromEnvOrFile(envVar, fileVar, defaultFile string) (text string, found bool, err error) {
	if v := os.Getenv(envVar); v != "" {
		return v, true, nil
	}
	path, explicit := os.Getenv(fileVar), true
	if path == "" {
		path, explicit = defaultFile, false
	}
	data, err := os.ReadFile(path)
	if err == nil {
		return string(data), true, nil
	}
	if !explicit && os.IsNotExist(err) {
		return "", false, nil
	}
	return "", false, fmt.Errorf("config: set %s, or make %s (%s) readable", envVar, fileVar, path)
}

// normalizePEM accepts a PEM as stored in a file or pasted into an env var:
// real newlines, literal "\n" sequences (one-line .env values), wrapping
// quotes, or the whole PEM base64-encoded (e.g. `base64 -w0 private.pem`).
func normalizePEM(text string) string {
	text = strings.Trim(strings.TrimSpace(text), `"'`)
	if !strings.Contains(text, "-----BEGIN") {
		if decoded, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(text), "")); err == nil {
			text = string(decoded)
		}
	}
	return strings.ReplaceAll(strings.TrimSpace(text), `\n`, "\n")
}

// ParseEd25519PrivateKey decodes a PKCS#8 PEM key, e.g. from
// `openssl genpkey -algorithm ed25519`. Literal "\n" sequences are accepted
// so the key fits on one line in an env file.
func ParseEd25519PrivateKey(pemText string) (ed25519.PrivateKey, error) {
	pemText = normalizePEM(pemText)
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
	block, rest := pem.Decode([]byte(normalizePEM(text)))
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
