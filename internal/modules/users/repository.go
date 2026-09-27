package users

import (
	"context"

	"github.com/ziond/kalshi-for-friends/backend/internal/database"
)

// GetMe joins the user's wallet so the navbar needs a single call. Returns
// pgx.ErrNoRows if the user (or their wallet) does not exist.
func GetMe(ctx context.Context, db database.DBTX, userID int64) (*Me, error) {
	const q = `
		SELECT u.id, u.username, u.avatar_url, u.email,
		       u.prediction_score, u.total_predictions, u.correct_predictions,
		       w.balance, u.created_at
		FROM users u
		JOIN wallets w ON w.user_id = u.id
		WHERE u.id = $1`
	var m Me
	err := db.QueryRow(ctx, q, userID).Scan(
		&m.ID, &m.Username, &m.AvatarURL, &m.Email,
		&m.PredictionScore, &m.TotalPredictions, &m.CorrectPredictions,
		&m.Balance, &m.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	m.Accuracy = accuracy(m.CorrectPredictions, m.TotalPredictions)
	m.CreatedAt = m.CreatedAt.UTC()
	return &m, nil
}

func GetProfile(ctx context.Context, db database.DBTX, userID int64) (*UserProfile, error) {
	const q = `
		SELECT id, username, avatar_url,
		       prediction_score, total_predictions, correct_predictions, created_at
		FROM users
		WHERE id = $1`
	var p UserProfile
	err := db.QueryRow(ctx, q, userID).Scan(
		&p.ID, &p.Username, &p.AvatarURL,
		&p.PredictionScore, &p.TotalPredictions, &p.CorrectPredictions, &p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	p.Accuracy = accuracy(p.CorrectPredictions, p.TotalPredictions)
	p.CreatedAt = p.CreatedAt.UTC()
	return &p, nil
}

// UpdateProfile changes only the fields whose set flag is true. A nil
// avatarURL with setAvatar=true clears the avatar.
func UpdateProfile(ctx context.Context, db database.DBTX, userID int64,
	setUsername bool, username string, setAvatar bool, avatarURL *string) error {
	const q = `
		UPDATE users
		SET username   = CASE WHEN $2 THEN $3 ELSE username END,
		    avatar_url = CASE WHEN $4 THEN $5 ELSE avatar_url END,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`
	_, err := db.Exec(ctx, q, userID, setUsername, username, setAvatar, avatarURL)
	return err
}
