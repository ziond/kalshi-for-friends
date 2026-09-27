package router_test

import (
	"context"
	"testing"
	"time"
)

func TestInviteExpiresAndCanBeRegenerated(t *testing.T) {
	app, pool := setup(t)
	owner, _ := register(t, app, "InviteOwner")
	guest, _ := register(t, app, "InviteGuest")
	created := call(t, app, "POST", "/communities", owner, map[string]string{"name": "Invite test", "visibility": "PRIVATE"})
	expect(t, created, 201, "")
	id := created.body["id"].(float64)
	code := created.body["inviteCode"].(string)
	var remaining float64
	checkTTL := func() {
		t.Helper()
		if err := pool.QueryRow(context.Background(), `SELECT extract(epoch FROM invite_expires_at-clock_timestamp()) FROM communities WHERE id=$1`, int64(id)).Scan(&remaining); err != nil {
			t.Fatal(err)
		}
		if remaining < 890 || remaining > 900 {
			t.Fatalf("expected 15 minutes, got %f seconds", remaining)
		}
	}
	checkTTL()
	expect(t, call(t, app, "GET", "/public/invites/"+code, "", nil), 200, "")
	expect(t, call(t, app, "GET", "/invites/"+code, guest, nil), 200, "")
	if _, err := pool.Exec(context.Background(), `UPDATE communities SET invite_expires_at=$2 WHERE id=$1`, int64(id), time.Now().Add(-time.Second)); err != nil {
		t.Fatal(err)
	}
	expect(t, call(t, app, "GET", "/public/invites/"+code, "", nil), 404, "INVALID_INVITE_CODE")
	expect(t, call(t, app, "GET", "/invites/"+code, guest, nil), 404, "INVALID_INVITE_CODE")
	expect(t, call(t, app, "POST", "/communities/join", guest, map[string]string{"inviteCode": code}), 404, "INVALID_INVITE_CODE")
	var count int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM community_members WHERE community_id=$1`, int64(id)).Scan(&count); err != nil || count != 1 {
		t.Fatalf("expired invite changed membership: %d %v", count, err)
	}
	fresh := call(t, app, "POST", "/communities/"+itoa(id)+"/invite-code", owner, nil)
	expect(t, fresh, 200, "")
	checkTTL()
	newCode := fresh.body["inviteCode"].(string)
	expect(t, call(t, app, "POST", "/communities/join", guest, map[string]string{"inviteCode": code}), 404, "INVALID_INVITE_CODE")
	expect(t, call(t, app, "POST", "/communities/join", guest, map[string]string{"inviteCode": newCode}), 200, "")
}
