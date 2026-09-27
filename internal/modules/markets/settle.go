package markets

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/settlement"
)

// Lifecycle: LOCKED → (pick) PAYOUT_PENDING → (payout_at) RESOLVED.
// LOCKED or PAYOUT_PENDING → (nullify) CANCELLED. The pick is final; every
// transition locks the market row first, so a payout and a nullify never both happen.

var errAlreadyPicked = apperror.New(409, "MARKET_CLOSED", "A winner has already been picked. You can only nullify this market")

// Resolve picks the winner and starts the grace period. No coins move.
func (a *API) Resolve(c *fiber.Ctx) error {
	id, err := pathID(c)
	if err != nil {
		return err
	}
	var req struct {
		Winning int64   `json:"winningOptionId"`
		Notes   *string `json:"notes"`
	}
	if len(c.Body()) > 0 && c.BodyParser(&req) != nil {
		return invalid("body", "Expected valid JSON")
	}
	var result json.RawMessage
	user := middleware.UserID(c)
	err = database.WithTx(c.UserContext(), a.Pool, func(tx pgx.Tx) error {
		status, ended, err := lockForModerator(c.UserContext(), tx, id, user)
		if err != nil {
			return err
		}
		if status == "PAYOUT_PENDING" {
			return errAlreadyPicked
		}
		if !ended || status == "RESOLVED" || status == "CANCELLED" {
			return apperror.New(409, "MARKET_CLOSED", "Only a locked, unsettled market can be settled")
		}
		// Betting closed at the deadline, so the pool recorded here is final.
		var exists bool
		var total, win int64
		if err := tx.QueryRow(c.UserContext(), `SELECT bool_or(id=$2),COALESCE(sum(total_amount),0),COALESCE(sum(total_amount) FILTER(WHERE id=$2),0) FROM market_options WHERE market_id=$1`, id, req.Winning).Scan(&exists, &total, &win); err != nil {
			return err
		}
		if !exists {
			return invalid("winningOptionId", "Choose an option in this market")
		}
		mode := "PAYOUT"
		if win == 0 {
			mode = "NO_WINNERS_REFUND"
		}
		if _, err := tx.Exec(c.UserContext(), `INSERT INTO settlements(market_id,winning_option_id,resolved_by,notes,total_pool,winning_pool,settlement_mode,resolved_at,payout_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()+make_interval(secs=>$8))`, id, req.Winning, user, req.Notes, total, win, mode, a.PayoutGrace.Seconds()); err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `UPDATE markets SET status='PAYOUT_PENDING',updated_at=now() WHERE id=$1`, id); err != nil {
			return err
		}
		result, err = marketJSON(c.UserContext(), tx, id, user)
		return err
	})
	if err != nil {
		return err
	}
	return c.JSON(result)
}

// Cancel ("Nullify") refunds every bet. Allowed until the payout, then final.
func (a *API) Cancel(c *fiber.Ctx) error {
	id, err := pathID(c)
	if err != nil {
		return err
	}
	var req struct {
		Reason *string `json:"reason"`
	}
	if len(c.Body()) > 0 && c.BodyParser(&req) != nil {
		return invalid("body", "Expected valid JSON")
	}
	// A payout that is already due happens first, so the nullify below sees RESOLVED.
	if err := payout(c.UserContext(), a.Pool, id); err != nil {
		return err
	}
	var result json.RawMessage
	user := middleware.UserID(c)
	err = database.WithTx(c.UserContext(), a.Pool, func(tx pgx.Tx) error {
		status, ended, err := lockForModerator(c.UserContext(), tx, id, user)
		if err != nil {
			return err
		}
		if !ended || status == "RESOLVED" || status == "CANCELLED" {
			return apperror.New(409, "MARKET_CLOSED", "Only a locked, unsettled market can be settled")
		}
		if status == "PAYOUT_PENDING" {
			var due bool
			if err := tx.QueryRow(c.UserContext(), `DELETE FROM settlements WHERE market_id=$1 RETURNING payout_at<=clock_timestamp()`, id).Scan(&due); err != nil {
				return err
			}
			if due { // payout_at passed after the payout above; the payout wins
				return apperror.New(409, "MARKET_CLOSED", "Payouts have already gone out")
			}
		}
		if err := distribute(c.UserContext(), tx, id, 0, true); err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `UPDATE markets SET status='CANCELLED',cancelled_by=$2,cancelled_at=now(),cancellation_reason=$3,updated_at=now() WHERE id=$1`, id, user, req.Reason); err != nil {
			return err
		}
		result, err = marketJSON(c.UserContext(), tx, id, user)
		return err
	})
	if err != nil {
		return err
	}
	return c.JSON(result)
}

// lockForModerator locks the market row and checks the caller may settle it.
func lockForModerator(ctx context.Context, tx pgx.Tx, id, user int64) (status string, ended bool, err error) {
	var community, moderator int64
	if err := tx.QueryRow(ctx, `SELECT community_id,moderator_id,status,deadline<=clock_timestamp() FROM markets WHERE id=$1 FOR UPDATE`, id).Scan(&community, &moderator, &status, &ended); err != nil {
		if database.IsNoRows(err) {
			return "", false, apperror.NotFound("Market not found")
		}
		return "", false, err
	}
	var allowed bool
	if err := tx.QueryRow(ctx, `SELECT CASE WHEN visibility='PUBLIC' THEN EXISTS(SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2 AND role IN ('ADMIN','MODERATOR')) ELSE $2=$3 END FROM communities WHERE id=$1`, community, user, moderator).Scan(&allowed); err != nil {
		return "", false, err
	}
	if !allowed {
		return "", false, apperror.Forbidden("Only the market moderator may settle it")
	}
	return status, ended, nil
}

// PayDue pays out every market whose grace period has ended. It is safe to
// run concurrently and repeatedly: each payout re-checks under the row lock.
func PayDue(ctx context.Context, pool *pgxpool.Pool) error {
	rows, err := pool.Query(ctx, `SELECT market_id FROM settlements WHERE paid_out_at IS NULL AND payout_at<=clock_timestamp() ORDER BY payout_at,market_id LIMIT 100`)
	if err != nil {
		return err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return err
	}
	var errs []error
	for _, id := range ids {
		if err := payout(ctx, pool, id); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// PayDueOnRead applies overdue payouts before a read, in case the job is late,
// so balances and statuses are current at payoutAt. Failures are logged and
// retried by the job rather than failing the read.
func (a *API) PayDueOnRead(c *fiber.Ctx) error {
	if err := PayDue(c.UserContext(), a.Pool); err != nil {
		log.Printf("payout on read: %v", err)
	}
	return c.Next()
}

// RunPayoutJob calls PayDue every interval until ctx is cancelled.
func RunPayoutJob(ctx context.Context, pool *pgxpool.Pool, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		if err := PayDue(ctx, pool); err != nil && ctx.Err() == nil {
			log.Printf("payout job: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// payout settles one market if it is still PAYOUT_PENDING and payout_at has passed.
func payout(ctx context.Context, pool *pgxpool.Pool, id int64) error {
	return database.WithTx(ctx, pool, func(tx pgx.Tx) error {
		var status string
		if err := tx.QueryRow(ctx, `SELECT status FROM markets WHERE id=$1 FOR UPDATE`, id).Scan(&status); err != nil {
			if database.IsNoRows(err) {
				return nil
			}
			return err
		}
		if status != "PAYOUT_PENDING" {
			return nil
		}
		var winning int64
		var due bool
		if err := tx.QueryRow(ctx, `SELECT winning_option_id,payout_at<=clock_timestamp() FROM settlements WHERE market_id=$1`, id).Scan(&winning, &due); err != nil {
			return err
		}
		if !due {
			return nil
		}
		if err := distribute(ctx, tx, id, winning, false); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE settlements SET paid_out_at=clock_timestamp() WHERE market_id=$1`, id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE markets SET status='RESOLVED',updated_at=now() WHERE id=$1`, id)
		return err
	})
}

// distribute settles every position: pays winners (or refunds everyone on a
// cancel or when nobody backed the winner) and updates prediction stats.
// The caller holds the market row lock.
func distribute(ctx context.Context, tx pgx.Tx, id, winning int64, cancel bool) error {
	rows, err := tx.Query(ctx, `SELECT id,user_id,option_id,amount FROM positions WHERE market_id=$1 ORDER BY user_id,id`, id)
	if err != nil {
		return err
	}
	stakes := []settlement.Stake{}
	for rows.Next() {
		var s settlement.Stake
		if err := rows.Scan(&s.ID, &s.UserID, &s.OptionID, &s.Amount); err != nil {
			rows.Close()
			return err
		}
		stakes = append(stakes, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	payouts, refund, err := settlement.Payouts(stakes, winning, cancel)
	if err != nil {
		return err
	}
	// Wallet locks are always acquired in user-ID order across all settlements.
	balances := map[int64]int64{}
	for _, s := range stakes {
		if _, ok := balances[s.UserID]; !ok {
			var balance int64
			if err := tx.QueryRow(ctx, `SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, s.UserID).Scan(&balance); err != nil {
				return err
			}
			balances[s.UserID] = balance
		}
	}
	winners := map[int64]bool{}
	for _, s := range stakes {
		payout := payouts[s.ID]
		state, kind := "LOST", "LOSS"
		if refund {
			state, kind = "REFUNDED", "REFUND"
		} else if s.OptionID == winning {
			state, kind = "WON", "WIN_REWARD"
			winners[s.UserID] = true
		}
		if balances[s.UserID] > 9007199254740991-payout {
			return invalid("balance", "Payout would exceed wallet limit")
		}
		balances[s.UserID] += payout
		if _, err := tx.Exec(ctx, `UPDATE positions SET result=$2,payout=$3,settled_at=now() WHERE id=$1`, s.ID, state, payout); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1`, s.UserID, balances[s.UserID]); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO transactions(user_id,amount,transaction_type,balance_after,position_id) VALUES($1,$2,$3,$4,$5)`, s.UserID, payout, kind, balances[s.UserID], s.ID); err != nil {
			return err
		}
	}
	if !refund {
		for user := range balances {
			correct := 0
			if winners[user] {
				correct = 1
			}
			if _, err := tx.Exec(ctx, `UPDATE users SET
                    prediction_score=calculate_prediction_score(correct_predictions+$2,total_predictions+1),
                    total_predictions=total_predictions+1,
                    correct_predictions=correct_predictions+$2,updated_at=now() WHERE id=$1`, user, correct); err != nil {
				return err
			}
		}
	}
	return nil
}
