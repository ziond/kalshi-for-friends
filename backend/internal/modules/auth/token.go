package auth

import (
	"crypto/ed25519"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/config"
)

func generateJWT(userID int64, key ed25519.PrivateKey, duration time.Duration) (string, *time.Time, error) {
	iat := time.Now().Unix()
	exp := time.Now().Add(duration).Unix()

	claims := jwt.MapClaims{
		"sub": userID,
		"exp": exp,
		"iat": iat,
		"jti": uuid.New().String(),
	}

	token := jwt.NewWithClaims(&jwt.SigningMethodEd25519{}, claims)

	tokenString, err := token.SignedString(key)
	if err != nil {
		return "", nil, err
	}

	expiresAt := time.Unix(exp, 0)

	return tokenString, &expiresAt, nil
}

func parseClaims(token string, cfg *config.Config) (jwt.MapClaims, error) {
	claims := jwt.MapClaims{}

	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodEd25519); !ok {
			return nil, apperror.Unauthorized("unexpected signing method")
		}

		return cfg.JWTPublicKey, nil
	}, jwt.WithExpirationRequired())

	if err != nil {
		return nil, err
	}

	return claims, nil
}

// NewVerifier returns the session verifier used by middleware.RequireAuth.
func NewVerifier(cfg *config.Config) func(token string) (int64, error) {
	return func(token string) (int64, error) {
		claims, err := parseClaims(token, cfg)
		if err != nil {
			return 0, err
		}
		// sub is signed as a JSON number, which decodes as float64.
		sub, ok := claims["sub"].(float64)
		if !ok || sub < 1 || sub != float64(int64(sub)) {
			return 0, apperror.Unauthorized("invalid subject")
		}
		return int64(sub), nil
	}
}
