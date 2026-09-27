package points

import (
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
	"strconv"
	"time"
)

type Wallet struct {
	Balance   int64     `json:"balance"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type DailyBonusResponse struct {
	Amount           int64     `json:"amount"`
	Balance          int64     `json:"balance"`
	NextDailyBonusAt time.Time `json:"nextDailyBonusAt"`
}
type API struct {
	Pool               *pgxpool.Pool
	DailyBonusPoints   int64
	DailyBonusInterval time.Duration
}

func (a *API) Get(c *fiber.Ctx) error {
	var w Wallet
	err := a.Pool.QueryRow(c.UserContext(), `SELECT balance,updated_at FROM wallets WHERE user_id=$1`, middleware.UserID(c)).Scan(&w.Balance, &w.UpdatedAt)
	if database.IsNoRows(err) {
		return apperror.NotFound("Wallet not found")
	}
	if err != nil {
		return err
	}
	return c.JSON(w)
}
// DailyBonus credits DailyBonusPoints when the caller's timer has passed and
// restarts it from now, so missed days never stack. The due check and the
// credit are one conditional UPDATE: double clicks and parallel requests pay once.
func (a *API) DailyBonus(c *fiber.Ctx) error {
	ctx, userID := c.UserContext(), middleware.UserID(c)
	var res DailyBonusResponse
	err := database.WithTx(ctx, a.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `UPDATE wallets SET balance=balance+$2, next_daily_bonus_at=now()+$3::interval, updated_at=now()
 WHERE user_id=$1 AND next_daily_bonus_at<=now() AND balance<=9007199254740991-$2
 RETURNING balance, next_daily_bonus_at`, userID, a.DailyBonusPoints, a.DailyBonusInterval).Scan(&res.Balance, &res.NextDailyBonusAt)
		if database.IsNoRows(err) {
			return a.notReady(c, tx)
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO transactions(user_id,amount,transaction_type,balance_after) VALUES($1,$2,'DAILY_BONUS',$3)`, userID, a.DailyBonusPoints, res.Balance)
		return err
	})
	if err != nil {
		return err
	}
	res.Amount = a.DailyBonusPoints
	res.NextDailyBonusAt = res.NextDailyBonusAt.UTC()
	return c.JSON(res)
}

// notReady explains why nothing was credited.
func (a *API) notReady(c *fiber.Ctx, tx pgx.Tx) error {
	var wait time.Duration
	err := tx.QueryRow(c.UserContext(), `SELECT GREATEST(next_daily_bonus_at-now(), interval '0') FROM wallets WHERE user_id=$1`, middleware.UserID(c)).Scan(&wait)
	if database.IsNoRows(err) {
		return apperror.NotFound("Wallet not found")
	}
	if err != nil {
		return err
	}
	if wait == 0 {
		return apperror.Validation("Balance limit reached", map[string]string{"balance": "Would exceed the maximum balance"})
	}
	return apperror.New(409, "DAILY_BONUS_NOT_READY", fmt.Sprintf("Your next %s points are ready in %s", groupThousands(a.DailyBonusPoints), waitText(wait)))
}

// waitText rounds up to the minute: "5h 12m", "45m", "1m".
func waitText(d time.Duration) string {
	mins := int64((d + time.Minute - 1) / time.Minute)
	if mins < 1 {
		mins = 1
	}
	if mins < 60 {
		return fmt.Sprintf("%dm", mins)
	}
	return fmt.Sprintf("%dh %dm", mins/60, mins%60)
}

// groupThousands formats 1000 as "1,000".
func groupThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}
