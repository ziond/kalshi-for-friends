package points

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
	"time"
)

type Wallet struct {
	Balance   int64     `json:"balance"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type API struct {
	Pool            *pgxpool.Pool
	DepositsEnabled bool
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
func (a *API) Deposit(c *fiber.Ctx) error {
	if !a.DepositsEnabled {
		return apperror.Forbidden("Demo deposits are disabled")
	}
	var req struct {
		Amount int64 `json:"amount"`
	}
	if err := c.BodyParser(&req); err != nil || req.Amount < 1 || req.Amount > 1000000 {
		return apperror.Validation("Invalid deposit", map[string]string{"amount": "Enter a whole number from 1 to 1,000,000"})
	}
	var w Wallet
	err := database.WithTx(c.UserContext(), a.Pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(c.UserContext(), `UPDATE wallets SET balance=balance+$2,updated_at=now() WHERE user_id=$1 AND balance <= 9007199254740991-$2 RETURNING balance,updated_at`, middleware.UserID(c), req.Amount).Scan(&w.Balance, &w.UpdatedAt)
		if database.IsNoRows(err) {
			return apperror.Validation("Balance limit reached", map[string]string{"amount": "Would exceed the maximum balance"})
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(c.UserContext(), `INSERT INTO transactions(user_id,amount,transaction_type,balance_after) VALUES($1,$2,'DEPOSIT',$3)`, middleware.UserID(c), req.Amount, w.Balance)
		return err
	})
	if err != nil {
		return err
	}
	return c.JSON(w)
}
