// Package users owns user profiles and the current-user (Me) view.
package users

import "time"

type UserSummary struct {
	ID        int64   `json:"id"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatarUrl"`
}

type UserStats struct {
	PredictionScore    int64   `json:"predictionScore"`
	TotalPredictions   int     `json:"totalPredictions"`
	CorrectPredictions int     `json:"correctPredictions"`
	Accuracy           float64 `json:"accuracy"`
}

type Me struct {
	UserSummary
	UserStats
	Email     string    `json:"email"`
	Balance   int64     `json:"balance"`
	// NextDailyBonusAt is when the next daily bonus can be claimed; claimable once past.
	NextDailyBonusAt time.Time `json:"nextDailyBonusAt"`
	CreatedAt        time.Time `json:"createdAt"`
}

type UserProfile struct {
	UserSummary
	UserStats
	CreatedAt time.Time `json:"createdAt"`
}

type UpdateMeRequest struct {
	Username  *string `json:"username"`
	AvatarURL *string `json:"avatarUrl"`
}

func accuracy(correct, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(correct) / float64(total)
}
