package settlement

import (
	"errors"
	"math/big"
)

type Stake struct{ ID, UserID, OptionID, Amount int64 }

// Payouts conserves the pool. Ties for the largest winning bet use lowest ID.
func Payouts(stakes []Stake, winning int64, cancel bool) (map[int64]int64, bool, error) {
	const max = int64(9007199254740991)
	var total, win int64
	for _, s := range stakes {
		if s.Amount < 1 || s.Amount > max-total {
			return nil, false, errors.New("invalid pool")
		}
		total += s.Amount
		if s.OptionID == winning {
			win += s.Amount
		}
	}
	refund := cancel || win == 0
	out := map[int64]int64{}
	var paid, bestID, bestAmount int64
	for _, s := range stakes {
		amount := int64(0)
		if refund {
			amount = s.Amount
		} else if s.OptionID == winning {
			n := new(big.Int).Mul(big.NewInt(s.Amount), big.NewInt(total))
			n.Quo(n, big.NewInt(win))
			amount = n.Int64()
			if s.Amount > bestAmount || (s.Amount == bestAmount && s.ID < bestID) {
				bestID, bestAmount = s.ID, s.Amount
			}
		}
		out[s.ID] = amount
		paid += amount
	}
	if !refund && total > paid {
		out[bestID] += total - paid
	}
	return out, refund, nil
}
