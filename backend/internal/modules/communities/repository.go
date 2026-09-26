package communities

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/ziond/kalshi-for-friends/backend/internal/database"
)

// Auto-generated name of the inline UNIQUE on communities.invite_code
// (migration 000002).
const inviteCodeUniqueConstraint = "communities_invite_code_key"

// Open markets are OPEN and not past their deadline, matching the rule that a
// market is effectively LOCKED once now >= deadline.
const summaryColumns = `
	c.id, c.name, c.description, c.created_at, cm.role,
	(SELECT count(*) FROM community_members m WHERE m.community_id = c.id),
	(SELECT count(*) FROM markets mk
	  WHERE mk.community_id = c.id AND mk.status = 'OPEN' AND mk.deadline > CURRENT_TIMESTAMP)`

func scanSummary(row pgx.Row, s *CommunitySummary, extra ...any) error {
	dest := append([]any{&s.ID, &s.Name, &s.Description, &s.CreatedAt, &s.MyRole, &s.MemberCount, &s.OpenMarketCount}, extra...)
	if err := row.Scan(dest...); err != nil {
		return err
	}
	s.CreatedAt = s.CreatedAt.UTC()
	return nil
}

func listForUser(ctx context.Context, db database.DBTX, userID int64) ([]CommunitySummary, error) {
	rows, err := db.Query(ctx, `
		SELECT `+summaryColumns+`
		FROM community_members cm
		JOIN communities c ON c.id = cm.community_id
		WHERE cm.user_id = $1
		ORDER BY cm.joined_at DESC, c.id DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []CommunitySummary{}
	for rows.Next() {
		var s CommunitySummary
		if err := scanSummary(rows, &s); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, rows.Err()
}

// getDetail returns pgx.ErrNoRows when the community does not exist or the
// user is not a member. The invite code is always populated; the service
// decides whether the caller may see it.
func getDetail(ctx context.Context, db database.DBTX, communityID, userID int64) (*CommunityDetail, error) {
	var d CommunityDetail
	var inviteCode string
	row := db.QueryRow(ctx, `
		SELECT `+summaryColumns+`, u.id, u.username, u.avatar_url, c.invite_code
		FROM communities c
		JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = $2
		JOIN users u ON u.id = c.creator_id
		WHERE c.id = $1`, communityID, userID)
	err := scanSummary(row, &d.CommunitySummary,
		&d.Creator.ID, &d.Creator.Username, &d.Creator.AvatarURL, &inviteCode)
	if err != nil {
		return nil, err
	}
	d.InviteCode = &inviteCode
	return &d, nil
}

func insertCommunity(ctx context.Context, db database.DBTX, name string, description *string, inviteCode string, creatorID int64) (int64, error) {
	var id int64
	err := db.QueryRow(ctx, `
		INSERT INTO communities (name, description, invite_code, creator_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id`, name, description, inviteCode, creatorID).Scan(&id)
	return id, err
}

// insertMember reports false when the user is already a member.
func insertMember(ctx context.Context, db database.DBTX, communityID, userID int64, role Role) (bool, error) {
	tag, err := db.Exec(ctx, `
		INSERT INTO community_members (community_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (community_id, user_id) DO NOTHING`, communityID, userID, role)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func findIDByInviteCode(ctx context.Context, db database.DBTX, inviteCode string) (int64, error) {
	var id int64
	err := db.QueryRow(ctx, `SELECT id FROM communities WHERE invite_code = $1`, inviteCode).Scan(&id)
	return id, err
}

// lockCommunity serializes membership/role changes within one community so
// the last-admin check cannot race. NO KEY UPDATE does not block inserts that
// only reference the row by foreign key (joins, new markets).
func lockCommunity(ctx context.Context, db database.DBTX, communityID int64) error {
	var id int64
	return db.QueryRow(ctx,
		`SELECT id FROM communities WHERE id = $1 FOR NO KEY UPDATE`, communityID).Scan(&id)
}

func getRole(ctx context.Context, db database.DBTX, communityID, userID int64) (Role, error) {
	var role Role
	err := db.QueryRow(ctx, `
		SELECT role FROM community_members
		WHERE community_id = $1 AND user_id = $2`, communityID, userID).Scan(&role)
	return role, err
}

func updateCommunity(ctx context.Context, db database.DBTX, communityID int64,
	setName bool, name string, setDescription bool, description *string) error {
	_, err := db.Exec(ctx, `
		UPDATE communities
		SET name        = CASE WHEN $2 THEN $3 ELSE name END,
		    description = CASE WHEN $4 THEN $5 ELSE description END,
		    updated_at  = CURRENT_TIMESTAMP
		WHERE id = $1`, communityID, setName, name, setDescription, description)
	return err
}

func updateInviteCode(ctx context.Context, db database.DBTX, communityID int64, inviteCode string) error {
	_, err := db.Exec(ctx, `
		UPDATE communities
		SET invite_code = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`, communityID, inviteCode)
	return err
}

const memberColumns = `u.id, u.username, u.avatar_url, cm.role, cm.joined_at`

func scanMember(row pgx.Row) (*CommunityMember, error) {
	var m CommunityMember
	if err := row.Scan(&m.User.ID, &m.User.Username, &m.User.AvatarURL, &m.Role, &m.JoinedAt); err != nil {
		return nil, err
	}
	m.JoinedAt = m.JoinedAt.UTC()
	return &m, nil
}

func listMembers(ctx context.Context, db database.DBTX, communityID int64) ([]CommunityMember, error) {
	rows, err := db.Query(ctx, `
		SELECT `+memberColumns+`
		FROM community_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.community_id = $1
		ORDER BY CASE cm.role WHEN 'ADMIN' THEN 0 WHEN 'MODERATOR' THEN 1 ELSE 2 END,
		         cm.joined_at, u.id`, communityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []CommunityMember{}
	for rows.Next() {
		m, err := scanMember(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *m)
	}
	return list, rows.Err()
}

func getMember(ctx context.Context, db database.DBTX, communityID, userID int64) (*CommunityMember, error) {
	return scanMember(db.QueryRow(ctx, `
		SELECT `+memberColumns+`
		FROM community_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.community_id = $1 AND cm.user_id = $2`, communityID, userID))
}

func countAdmins(ctx context.Context, db database.DBTX, communityID int64) (int, error) {
	var n int
	err := db.QueryRow(ctx, `
		SELECT count(*) FROM community_members
		WHERE community_id = $1 AND role = 'ADMIN'`, communityID).Scan(&n)
	return n, err
}

func updateMemberRole(ctx context.Context, db database.DBTX, communityID, userID int64, role Role) error {
	_, err := db.Exec(ctx, `
		UPDATE community_members SET role = $3
		WHERE community_id = $1 AND user_id = $2`, communityID, userID, role)
	return err
}

func deleteMember(ctx context.Context, db database.DBTX, communityID, userID int64) error {
	_, err := db.Exec(ctx, `
		DELETE FROM community_members
		WHERE community_id = $1 AND user_id = $2`, communityID, userID)
	return err
}
