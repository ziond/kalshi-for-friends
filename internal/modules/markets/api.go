package markets

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
)

type API struct {
	Pool        *pgxpool.Pool
	PayoutGrace time.Duration // wait between picking a winner and paying out
}

func invalid(field, message string) error {
	return apperror.Validation("Invalid request", map[string]string{field: message})
}
func pathID(c *fiber.Ctx) (int64, error) {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 || id > 9007199254740991 {
		return 0, apperror.NotFound("Not found")
	}
	return id, nil
}
func member(ctx context.Context, db database.DBTX, community, user int64) error {
	var yes bool
	if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2)`, community, user).Scan(&yes); err != nil {
		return err
	}
	if !yes {
		return apperror.Forbidden("Join the community first")
	}
	return nil
}

// A repeatable-read transaction gives each response one coherent pool/history snapshot.
func (a *API) detail(ctx context.Context, id, user int64) (json.RawMessage, error) {
	tx, err := a.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	data, err := marketJSON(ctx, tx, id, user)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return data, nil
}

func marketJSON(ctx context.Context, db database.DBTX, id, user int64) (json.RawMessage, error) {
	var visibility string
	var community int64
	err := db.QueryRow(ctx, `SELECT c.visibility,m.community_id FROM markets m JOIN communities c ON c.id=m.community_id WHERE m.id=$1`, id).Scan(&visibility, &community)
	if database.IsNoRows(err) {
		return nil, apperror.NotFound("Market not found")
	}
	if err != nil {
		return nil, err
	}
	if visibility == "PRIVATE" {
		if err := member(ctx, db, community, user); err != nil {
			return nil, err
		}
	}
	var raw []byte
	err = db.QueryRow(ctx, `WITH base AS (
 SELECT m.*,c.name community_name,c.visibility,
 CASE WHEN m.status='OPEN' AND m.deadline<=now() THEN 'LOCKED' ELSE m.status END effective_status,
 COALESCE((SELECT sum(total_amount) FROM market_options WHERE market_id=m.id),0) pool,
 EXISTS(SELECT 1 FROM community_members WHERE community_id=m.community_id AND user_id=$2) is_member,
 CASE WHEN c.visibility='PUBLIC' THEN EXISTS(SELECT 1 FROM community_members WHERE community_id=m.community_id AND user_id=$2 AND role IN ('ADMIN','MODERATOR')) ELSE m.moderator_id=$2 END is_mod
 FROM markets m JOIN communities c ON c.id=m.community_id WHERE m.id=$1
 ) SELECT jsonb_build_object(
 'id',b.id,'communityId',b.community_id,'communityName',b.community_name,'communityVisibility',b.visibility,
 'title',b.title,'description',b.description,'marketType',b.market_type,'status',b.effective_status,'deadline',b.deadline,
 'createdAt',b.created_at,'updatedAt',b.updated_at,'totalPool',b.pool,
 'payoutAt',(SELECT payout_at FROM settlements WHERE market_id=b.id),
 'participantCount',(SELECT count(*) FROM market_participants WHERE market_id=b.id),
 'creator',(SELECT jsonb_build_object('id',id,'username',username,'avatarUrl',avatar_url) FROM users WHERE id=b.creator_id),
 'moderator',(SELECT jsonb_build_object('id',id,'username',username,'avatarUrl',avatar_url) FROM users WHERE id=b.moderator_id),
 'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'text',o.option_text,'totalAmount',o.total_amount,
 'positionCount',(SELECT count(*) FROM positions p WHERE p.option_id=o.id),
 'probability',CASE WHEN b.pool=0 THEN 1.0/(SELECT count(*) FROM market_options WHERE market_id=b.id) ELSE o.total_amount::numeric/b.pool END,
 'isWinner',CASE WHEN b.status='RESOLVED' THEN o.id=(SELECT winning_option_id FROM settlements WHERE market_id=b.id) ELSE NULL END) ORDER BY o.sort_order) FROM market_options o WHERE o.market_id=b.id),
 'myStake',(SELECT jsonb_build_object('optionId',p.option_id,'amount',sum(p.amount),'potentialPayout',CASE WHEN b.status='RESOLVED' THEN sum(p.payout) ELSE floor(sum(p.amount)::numeric*b.pool/NULLIF(o.total_amount,0)) END) FROM positions p JOIN market_options o ON o.id=p.option_id WHERE p.market_id=b.id AND p.user_id=$2 GROUP BY p.option_id,o.total_amount),
 'settlement',(SELECT jsonb_build_object('winningOptionId',s.winning_option_id,'resolvedBy',jsonb_build_object('id',u.id,'username',u.username,'avatarUrl',u.avatar_url),'resolvedAt',s.resolved_at,'payoutAt',s.payout_at,'paidOutAt',s.paid_out_at,'notes',s.notes) FROM settlements s JOIN users u ON u.id=s.resolved_by WHERE s.market_id=b.id),
 'permissions',jsonb_build_object('canBet',b.is_member AND b.effective_status='OPEN','canResolve',b.is_mod AND b.effective_status='LOCKED','canCancel',b.is_mod AND b.effective_status IN ('LOCKED','PAYOUT_PENDING'))
 ) FROM base b`, id, user).Scan(&raw)
	if err != nil {
		return nil, err
	}
	// Reconstruct immutable probability history; no additional snapshot table is needed.
	rows, err := db.Query(ctx, `SELECT p.id,p.option_id,p.amount,p.created_at FROM positions p WHERE p.market_id=$1 ORDER BY p.created_at,p.id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result map[string]any
	if err = json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	totals := map[string]int64{}
	for _, v := range result["options"].([]any) {
		o := v.(map[string]any)
		totals[strconv.FormatInt(int64(o["id"].(float64)), 10)] = 0
	}
	pool := int64(0)
	point := func(at any) any {
		probs := map[string]float64{}
		for id, total := range totals {
			if pool == 0 {
				probs[id] = 1 / float64(len(totals))
			} else {
				probs[id] = float64(total) / float64(pool)
			}
		}
		return fiber.Map{"at": at, "probabilities": probs}
	}
	history := []any{point(result["createdAt"])}
	for rows.Next() {
		var pid, option, amount int64
		var at time.Time
		if err := rows.Scan(&pid, &option, &amount, &at); err != nil {
			return nil, err
		}
		totals[strconv.FormatInt(option, 10)] += amount
		pool += amount
		history = append(history, point(at.UTC()))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	result["history"] = history
	return json.Marshal(result)
}

func (a *API) Get(c *fiber.Ctx) error {
	id, err := pathID(c)
	if err != nil {
		return err
	}
	d, err := a.detail(c.UserContext(), id, middleware.UserID(c))
	if err != nil {
		return err
	}
	c.Set("Cache-Control", "no-store") // polled for live odds and payout countdowns
	return c.JSON(d)
}

func (a *API) Create(c *fiber.Ctx) error {
	community, err := pathID(c)
	if err != nil {
		return err
	}
	var req struct {
		Title       string    `json:"title"`
		Description *string   `json:"description"`
		MarketType  string    `json:"marketType"`
		Deadline    time.Time `json:"deadline"`
		Options     []string  `json:"options"`
		ModeratorID int64     `json:"moderatorId"`
	}
	if c.BodyParser(&req) != nil {
		return invalid("body", "Expected valid JSON")
	}
	req.Title = strings.TrimSpace(req.Title)
	if n := utf8.RuneCountInString(req.Title); n < 1 || n > 255 {
		return invalid("title", "Use 1–255 characters")
	}
	if !req.Deadline.After(time.Now()) {
		return invalid("deadline", "Must be in the future")
	}
	if req.MarketType == "BINARY" {
		req.Options = []string{"Yes", "No"}
	} else if req.MarketType != "MULTIPLE_CHOICE" {
		return invalid("marketType", "Choose BINARY or MULTIPLE_CHOICE")
	}
	options := []string{}
	seen := map[string]bool{}
	for _, o := range req.Options {
		o = strings.TrimSpace(o)
		if o == "" {
			continue
		}
		if utf8.RuneCountInString(o) > 255 || seen[strings.ToLower(o)] {
			return invalid("options", "Options must be distinct and at most 255 characters")
		}
		seen[strings.ToLower(o)] = true
		options = append(options, o)
	}
	if len(options) < 2 || len(options) > 10 {
		return invalid("options", "Provide 2–10 outcomes")
	}
	user := middleware.UserID(c)
	var result json.RawMessage
	err = database.WithTx(c.UserContext(), a.Pool, func(tx pgx.Tx) error {
		var visibility string
		if err := tx.QueryRow(c.UserContext(), `SELECT visibility FROM communities WHERE id=$1 FOR SHARE`, community).Scan(&visibility); err != nil {
			if database.IsNoRows(err) {
				return apperror.NotFound("Community not found")
			}
			return err
		}
		if err := member(c.UserContext(), tx, community, user); err != nil {
			return err
		}
		moderator := req.ModeratorID
		if moderator == 0 {
			moderator = user
		}
		if visibility == "PUBLIC" {
			if err := tx.QueryRow(c.UserContext(), `SELECT user_id FROM community_members WHERE community_id=$1 AND role IN ('ADMIN','MODERATOR') ORDER BY CASE role WHEN 'ADMIN' THEN 0 ELSE 1 END,user_id LIMIT 1`, community).Scan(&moderator); err != nil {
				return err
			}
		} else if err := member(c.UserContext(), tx, community, moderator); err != nil {
			return invalid("moderatorId", "Choose a community member")
		}
		var id int64
		if err := tx.QueryRow(c.UserContext(), `INSERT INTO markets(community_id,creator_id,moderator_id,title,description,market_type,deadline) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, community, user, moderator, req.Title, req.Description, req.MarketType, req.Deadline.UTC()).Scan(&id); err != nil {
			return err
		}
		for i, o := range options {
			if _, err := tx.Exec(c.UserContext(), `INSERT INTO market_options(market_id,option_text,sort_order) VALUES($1,$2,$3)`, id, o, i); err != nil {
				return err
			}
		}
		var err error
		result, err = marketJSON(c.UserContext(), tx, id, user)
		return err
	})
	if err != nil {
		return err
	}
	return c.Status(201).JSON(result)
}

// Pagination cursors encode a bounded offset; all list orderings have an ID tie-break.
func page(c *fiber.Ctx) (int, int, error) {
	limit := 20
	if s := c.Query("limit"); s != "" {
		n, e := strconv.Atoi(s)
		if e != nil || n < 1 || n > 100 {
			return 0, 0, invalid("limit", "Use 1–100")
		}
		limit = n
	}
	offset := 0
	if s := c.Query("cursor"); s != "" {
		raw, e := base64.RawURLEncoding.DecodeString(s)
		if e != nil {
			return 0, 0, invalid("cursor", "Invalid cursor")
		}
		n, e := strconv.Atoi(string(raw))
		if e != nil || n < 0 || n > 1000000 {
			return 0, 0, invalid("cursor", "Invalid cursor")
		}
		offset = n
	}
	return limit, offset, nil
}
func paginated(items []json.RawMessage, limit, offset int) fiber.Map {
	var next *string
	if len(items) > limit {
		items = items[:limit]
		s := base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(offset + limit)))
		next = &s
	}
	return fiber.Map{"items": items, "nextCursor": next}
}

func (a *API) List(c *fiber.Ctx) error {
	limit, offset, err := page(c)
	if err != nil {
		return err
	}
	community := int64(0)
	if c.Params("id") != "" {
		community, err = pathID(c)
		if err != nil {
			return err
		}
		var visibility string
		err = a.Pool.QueryRow(c.UserContext(), `SELECT visibility FROM communities WHERE id=$1`, community).Scan(&visibility)
		if database.IsNoRows(err) {
			return apperror.NotFound("Community not found")
		}
		if err != nil {
			return err
		}
		if visibility == "PRIVATE" {
			if err := member(c.UserContext(), a.Pool, community, middleware.UserID(c)); err != nil {
				return err
			}
		}
	}
	status, visibility, sort := c.Query("status"), c.Query("visibility"), c.Query("sort", "volume")
	if status != "" && status != "OPEN" && status != "LOCKED" && status != "PAYOUT_PENDING" && status != "RESOLVED" && status != "CANCELLED" {
		return invalid("status", "Invalid status")
	}
	if visibility != "" && visibility != "PUBLIC" && visibility != "PRIVATE" {
		return invalid("visibility", "Invalid visibility")
	}
	if sort != "volume" && sort != "newest" {
		return invalid("sort", "Use volume or newest")
	}
	rows, err := a.Pool.Query(c.UserContext(), `SELECT m.id FROM markets m JOIN communities c ON c.id=m.community_id
 WHERE (c.visibility='PUBLIC' OR EXISTS(SELECT 1 FROM community_members WHERE community_id=c.id AND user_id=$1))
 AND ($2::bigint=0 OR c.id=$2) AND ($3='' OR c.visibility=$3)
 AND ($4='' OR CASE WHEN m.status='OPEN' AND m.deadline<=now() THEN 'LOCKED' ELSE m.status END=$4)
 AND ($5='' OR m.title ILIKE '%'||$5||'%' OR c.name ILIKE '%'||$5||'%')
 ORDER BY CASE WHEN $6='volume' THEN COALESCE((SELECT sum(total_amount) FROM market_options WHERE market_id=m.id),0) END DESC,m.created_at DESC,m.id DESC LIMIT $7 OFFSET $8`, middleware.UserID(c), community, visibility, status, c.Query("q"), sort, limit+1, offset)
	if err != nil {
		return err
	}
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	items := []json.RawMessage{}
	for _, id := range ids {
		d, err := a.detail(c.UserContext(), id, middleware.UserID(c))
		if err != nil {
			return err
		}
		items = append(items, d)
	}
	return c.JSON(paginated(items, limit, offset))
}

func (a *API) Bet(c *fiber.Ctx) error {
	id, err := pathID(c)
	if err != nil {
		return err
	}
	var req struct {
		OptionID int64 `json:"optionId"`
		Amount   int64 `json:"amount"`
	}
	if c.BodyParser(&req) != nil || req.Amount < 1 || req.Amount > 9007199254740991 {
		return invalid("amount", "Use a positive whole number")
	}
	user := middleware.UserID(c)
	var balance int64
	var result, position json.RawMessage
	err = database.WithTx(c.UserContext(), a.Pool, func(tx pgx.Tx) error {
		var community int64
		var open bool
		if err := tx.QueryRow(c.UserContext(), `SELECT community_id,status='OPEN' AND deadline>clock_timestamp() FROM markets WHERE id=$1 FOR UPDATE`, id).Scan(&community, &open); err != nil {
			if database.IsNoRows(err) {
				return apperror.NotFound("Market not found")
			}
			return err
		}
		if err := member(c.UserContext(), tx, community, user); err != nil {
			return err
		}
		if !open {
			return apperror.New(409, "MARKET_CLOSED", "Market is closed")
		}
		var valid bool
		if err := tx.QueryRow(c.UserContext(), `SELECT EXISTS(SELECT 1 FROM market_options WHERE market_id=$1 AND id=$2)`, id, req.OptionID).Scan(&valid); err != nil {
			return err
		}
		if !valid {
			return invalid("optionId", "Choose an option in this market")
		}
		var choice int64
		err := tx.QueryRow(c.UserContext(), `SELECT option_id FROM market_participants WHERE market_id=$1 AND user_id=$2`, id, user).Scan(&choice)
		if err != nil && !database.IsNoRows(err) {
			return err
		}
		if err == nil && choice != req.OptionID {
			return apperror.New(409, "OPTION_SWITCH_NOT_ALLOWED", "You already bet on another option")
		}
		if err := tx.QueryRow(c.UserContext(), `SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE`, user).Scan(&balance); err != nil {
			return err
		}
		if balance < req.Amount {
			return apperror.New(409, "INSUFFICIENT_FUNDS", "Not enough points")
		}
		if err := tx.QueryRow(c.UserContext(), `SELECT deadline>clock_timestamp() FROM markets WHERE id=$1`, id).Scan(&open); err != nil {
			return err
		}
		if !open {
			return apperror.New(409, "MARKET_CLOSED", "Market is closed")
		}
		var pool int64
		if err := tx.QueryRow(c.UserContext(), `SELECT COALESCE(sum(total_amount),0) FROM market_options WHERE market_id=$1`, id).Scan(&pool); err != nil {
			return err
		}
		if pool > 9007199254740991-req.Amount {
			return invalid("amount", "Market pool limit reached")
		}
		if _, err := tx.Exec(c.UserContext(), `INSERT INTO market_participants(market_id,user_id,option_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, id, user, req.OptionID); err != nil {
			return err
		}
		var pid int64
		if err := tx.QueryRow(c.UserContext(), `INSERT INTO positions(market_id,user_id,option_id,amount,request_key,created_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()) RETURNING id`, id, user, req.OptionID, req.Amount, uuid.NewString()).Scan(&pid); err != nil {
			return err
		}
		balance -= req.Amount
		if _, err := tx.Exec(c.UserContext(), `UPDATE wallets SET balance=$2,updated_at=now() WHERE user_id=$1`, user, balance); err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `UPDATE market_options SET total_amount=total_amount+$2 WHERE id=$1`, req.OptionID, req.Amount); err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `INSERT INTO transactions(user_id,amount,transaction_type,balance_after,position_id) VALUES($1,$2,'PLACE_POSITION',$3,$4)`, user, -req.Amount, balance, pid); err != nil {
			return err
		}
		if _, err := tx.Exec(c.UserContext(), `UPDATE markets SET updated_at=now() WHERE id=$1`, id); err != nil {
			return err
		}
		result, err = marketJSON(c.UserContext(), tx, id, user)
		if err != nil {
			return err
		}
		position, err = positionJSON(c.UserContext(), tx, pid)
		return err
	})
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"position": position, "market": result, "balance": balance})
}

func positionJSON(ctx context.Context, db database.DBTX, id int64) (json.RawMessage, error) {
	var raw []byte
	err := db.QueryRow(ctx, `SELECT jsonb_build_object('id',p.id,'market',jsonb_build_object('id',m.id,'communityId',m.community_id,'title',m.title,'status',CASE WHEN m.status='OPEN' AND m.deadline<=now() THEN 'LOCKED' ELSE m.status END,'deadline',m.deadline),'optionId',p.option_id,'optionText',o.option_text,'amount',p.amount,'result',p.result,'payout',p.payout,'potentialPayout',CASE WHEN p.result='PENDING' THEN floor(p.amount::numeric*(SELECT sum(total_amount) FROM market_options WHERE market_id=m.id)/NULLIF(o.total_amount,0)) ELSE 0 END,'createdAt',p.created_at) FROM positions p JOIN markets m ON m.id=p.market_id JOIN market_options o ON o.id=p.option_id WHERE p.id=$1`, id).Scan(&raw)
	return raw, err
}
