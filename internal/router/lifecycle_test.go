package router_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestDATA02And03ConcurrentMutations(t *testing.T) {
	app, pool := setup(t)
	owner, _ := register(t, app, "Owner")
	bettor, _ := register(t, app, "Bettor")
	c := call(t, app, "POST", "/communities", owner, map[string]any{"name": "Concurrency", "visibility": "PUBLIC"})
	expect(t, c, 201, "")
	base := "/communities/" + itoa(c.body["id"].(float64))
	expect(t, call(t, app, "POST", base+"/join", bettor, nil), 200, "")
	m := call(t, app, "POST", base+"/markets", owner, map[string]any{"title": "Concurrent?", "marketType": "BINARY", "deadline": time.Now().Add(time.Hour)})
	expect(t, m, 201, "")
	path := "/markets/" + itoa(m.body["id"].(float64))
	option := m.body["options"].([]any)[0].(map[string]any)["id"]
	race := func(path, cookie string, body any, loser int) {
		t.Helper()
		raw, _ := json.Marshal(body)
		statuses := make(chan int, 2)
		var wg sync.WaitGroup
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				req := httptest.NewRequest("POST", "/api/v1"+path, strings.NewReader(string(raw)))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Cookie", "access_token="+cookie)
				res, err := app.Test(req, -1)
				if err != nil {
					statuses <- 0
					return
				}
				defer res.Body.Close()
				statuses <- res.StatusCode
			}()
		}
		wg.Wait()
		close(statuses)
		good, bad := 0, 0
		for status := range statuses {
			if status == 200 {
				good++
			}
			if status == loser {
				bad++
			}
		}
		if good != 1 || bad != 1 {
			t.Fatalf("race: success=%d rejected=%d", good, bad)
		}
	}
	race(path+"/positions", bettor, map[string]any{"optionId": option, "amount": 1000}, 409)
	_, err := pool.Exec(context.Background(), `UPDATE markets SET created_at=now()-interval '2 hours',deadline=now()-interval '1 hour'`)
	if err != nil {
		t.Fatal(err)
	}
	race(path+"/resolve", owner, map[string]any{"winningOptionId": option}, 409)
	endGracePeriod(t, pool)
	wallet := call(t, app, "GET", "/me/wallet", bettor, nil)
	if wallet.body["balance"] != float64(1000) {
		t.Fatal("double payout")
	}
}

func TestRES07And08Refunds(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		t.Run(map[bool]string{false: "no-winners", true: "cancel"}[cancel], func(t *testing.T) {
			app, pool := setup(t)
			owner, _ := register(t, app, "Owner")
			c := call(t, app, "POST", "/communities", owner, map[string]any{"name": "Refund", "visibility": "PRIVATE"})
			expect(t, c, 201, "")
			m := call(t, app, "POST", "/communities/"+itoa(c.body["id"].(float64))+"/markets", owner, map[string]any{"title": "Refund?", "marketType": "BINARY", "deadline": time.Now().Add(time.Hour)})
			expect(t, m, 201, "")
			path := "/markets/" + itoa(m.body["id"].(float64))
			options := m.body["options"].([]any)
			expect(t, call(t, app, "POST", path+"/positions", owner, map[string]any{"optionId": options[0].(map[string]any)["id"], "amount": 100}), 200, "")
			_, err := pool.Exec(context.Background(), `UPDATE markets SET created_at=now()-interval '2 hours',deadline=now()-interval '1 hour'`)
			if err != nil {
				t.Fatal(err)
			}
			route := path + "/resolve"
			if cancel {
				route = path + "/cancel"
			}
			expect(t, call(t, app, "POST", route, owner, map[string]any{"winningOptionId": options[1].(map[string]any)["id"]}), 200, "")
			endGracePeriod(t, pool)
			wallet := call(t, app, "GET", "/me/wallet", owner, nil)
			if wallet.body["balance"] != float64(1000) {
				t.Fatal("refund lost points")
			}
			me := call(t, app, "GET", "/me", owner, nil)
			if me.body["totalPredictions"] != float64(0) || me.body["predictionScore"] != float64(0) {
				t.Fatal("refund counted in stats")
			}
		})
	}
}

func TestE2E_MarketWalletLifecycle(t *testing.T) {
	app, pool := setup(t)
	alice, _ := register(t, app, "Alice")
	bob, _ := register(t, app, "Bobby")
	outsider, _ := register(t, app, "Outsider")
	community := call(t, app, "POST", "/communities", alice, map[string]any{"name": "Test", "visibility": "PUBLIC"})
	expect(t, community, 201, "")
	base := "/communities/" + itoa(community.body["id"].(float64))
	expect(t, call(t, app, "GET", base, outsider, nil), 200, "")
	expect(t, call(t, app, "POST", base+"/join", bob, nil), 200, "")
	expect(t, call(t, app, "POST", base+"/join", bob, nil), 409, "ALREADY_MEMBER")
	market := call(t, app, "POST", base+"/markets", alice, map[string]any{"title": "Rain?", "marketType": "BINARY", "deadline": time.Now().Add(time.Hour).UTC()})
	expect(t, market, 201, "")
	marketID := market.body["id"].(float64)
	path := "/markets/" + itoa(marketID)
	options := market.body["options"].([]any)
	yes := options[0].(map[string]any)["id"]
	no := options[1].(map[string]any)["id"]
	expect(t, call(t, app, "POST", path+"/positions", outsider, map[string]any{"optionId": yes, "amount": 10}), 403, "FORBIDDEN")
	expect(t, call(t, app, "POST", path+"/positions", alice, map[string]any{"optionId": yes, "amount": 100}), 200, "")
	expect(t, call(t, app, "POST", path+"/positions", alice, map[string]any{"optionId": no, "amount": 10}), 409, "OPTION_SWITCH_NOT_ALLOWED")
	expect(t, call(t, app, "POST", path+"/positions", bob, map[string]any{"optionId": no, "amount": 300}), 200, "")
	expect(t, call(t, app, "POST", path+"/resolve", alice, map[string]any{"winningOptionId": yes}), 409, "MARKET_CLOSED")
	// Time travel only inside this disposable test database; preserve deadline constraint.
	_, err := pool.Exec(context.Background(), `UPDATE markets SET created_at=now()-interval '2 hours',deadline=now()-interval '1 hour' WHERE id=$1`, int64(marketID))
	if err != nil {
		t.Fatal(err)
	}
	expect(t, call(t, app, "POST", path+"/resolve", bob, map[string]any{"winningOptionId": yes}), 403, "FORBIDDEN")
	settled := call(t, app, "POST", path+"/resolve", alice, map[string]any{"winningOptionId": yes})
	expect(t, settled, 200, "")
	expect(t, call(t, app, "POST", path+"/resolve", alice, map[string]any{"winningOptionId": yes}), 409, "MARKET_CLOSED")
	endGracePeriod(t, pool)
	wallet := call(t, app, "GET", "/me/wallet", alice, nil)
	if wallet.body["balance"] != float64(1300) {
		t.Fatalf("winner balance: %v", wallet.body)
	}
	winner := call(t, app, "GET", "/me", alice, nil)
	loser := call(t, app, "GET", "/me", bob, nil)
	if winner.body["predictionScore"] != float64(100) || winner.body["totalPredictions"] != float64(1) || loser.body["predictionScore"] != float64(0) || loser.body["totalPredictions"] != float64(1) {
		t.Fatalf("LDR-03: wrong scores: winner=%v loser=%v", winner.body, loser.body)
	}
	expect(t, call(t, app, "POST", "/me/wallet/deposit", alice, map[string]any{"amount": 1.5}), 400, "VALIDATION_ERROR")
	expect(t, call(t, app, "POST", "/me/wallet/deposit", alice, map[string]any{"amount": 500}), 200, "")
	var mismatch int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM wallets w WHERE balance<>(SELECT COALESCE(sum(amount),0) FROM transactions WHERE user_id=w.user_id)`).Scan(&mismatch); err != nil || mismatch != 0 {
		t.Fatalf("ledger mismatch: %d %v", mismatch, err)
	}
	for _, route := range []string{"/markets", "/me/positions?status=settled", "/me/transactions", "/me/mod-queue", base + "/leaderboard", path + "/activity"} {
		expect(t, call(t, app, "GET", route, alice, nil), 200, "")
	}
}

func TestAUTH19ConcurrentRefresh(t *testing.T) {
	app, _ := setup(t)
	// Reuse the normal registration helper, then login to capture both cookies.
	register(t, app, "RefreshUser")
	req := httptest.NewRequest("POST", "/api/v1/auth/login", strings.NewReader(`{"email":"refreshuser@example.com","password":"password123"}`))
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	cookies := res.Cookies()
	var refresh, access string
	for _, c := range cookies {
		if c.Name == "refresh_token" {
			refresh = c.Value
		}
		if c.Name == "access_token" {
			access = c.Value
		}
	}
	if refresh == "" || access == "" {
		t.Fatal("missing auth cookies")
	}
	statuses := make(chan int, 2)
	rotated := make(chan string, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := httptest.NewRequest("POST", "/api/v1/auth/refresh", nil)
			r.Header.Set("Cookie", "refresh_token="+refresh)
			response, err := app.Test(r, -1)
			if err != nil {
				statuses <- 0
				return
			}
			defer response.Body.Close()
			statuses <- response.StatusCode
			for _, c := range response.Cookies() {
				if c.Name == "refresh_token" {
					rotated <- c.Value
				}
			}
		}()
	}
	wg.Wait()
	close(statuses)
	success, denied := 0, 0
	for status := range statuses {
		if status == 204 {
			success++
		}
		if status == 401 {
			denied++
		}
	}
	if success != 1 || denied != 1 {
		t.Fatalf("rotation race: successes=%d denied=%d", success, denied)
	}
	token := <-rotated
	logout := httptest.NewRequest("POST", "/api/v1/auth/logout", nil)
	logout.Header.Set("Cookie", "access_token="+access+"; refresh_token="+token)
	res, err = app.Test(logout)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 204 {
		t.Fatal("logout failed")
	}
	replay := httptest.NewRequest("POST", "/api/v1/auth/refresh", nil)
	replay.Header.Set("Cookie", "refresh_token="+token)
	res, err = app.Test(replay)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 401 {
		t.Fatal("AUTH-20 revoked token reused")
	}
}
