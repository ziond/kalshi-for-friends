package router_test

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// WAL-11, WAL-12, AUTH-05: 1,000 on signup, 1,000 more every 24 hours, never stacked.
func TestWAL11DailyBonus(t *testing.T) {
	app, pool := setup(t)
	ctx := context.Background()
	cookie, id := register(t, app, "Bonus")
	uid := int64(id)

	me := call(t, app, http.MethodGet, "/me", cookie, nil)
	next, err := time.Parse(time.RFC3339Nano, me.body["nextDailyBonusAt"].(string))
	if err != nil || me.body["balance"] != float64(1000) {
		t.Fatalf("new user: %v %v", me.body, err)
	}
	if wait := time.Until(next); wait < 23*time.Hour+50*time.Minute || wait > 24*time.Hour {
		t.Fatalf("first bonus should open 24h after signup, opens in %v", wait)
	}

	early := call(t, app, http.MethodPost, "/me/daily-bonus", cookie, nil)
	expect(t, early, http.StatusConflict, "DAILY_BONUS_NOT_READY")
	if msg := early.body["error"].(map[string]any)["message"].(string); !strings.HasPrefix(msg, "Your next 1,000 points are ready in 2") {
		t.Fatalf("not-ready message: %q", msg)
	}

	// Three days away still pays once.
	if _, err := pool.Exec(ctx, `UPDATE wallets SET next_daily_bonus_at=now()-interval '3 days' WHERE user_id=$1`, uid); err != nil {
		t.Fatal(err)
	}
	claim := call(t, app, http.MethodPost, "/me/daily-bonus", cookie, nil)
	expect(t, claim, http.StatusOK, "")
	next, err = time.Parse(time.RFC3339Nano, claim.body["nextDailyBonusAt"].(string))
	if err != nil || claim.body["amount"] != float64(1000) || claim.body["balance"] != float64(2000) || time.Until(next) < 23*time.Hour {
		t.Fatalf("claim: %v %v", claim.body, err)
	}
	expect(t, call(t, app, http.MethodPost, "/me/daily-bonus", cookie, nil), http.StatusConflict, "DAILY_BONUS_NOT_READY")
	if b := call(t, app, http.MethodGet, "/me", cookie, nil).body; b["balance"] != float64(2000) || b["nextDailyBonusAt"] != claim.body["nextDailyBonusAt"] {
		t.Fatalf("after claim: %v", b)
	}

	var n int
	var amount, after int64
	if err := pool.QueryRow(ctx, `SELECT count(*), max(amount), max(balance_after) FROM transactions WHERE user_id=$1 AND transaction_type='DAILY_BONUS'`, uid).Scan(&n, &amount, &after); err != nil || n != 1 || amount != 1000 || after != 2000 {
		t.Fatalf("ledger: %d rows, amount %d, balance_after %d, %v", n, amount, after, err)
	}

	// The deposit endpoint is gone.
	expect(t, call(t, app, http.MethodPost, "/me/wallet/deposit", cookie, map[string]any{"amount": 500}), http.StatusNotFound, "")
}

// DATA-08: simultaneous claims credit once.
func TestDATA08ConcurrentDailyBonus(t *testing.T) {
	app, pool := setup(t)
	cookie, id := register(t, app, "Racer")
	if _, err := pool.Exec(context.Background(), `UPDATE wallets SET next_daily_bonus_at=now()-interval '1 minute' WHERE user_id=$1`, int64(id)); err != nil {
		t.Fatal(err)
	}
	const n = 8
	statuses := make(chan int, n)
	var wg sync.WaitGroup
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses <- call(t, app, http.MethodPost, "/me/daily-bonus", cookie, nil).status
		}()
	}
	wg.Wait()
	close(statuses)
	ok := 0
	for s := range statuses {
		switch s {
		case http.StatusOK:
			ok++
		case http.StatusConflict:
		default:
			t.Fatalf("unexpected status %d", s)
		}
	}
	if ok != 1 {
		t.Fatalf("%d claims succeeded, want 1", ok)
	}
	if b := call(t, app, http.MethodGet, "/me", cookie, nil).body; b["balance"] != float64(2000) {
		t.Fatalf("balance after race: %v", b["balance"])
	}
}
