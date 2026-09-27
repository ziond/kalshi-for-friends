package router_test

import (
	"context"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ziond/kalshi-for-friends/backend/internal/modules/markets"
)

const alreadyPicked = "A winner has already been picked. You can only nullify this market"

// endGracePeriod moves every pending payout 5 minutes into the past, as if
// the grace period had elapsed. Only for the disposable test database.
func endGracePeriod(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `UPDATE settlements SET resolved_at=resolved_at-interval '5 minutes',payout_at=payout_at-interval '5 minutes' WHERE paid_out_at IS NULL`); err != nil {
		t.Fatal(err)
	}
}

type graceMarket struct {
	app        *fiber.App
	pool       *pgxpool.Pool
	alice, bob string // Alice moderates and bets 100 on Yes; Bob bets 300 on No
	path       string
	id         int64
	yes, no    any
}

// lockedMarket returns a market whose deadline has passed, waiting for a pick.
func lockedMarket(t *testing.T) graceMarket {
	t.Helper()
	app, pool := setup(t)
	alice, _ := register(t, app, "Alice")
	bob, _ := register(t, app, "Bobby")
	community := call(t, app, "POST", "/communities", alice, map[string]any{"name": "Grace", "visibility": "PUBLIC"})
	expect(t, community, 201, "")
	base := "/communities/" + itoa(community.body["id"].(float64))
	expect(t, call(t, app, "POST", base+"/join", bob, nil), 200, "")
	market := call(t, app, "POST", base+"/markets", alice, map[string]any{"title": "Rain?", "marketType": "BINARY", "deadline": time.Now().Add(time.Hour)})
	expect(t, market, 201, "")
	m := graceMarket{app: app, pool: pool, alice: alice, bob: bob, id: int64(market.body["id"].(float64))}
	m.path = "/markets/" + itoa(market.body["id"].(float64))
	options := market.body["options"].([]any)
	m.yes, m.no = options[0].(map[string]any)["id"], options[1].(map[string]any)["id"]
	expect(t, call(t, app, "POST", m.path+"/positions", alice, map[string]any{"optionId": m.yes, "amount": 100}), 200, "")
	expect(t, call(t, app, "POST", m.path+"/positions", bob, map[string]any{"optionId": m.no, "amount": 300}), 200, "")
	if _, err := pool.Exec(context.Background(), `UPDATE markets SET created_at=now()-interval '2 hours',deadline=now()-interval '1 hour' WHERE id=$1`, m.id); err != nil {
		t.Fatal(err)
	}
	return m
}

func (m graceMarket) balance(t *testing.T, cookie string) float64 {
	t.Helper()
	w := call(t, m.app, "GET", "/me/wallet", cookie, nil)
	expect(t, w, 200, "")
	return w.body["balance"].(float64)
}

// dbState reads the market straight from the database, without the payout-on-read path.
func (m graceMarket) dbState(t *testing.T) (status string, settlements, results int) {
	t.Helper()
	err := m.pool.QueryRow(context.Background(), `SELECT status,(SELECT count(*) FROM settlements WHERE market_id=$1),
		(SELECT count(*) FROM transactions t JOIN positions p ON p.id=t.position_id WHERE p.market_id=$1 AND t.transaction_type<>'PLACE_POSITION')
		FROM markets WHERE id=$1`, m.id).Scan(&status, &settlements, &results)
	if err != nil {
		t.Fatal(err)
	}
	return
}

func checkLedger(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	var mismatch int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM wallets w WHERE balance<>(SELECT COALESCE(sum(amount),0) FROM transactions WHERE user_id=w.user_id)`).Scan(&mismatch); err != nil || mismatch != 0 {
		t.Fatalf("ledger mismatch: %d %v", mismatch, err)
	}
}

func parseTime(t *testing.T, v any) time.Time {
	t.Helper()
	s, _ := v.(string)
	at, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t.Fatalf("not a timestamp: %v", v)
	}
	return at
}

func TestRES16PickStartsGracePeriod(t *testing.T) {
	m := lockedMarket(t)
	picked := call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": m.yes, "notes": "Photo in the chat"})
	expect(t, picked, 200, "")
	if picked.body["status"] != "PAYOUT_PENDING" {
		t.Fatalf("status = %v, want PAYOUT_PENDING", picked.body["status"])
	}
	s := picked.body["settlement"].(map[string]any)
	if s["winningOptionId"] != m.yes || s["paidOutAt"] != nil || s["notes"] != "Photo in the chat" {
		t.Fatalf("settlement = %v", s)
	}
	if grace := parseTime(t, s["payoutAt"]).Sub(parseTime(t, s["resolvedAt"])); grace != 5*time.Minute {
		t.Fatalf("payoutAt - resolvedAt = %v, want 5m", grace)
	}
	if picked.body["payoutAt"] != s["payoutAt"] {
		t.Fatalf("summary payoutAt = %v, want %v", picked.body["payoutAt"], s["payoutAt"])
	}
	for _, o := range picked.body["options"].([]any) {
		if o.(map[string]any)["isWinner"] != nil {
			t.Fatal("isWinner must stay null until the payout")
		}
	}
	perms := picked.body["permissions"].(map[string]any)
	if perms["canResolve"] != false || perms["canCancel"] != true || perms["canBet"] != false {
		t.Fatalf("moderator permissions = %v", perms)
	}
	bobView := call(t, m.app, "GET", m.path, m.bob, nil)
	if bobView.body["status"] != "PAYOUT_PENDING" || bobView.body["settlement"].(map[string]any)["winningOptionId"] != m.yes || bobView.body["permissions"].(map[string]any)["canCancel"] != false {
		t.Fatalf("viewer sees %v", bobView.body)
	}

	// No points move and no bet results change during the grace period.
	if a, b := m.balance(t, m.alice), m.balance(t, m.bob); a != 900 || b != 700 {
		t.Fatalf("balances moved during grace period: alice=%v bob=%v", a, b)
	}
	for _, cookie := range []string{m.alice, m.bob} {
		for _, p := range call(t, m.app, "GET", "/me/positions", cookie, nil).body["items"].([]any) {
			if p.(map[string]any)["result"] != "PENDING" {
				t.Fatalf("position settled early: %v", p)
			}
		}
		if me := call(t, m.app, "GET", "/me", cookie, nil); me.body["totalPredictions"] != float64(0) {
			t.Fatalf("stats changed early: %v", me.body)
		}
	}
	if status, _, results := m.dbState(t); status != "PAYOUT_PENDING" || results != 0 {
		t.Fatalf("db: status=%s settlement transactions=%d", status, results)
	}

	// API-09: everything polled during a countdown is uncached.
	for _, route := range []string{m.path, m.path + "/activity", "/me/mod-queue"} {
		req := httptest.NewRequest("GET", "/api/v1"+route, nil)
		req.Header.Set("Cookie", "access_token="+m.alice)
		res, err := m.app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.Header.Get("Cache-Control") != "no-store" {
			t.Fatalf("%s Cache-Control = %q", route, res.Header.Get("Cache-Control"))
		}
	}
	// The Mod queue moves it from "pending" to "payoutPending".
	q := call(t, m.app, "GET", "/me/mod-queue", m.alice, nil)
	pending, payoutPending := q.body["pending"].([]any), q.body["payoutPending"].([]any)
	if len(pending) != 0 || len(payoutPending) != 1 || len(q.body["active"].([]any)) != 0 {
		t.Fatalf("mod queue = %v", q.body)
	}
	if payoutPending[0].(map[string]any)["payoutAt"] != s["payoutAt"] {
		t.Fatal("mod queue entry is missing payoutAt")
	}
	list := call(t, m.app, "GET", "/markets?status=PAYOUT_PENDING", m.bob, nil)
	expect(t, list, 200, "")
	if items := list.body["items"].([]any); len(items) != 1 || items[0].(map[string]any)["status"] != "PAYOUT_PENDING" {
		t.Fatalf("status filter: %v", list.body)
	}
}

func TestRES19PickIsFinal(t *testing.T) {
	m := lockedMarket(t)
	first := call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": m.yes})
	expect(t, first, 200, "")

	// Another outcome, or the same one again: both refused with the same message.
	for _, option := range []any{m.no, m.yes} {
		r := call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": option})
		expect(t, r, 409, "MARKET_CLOSED")
		if msg := r.body["error"].(map[string]any)["message"]; msg != alreadyPicked {
			t.Fatalf("message = %q", msg)
		}
	}
	expect(t, call(t, m.app, "POST", m.path+"/resolve", m.bob, map[string]any{"winningOptionId": m.no}), 403, "FORBIDDEN")

	after := call(t, m.app, "GET", m.path, m.alice, nil)
	was, now := first.body["settlement"].(map[string]any), after.body["settlement"].(map[string]any)
	if now["winningOptionId"] != m.yes || now["payoutAt"] != was["payoutAt"] || now["resolvedAt"] != was["resolvedAt"] || after.body["status"] != "PAYOUT_PENDING" {
		t.Fatalf("pick changed: before %v, after %v", was, now)
	}
	// The only change still allowed is a nullify.
	expect(t, call(t, m.app, "POST", m.path+"/cancel", m.alice, map[string]any{}), 200, "")
}

func TestRES17PayoutAfterGracePeriod(t *testing.T) {
	t.Run("on read", func(t *testing.T) {
		m := lockedMarket(t)
		expect(t, call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": m.yes}), 200, "")
		endGracePeriod(t, m.pool)
		// No job runs in tests: the next read pays out.
		if a := m.balance(t, m.alice); a != 1300 {
			t.Fatalf("winner balance = %v, want 1300", a)
		}
		if b := m.balance(t, m.bob); b != 700 {
			t.Fatalf("loser balance = %v, want 700", b)
		}
		market := call(t, m.app, "GET", m.path, m.bob, nil)
		s := market.body["settlement"].(map[string]any)
		if market.body["status"] != "RESOLVED" || s["paidOutAt"] == nil || parseTime(t, s["paidOutAt"]).Before(parseTime(t, s["payoutAt"])) {
			t.Fatalf("after payout: status=%v settlement=%v", market.body["status"], s)
		}
		if perms := market.body["permissions"].(map[string]any); perms["canCancel"] != false {
			t.Fatal("paid-out market can still be cancelled")
		}
		for _, o := range market.body["options"].([]any) {
			o := o.(map[string]any)
			if o["isWinner"] != (o["id"] == m.yes) {
				t.Fatalf("isWinner wrong: %v", o)
			}
		}
		if stake := market.body["myStake"].(map[string]any); stake["potentialPayout"] != float64(0) {
			t.Fatalf("loser's stake = %v", stake)
		}
		winner, loser := call(t, m.app, "GET", "/me", m.alice, nil), call(t, m.app, "GET", "/me", m.bob, nil)
		if winner.body["predictionScore"] != float64(100) || loser.body["totalPredictions"] != float64(1) {
			t.Fatalf("stats: winner=%v loser=%v", winner.body, loser.body)
		}
		q := call(t, m.app, "GET", "/me/mod-queue", m.alice, nil)
		if len(q.body["pending"].([]any))+len(q.body["payoutPending"].([]any)) != 0 {
			t.Fatalf("paid-out market still in mod queue: %v", q.body)
		}
		// Settled for good: no nullify or new pick after the payout.
		expect(t, call(t, m.app, "POST", m.path+"/cancel", m.alice, map[string]any{}), 409, "MARKET_CLOSED")
		expect(t, call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": m.no}), 409, "MARKET_CLOSED")
		checkLedger(t, m.pool)
	})

	t.Run("by the job, once", func(t *testing.T) {
		m := lockedMarket(t)
		ctx := context.Background()
		expect(t, call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": m.yes}), 200, "")
		if err := markets.PayDue(ctx, m.pool); err != nil {
			t.Fatal(err)
		}
		if status, _, results := m.dbState(t); status != "PAYOUT_PENDING" || results != 0 {
			t.Fatalf("paid out before payoutAt: status=%s results=%d", status, results)
		}
		endGracePeriod(t, m.pool)
		for i := 0; i < 3; i++ { // idempotent
			if err := markets.PayDue(ctx, m.pool); err != nil {
				t.Fatal(err)
			}
		}
		if status, settlements, results := m.dbState(t); status != "RESOLVED" || settlements != 1 || results != 2 {
			t.Fatalf("after job: status=%s settlements=%d results=%d", status, settlements, results)
		}
		var alice, bob int64
		if err := m.pool.QueryRow(ctx, `SELECT (SELECT balance FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.username='Alice'),(SELECT balance FROM wallets w JOIN users u ON u.id=w.user_id WHERE u.username='Bobby')`).Scan(&alice, &bob); err != nil || alice != 1300 || bob != 700 {
			t.Fatalf("balances alice=%d bob=%d %v", alice, bob, err)
		}
		checkLedger(t, m.pool)
	})

	t.Run("nobody backed the winner", func(t *testing.T) {
		m := lockedMarket(t)
		if _, err := m.pool.Exec(context.Background(), `INSERT INTO market_options(market_id,option_text,sort_order) VALUES($1,'Snow',2)`, m.id); err != nil {
			t.Fatal(err)
		}
		options := call(t, m.app, "GET", m.path, m.alice, nil).body["options"].([]any)
		snow := options[2].(map[string]any)["id"]
		expect(t, call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": snow}), 200, "")
		if a := m.balance(t, m.alice); a != 900 {
			t.Fatalf("refunded before payoutAt: %v", a)
		}
		endGracePeriod(t, m.pool)
		if a, b := m.balance(t, m.alice), m.balance(t, m.bob); a != 1000 || b != 1000 {
			t.Fatalf("no-winner refund: alice=%v bob=%v", a, b)
		}
		if status, _, _ := m.dbState(t); status != "RESOLVED" {
			t.Fatalf("status = %s", status)
		}
	})
}

func TestRES18NullifyDuringGracePeriod(t *testing.T) {
	m := lockedMarket(t)
	expect(t, call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": m.yes}), 200, "")
	expect(t, call(t, m.app, "POST", m.path+"/cancel", m.bob, map[string]any{}), 403, "FORBIDDEN")
	cancelled := call(t, m.app, "POST", m.path+"/cancel", m.alice, map[string]any{"reason": "Wrong pick"})
	expect(t, cancelled, 200, "")
	if cancelled.body["status"] != "CANCELLED" || cancelled.body["settlement"] != nil || cancelled.body["payoutAt"] != nil {
		t.Fatalf("after nullify: %v", cancelled.body)
	}
	if a, b := m.balance(t, m.alice), m.balance(t, m.bob); a != 1000 || b != 1000 {
		t.Fatalf("refunds: alice=%v bob=%v", a, b)
	}

	// The original payoutAt passing changes nothing: no payouts, bets stay refunded.
	endGracePeriod(t, m.pool)
	if err := markets.PayDue(context.Background(), m.pool); err != nil {
		t.Fatal(err)
	}
	if status, settlements, results := m.dbState(t); status != "CANCELLED" || settlements != 0 || results != 2 {
		t.Fatalf("after payoutAt: status=%s settlements=%d results=%d", status, settlements, results)
	}
	for _, p := range call(t, m.app, "GET", "/me/positions", m.alice, nil).body["items"].([]any) {
		if p.(map[string]any)["result"] != "REFUNDED" {
			t.Fatalf("position = %v", p)
		}
	}
	if me := call(t, m.app, "GET", "/me", m.alice, nil); me.body["totalPredictions"] != float64(0) {
		t.Fatal("nullified market counted in stats")
	}
	expect(t, call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": m.yes}), 409, "MARKET_CLOSED")
	expect(t, call(t, m.app, "POST", m.path+"/cancel", m.alice, map[string]any{}), 409, "MARKET_CLOSED")
	if a := m.balance(t, m.alice); a != 1000 {
		t.Fatalf("balance changed after final nullify: %v", a)
	}
	checkLedger(t, m.pool)
}

func TestDATA07PayoutAndNullifyNeverBoth(t *testing.T) {
	m := lockedMarket(t)
	expect(t, call(t, m.app, "POST", m.path+"/resolve", m.alice, map[string]any{"winningOptionId": m.yes}), 200, "")
	endGracePeriod(t, m.pool)

	// The payout job and a nullify arrive together once payoutAt has passed.
	var wg sync.WaitGroup
	var nullify response
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := markets.PayDue(context.Background(), m.pool); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		nullify = call(t, m.app, "POST", m.path+"/cancel", m.alice, map[string]any{})
	}()
	wg.Wait()

	expect(t, nullify, 409, "MARKET_CLOSED")
	if status, settlements, results := m.dbState(t); status != "RESOLVED" || settlements != 1 || results != 2 {
		t.Fatalf("status=%s settlements=%d results=%d", status, settlements, results)
	}
	if a, b := m.balance(t, m.alice), m.balance(t, m.bob); a != 1300 || b != 700 {
		t.Fatalf("balances alice=%v bob=%v", a, b)
	}
	checkLedger(t, m.pool)
}
