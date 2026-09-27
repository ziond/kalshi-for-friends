package router_test

import (
	"context"
	"net/http"
	"net/url"
	"testing"
	"time"
)

// COM-04: moderator names are checked as they're typed.
func TestCOM04UsernameLookup(t *testing.T) {
	app, _ := setup(t)
	cookie, _ := register(t, app, "Lookie")
	_, malloryID := register(t, app, "Mallory")

	found := call(t, app, http.MethodGet, "/users/lookup?username="+url.QueryEscape("  mALLory "), cookie, nil)
	expect(t, found, http.StatusOK, "")
	u, _ := found.body["user"].(map[string]any)
	if u["id"] != malloryID || u["username"] != "Mallory" {
		t.Fatalf("lookup should return the stored spelling: %v", found.body)
	}
	for _, name := range []string{"nobody", "", "%"} {
		r := call(t, app, http.MethodGet, "/users/lookup?username="+url.QueryEscape(name), cookie, nil)
		expect(t, r, http.StatusOK, "")
		if v, ok := r.body["user"]; !ok || v != nil {
			t.Fatalf("lookup %q should be {user: null}: %v", name, r.body)
		}
	}
	expect(t, call(t, app, http.MethodGet, "/users/lookup?username=Mallory", "", nil), http.StatusUnauthorized, "")
	// /users/:id still works next to it.
	expect(t, call(t, app, http.MethodGet, "/users/"+itoa(malloryID), cookie, nil), http.StatusOK, "")
}

// COM-04: an unknown moderator rejects the whole request.
func TestCOM04UnknownModerator(t *testing.T) {
	app, pool := setup(t)
	cookie, _ := register(t, app, "Founder")
	register(t, app, "RealMod")

	r := call(t, app, http.MethodPost, "/communities", cookie, map[string]any{
		"name": "Mods", "visibility": "PUBLIC", "moderatorUsernames": []string{"realmod", "  Ghost  "},
	})
	expect(t, r, http.StatusBadRequest, "VALIDATION_ERROR")
	fields, _ := r.body["error"].(map[string]any)["fields"].(map[string]any)
	if fields["moderatorUsernames"] != "Unknown username: Ghost" {
		t.Fatalf("fields: %v", r.body)
	}
	var n int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM communities`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("nothing should be created: %d %v", n, err)
	}

	ok := call(t, app, http.MethodPost, "/communities", cookie, map[string]any{
		"name": "Mods", "visibility": "PUBLIC", "moderatorUsernames": []string{"REALMOD"},
	})
	expect(t, ok, http.StatusCreated, "")
	if mods, _ := ok.body["moderators"].([]any); len(mods) != 2 {
		t.Fatalf("creator plus RealMod should moderate: %v", ok.body["moderators"])
	}
}

// FEED-08: Home search finds public communities and markets, never private ones the user isn't in.
func TestFEED08Search(t *testing.T) {
	app, _ := setup(t)
	owner, _ := register(t, app, "Owner")
	searcher, _ := register(t, app, "Searcher")

	create := func(name, description, visibility string) float64 {
		t.Helper()
		r := call(t, app, http.MethodPost, "/communities", owner, map[string]string{"name": name, "description": description, "visibility": visibility})
		expect(t, r, http.StatusCreated, "")
		return r.body["id"].(float64)
	}
	weather := create("Weather Nerds", "Snow and rain bets", "PUBLIC")
	create("Chess Club", "Knights only", "PUBLIC")
	secret := create("Weather Secret", "Private snow", "PRIVATE")
	create("100% Real", "Literal percent", "PUBLIC")

	names := func(list []any) []string {
		out := []string{}
		for _, item := range list {
			out = append(out, item.(map[string]any)["name"].(string))
		}
		return out
	}
	for q, want := range map[string][]string{
		"":          {"100% Real", "Chess Club", "Weather Nerds"},
		"weather":   {"Weather Nerds"},
		"SNOW":      {"Weather Nerds"},
		"  chess  ": {"Chess Club"},
		"%":         {"100% Real"},
		"_":         {},
		"zzz":       {},
	} {
		r := call(t, app, http.MethodGet, "/communities/discover?q="+url.QueryEscape(q), searcher, nil)
		expect(t, r, http.StatusOK, "")
		if got := names(r.list); !sameSet(got, want) {
			t.Fatalf("discover q=%q: got %v, want %v", q, got, want)
		}
	}

	market := func(community float64, title string) {
		t.Helper()
		expect(t, call(t, app, http.MethodPost, "/communities/"+itoa(community)+"/markets", owner, map[string]any{
			"title": title, "marketType": "BINARY", "deadline": time.Now().Add(time.Hour).UTC(),
		}), http.StatusCreated, "")
	}
	market(weather, "Will it snow by Friday?")
	market(weather, "Rain at 50% chance?")
	market(secret, "Secret snow bet?")

	titles := func(q string) []string {
		t.Helper()
		r := call(t, app, http.MethodGet, "/markets?limit=12&q="+url.QueryEscape(q), searcher, nil)
		expect(t, r, http.StatusOK, "")
		out := []string{}
		for _, item := range r.body["items"].([]any) {
			out = append(out, item.(map[string]any)["title"].(string))
		}
		return out
	}
	for q, want := range map[string][]string{
		" snow ":        {"Will it snow by Friday?"}, // the private community's market is excluded
		"weather nerds": {"Will it snow by Friday?", "Rain at 50% chance?"},
		"%":             {"Rain at 50% chance?"},
		"_":             {},
	} {
		if got := titles(q); !sameSet(got, want) {
			t.Fatalf("markets q=%q: got %v, want %v", q, got, want)
		}
	}
}

// COM-21: the API says when an invite link expires.
func TestCOM21InviteExpiresAt(t *testing.T) {
	app, pool := setup(t)
	owner, _ := register(t, app, "Creator")
	mod, _ := register(t, app, "Moddy")
	member, _ := register(t, app, "Member")

	created := call(t, app, http.MethodPost, "/communities", owner, map[string]any{"name": "Expiry", "visibility": "PUBLIC", "moderatorUsernames": []string{"Moddy"}})
	expect(t, created, http.StatusCreated, "")
	id := itoa(created.body["id"].(float64))
	expect(t, call(t, app, http.MethodPost, "/communities/"+id+"/join", member, nil), http.StatusOK, "")

	expiresIn := func(body map[string]any) time.Duration {
		t.Helper()
		at, err := time.Parse(time.RFC3339Nano, body["inviteExpiresAt"].(string))
		if err != nil {
			t.Fatalf("inviteExpiresAt: %v (%v)", err, body)
		}
		return time.Until(at)
	}
	if d := expiresIn(created.body); d < 14*time.Minute || d > 15*time.Minute {
		t.Fatalf("create: expires in %v", d)
	}
	for _, who := range []string{owner, mod} {
		d := call(t, app, http.MethodGet, "/communities/"+id, who, nil)
		if d.body["inviteCode"] == nil || expiresIn(d.body) < 14*time.Minute {
			t.Fatalf("admin/moderator should see code and expiry: %v", d.body)
		}
	}
	m := call(t, app, http.MethodGet, "/communities/"+id, member, nil)
	if v, ok := m.body["inviteExpiresAt"]; !ok || v != nil || m.body["inviteCode"] != nil {
		t.Fatalf("members get null code and expiry: %v", m.body)
	}

	// Regenerating returns the new code's expiry, matching the database.
	if _, err := pool.Exec(context.Background(), `UPDATE communities SET invite_expires_at=now()-interval '1 minute' WHERE id=$1`, created.body["id"].(float64)); err != nil {
		t.Fatal(err)
	}
	fresh := call(t, app, http.MethodPost, "/communities/"+id+"/invite-code", owner, nil)
	expect(t, fresh, http.StatusOK, "")
	if d := expiresIn(fresh.body); d < 14*time.Minute || d > 15*time.Minute {
		t.Fatalf("regenerate: expires in %v", d)
	}
	after := call(t, app, http.MethodGet, "/communities/"+id, owner, nil)
	if after.body["inviteCode"] != fresh.body["inviteCode"] || after.body["inviteExpiresAt"] != fresh.body["inviteExpiresAt"] {
		t.Fatalf("detail %v should match regenerate %v", after.body, fresh.body)
	}
	expect(t, call(t, app, http.MethodPost, "/communities/"+id+"/invite-code", mod, nil), http.StatusForbidden, "FORBIDDEN")
}

func sameSet(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	seen := map[string]int{}
	for _, s := range got {
		seen[s]++
	}
	for _, s := range want {
		if seen[s]--; seen[s] < 0 {
			return false
		}
	}
	return true
}
