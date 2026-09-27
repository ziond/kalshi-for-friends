package auth

import (
	"context"
	"crypto/sha256"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
)

// RefreshStore stores hashes only. JWT access verification remains stateless.
type RefreshStore interface {
	Replace(context.Context, string, string, int64, time.Time) error
	Revoke(context.Context, string) error
}

type postgresRefreshStore struct{ pool *pgxpool.Pool }

func NewRefreshStore(pool *pgxpool.Pool) RefreshStore { return &postgresRefreshStore{pool} }

func (s *postgresRefreshStore) Replace(ctx context.Context, old, next string, userID int64, expires time.Time) error {
	return database.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		if old != "" {
			hash := sha256.Sum256([]byte(old))
			result, err := tx.Exec(ctx, `DELETE FROM refresh_tokens WHERE token_hash=$1 AND user_id=$2 AND expires_at > now()`, hash[:], userID)
			if err != nil {
				return err
			}
			if result.RowsAffected() != 1 {
				return apperror.Unauthorized("Refresh token is expired, revoked, or already used")
			}
		}
		hash := sha256.Sum256([]byte(next))
		_, err := tx.Exec(ctx, `INSERT INTO refresh_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, hash[:], userID, expires)
		return err
	})
}

func (s *postgresRefreshStore) Revoke(ctx context.Context, token string) error {
	hash := sha256.Sum256([]byte(token))
	_, err := s.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE token_hash=$1`, hash[:])
	return err
}
