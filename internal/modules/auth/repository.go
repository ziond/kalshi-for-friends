package auth

import (
	"context"
	"time"

	"github.com/ziond/kalshi-for-friends/backend/internal/database"
)

func insertUser(ctx context.Context, db database.DBTX, username, email, passwordHash string) (int64, error) {
	const q = `
		INSERT INTO users (username, email, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id`
	var id int64
	err := db.QueryRow(ctx, q, username, email, passwordHash).Scan(&id)
	return id, err
}

// openWalletWithInitialBonus creates the user's wallet holding the starting
// grant and its matching INITIAL_BONUS ledger entry. The first daily bonus
// opens one interval after signup. Must run in the same
// transaction as insertUser. Wallets and the ledger are owned by the points
// and transactions modules; move this there once those repositories exist.
func openWalletWithInitialBonus(ctx context.Context, db database.DBTX, userID, amount int64, dailyBonusInterval time.Duration) error {
	if _, err := db.Exec(ctx,
		`INSERT INTO wallets (user_id, balance, next_daily_bonus_at) VALUES ($1, $2, now() + $3::interval)`,
		userID, amount, dailyBonusInterval,
	); err != nil {
		return err
	}
	_, err := db.Exec(ctx, `
		INSERT INTO transactions (user_id, amount, transaction_type, balance_after)
		VALUES ($1, $2, 'INITIAL_BONUS', $2)`,
		userID, amount,
	)
	return err
}

func findCredentialsByEmail(ctx context.Context, db database.DBTX, email string) (id int64, passwordHash string, err error) {
	err = db.QueryRow(ctx,
		`SELECT id, password_hash FROM users WHERE lower(email) = lower($1)`,
		email,
	).Scan(&id, &passwordHash)
	return id, passwordHash, err
}
