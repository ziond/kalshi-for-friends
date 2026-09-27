package auth

import (
	"crypto/ed25519"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/config"
)

func generateJWT(userID int64, key ed25519.PrivateKey, duration time.Duration, kind string) (string, *time.Time, error) {
	iat := time.Now().Unix()
	exp := time.Now().Add(duration).Unix()

	claims := jwt.MapClaims{
		"user_id":    userID,
		"token_type": kind,
		"exp":        exp,
		"iat":        iat,
		"jti":        uuid.New().String(),
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
	}, jwt.WithExpirationRequired(), jwt.WithIssuedAt(), jwt.WithValidMethods([]string{"EdDSA"}))

	if err != nil {
		return nil, err
	}
	if issued, err := claims.GetIssuedAt(); err != nil || issued == nil {
		return nil, apperror.Unauthorized("missing or invalid issued-at claim")
	}

	return claims, nil
}

// NewVerifier returns the session verifier used by middleware.RequireAuth.
func NewVerifier(cfg *config.Config) func(token string) (int64, error) {
	return verifier(cfg, "access")
}

func verifier(cfg *config.Config, kind string) func(string) (int64, error) {
	return func(token string) (int64, error) {
		claims, err := parseClaims(token, cfg)
		if err != nil {
			return 0, err
		}
		sub, ok := claims["user_id"].(float64)
		if !ok || sub < 1 || sub > 9007199254740991 || sub != float64(int64(sub)) || claims["token_type"] != kind {
			return 0, apperror.Unauthorized("invalid subject")
		}
		return int64(sub), nil
	}
}
