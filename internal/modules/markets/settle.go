package markets

import (
	"encoding/json"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/settlement"
)

func (a *API) Resolve(c *fiber.Ctx) error { return a.settle(c, false) }
func (a *API) Cancel(c *fiber.Ctx) error  { return a.settle(c, true) }
func (a *API) settle(c *fiber.Ctx, cancel bool) error {
	id, err := pathID(c)
	if err != nil {
		return err
	}
	var req struct {
		Winning int64   `json:"winningOptionId"`
		Notes   *string `json:"notes"`
		Reason  *string `json:"reason"`
	}
	if len(c.Body()) > 0 && c.BodyParser(&req) != nil {
		return invalid("body", "Expected valid JSON")
	}
	var result json.RawMessage
	user := middleware.UserID(c)
	err = database.WithTx(c.UserContext(), a.Pool, func(tx pgx.Tx) error {
		var community, moderator int64
		var status string
		var ended bool
		if err := tx.QueryRow(c.UserContext(), `SELECT community_id,moderator_id,status,deadline<=clock_timestamp() FROM markets WHERE id=$1 FOR UPDATE`, id).Scan(&community, &moderator, &status, &ended); err != nil {
			if database.IsNoRows(err) {
				return apperror.NotFound("Market not found")
			}
			return err
		}
		var allowed bool
		if err := tx.QueryRow(c.UserContext(), `SELECT CASE WHEN visibility='PUBLIC' THEN EXISTS(SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2 AND role IN ('ADMIN','MODERATOR')) ELSE $2=$3 END FROM communities WHERE id=$1`, community, user, moderator).Scan(&allowed); err != nil {
			return err
		}
		if !allowed {
			return apperror.Forbidden("Only the market moderator may settle it")
		}
		if !ended || status == "RESOLVED" || status == "CANCELLED" {
			return apperror.New(409, "MARKET_CLOSED", "Only a locked, unsettled market can be settled")
		}
		if !cancel {
			var exists bool
			if err := tx.QueryRow(c.UserContext(), `SELECT EXISTS(SELECT 1 FROM market_options WHERE market_id=$1 AND id=$2)`, id, req.Winning).Scan(&exists); err != nil {
				return err
			}
			if !exists {
				return invalid("winningOptionId", "Choose an option in this market")
			}
		}
		rows, err := tx.Query(c.UserContext(), `SELECT id,user_id,option_id,amount FROM positions WHERE market_id=$1 ORDER BY user_id,id`, id)
		if err != nil {
			return err
		}
		stakes := []settlement.Stake{}
		var total, win int64
		for rows.Next() {
			var s settlement.Stake
			if err := rows.Scan(&s.ID, &s.UserID, &s.OptionID, &s.Amount); err != nil {
				rows.Close()
				return err
			}
			stakes = append(stakes, s)
			total += s.Amount
			if s.OptionID == req.Winning {
				win += s.Amount
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		payouts, refund, err := settlement.Payouts(stakes, req.Winning, cancel)
		if err != nil {
			return err
		}
		// Wallet locks are always acquired in user-ID order across all settlements.
		balances := map[int64]int64{}
		for _, s := range stakes {
			if _, ok := balances[s.UserID]; !ok {
				var balance int64
				if err := tx.QueryRow(c.UserContext(), `SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, s.UserID).Scan(&balance); err != nil {
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
			} else if s.OptionID == req.Winning {
				state, kind = "WON", "WIN_REWARD"
				winners[s.UserID] = true
			}
			if balances[s.UserID] > 9007199254740991-payout {
				return invalid("balance", "Payout would exceed wallet limit")
			}
			balances[s.UserID] += payout
			if _, err := tx.Exec(c.UserContext(), `UPDATE positions SET result=$2,payout=$3,settled_at=now() WHERE id=$1`, s.ID, state, payout); err != nil {
				return err
			}
			if _, err := tx.Exec(c.UserContext(), `UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1`, s.UserID, balances[s.UserID]); err != nil {
				return err
			}
			if _, err := tx.Exec(c.UserContext(), `INSERT INTO transactions(user_id,amount,transaction_type,balance_after,position_id) VALUES($1,$2,$3,$4,$5)`, s.UserID, payout, kind, balances[s.UserID], s.ID); err != nil {
				return err
			}
		}
		if !refund {
			for user := range balances {
				correct := 0
				if winners[user] {
					correct = 1
				}
				if _, err := tx.Exec(c.UserContext(), `UPDATE users SET
                    prediction_score=calculate_prediction_score(correct_predictions+$2,total_predictions+1),
                    total_predictions=total_predictions+1,
                    correct_predictions=correct_predictions+$2,updated_at=now() WHERE id=$1`, user, correct); err != nil {
					return err
				}
			}
		}
		if cancel {
			_, err = tx.Exec(c.UserContext(), `UPDATE markets SET status='CANCELLED',cancelled_by=$2,cancelled_at=now(),cancellation_reason=$3,updated_at=now() WHERE id=$1`, id, user, req.Reason)
		} else {
			mode := "PAYOUT"
			if refund {
				mode = "NO_WINNERS_REFUND"
			}
			_, err = tx.Exec(c.UserContext(), `INSERT INTO settlements(market_id,winning_option_id,resolved_by,notes,total_pool,winning_pool,settlement_mode) VALUES($1,$2,$3,$4,$5,$6,$7)`, id, req.Winning, user, req.Notes, total, win, mode)
			if err == nil {
				_, err = tx.Exec(c.UserContext(), `UPDATE markets SET status='RESOLVED',updated_at=now() WHERE id=$1`, id)
			}
		}
		if err != nil {
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
