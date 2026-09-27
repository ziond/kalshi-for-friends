package markets

import (
	"encoding/json"
	"github.com/gofiber/fiber/v2"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
)

func (a *API) Positions(c *fiber.Ctx) error {
	limit, offset, err := page(c)
	if err != nil {
		return err
	}
	status := c.Query("status")
	if status != "" && status != "open" && status != "settled" {
		return invalid("status", "Use open or settled")
	}
	rows, err := a.Pool.Query(c.UserContext(), `SELECT p.id FROM positions p JOIN markets m ON m.id=p.market_id WHERE p.user_id=$1 AND ($2='' OR ($2='open' AND m.status='OPEN' AND m.deadline>now()) OR ($2='settled' AND (m.status<>'OPEN' OR m.deadline<=now()))) ORDER BY p.created_at DESC,p.id DESC LIMIT $3 OFFSET $4`, middleware.UserID(c), status, limit+1, offset)
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
		d, err := positionJSON(c.UserContext(), a.Pool, id)
		if err != nil {
			return err
		}
		items = append(items, d)
	}
	return c.JSON(paginated(items, limit, offset))
}

func (a *API) Transactions(c *fiber.Ctx) error {
	limit, offset, err := page(c)
	if err != nil {
		return err
	}
	rows, err := a.Pool.Query(c.UserContext(), `SELECT jsonb_build_object('id',t.id,'amount',t.amount,'type',CASE WHEN t.transaction_type='POINT_REFILL' THEN 'DEPOSIT' ELSE t.transaction_type END,'balanceAfter',t.balance_after,'createdAt',t.created_at,'reference',CASE WHEN t.reference_id IS NULL THEN NULL ELSE jsonb_build_object('type',t.reference_type,'id',t.reference_id,'label',m.title) END) FROM transactions t LEFT JOIN positions p ON p.id=t.position_id LEFT JOIN markets m ON m.id=COALESCE(t.market_id,p.market_id) WHERE t.user_id=$1 ORDER BY t.created_at DESC,t.id DESC LIMIT $2 OFFSET $3`, middleware.UserID(c), limit+1, offset)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return err
		}
		items = append(items, raw)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(paginated(items, limit, offset))
}

func (a *API) Activity(c *fiber.Ctx) error {
	id, err := pathID(c)
	if err != nil {
		return err
	}
	if _, err := a.detail(c.UserContext(), id, middleware.UserID(c)); err != nil {
		return err
	}
	limit, offset, err := page(c)
	if err != nil {
		return err
	}
	rows, err := a.Pool.Query(c.UserContext(), `SELECT jsonb_build_object('id',p.id,'user',jsonb_build_object('id',u.id,'username',u.username,'avatarUrl',u.avatar_url),'optionId',p.option_id,'optionText',o.option_text,'amount',p.amount,'createdAt',p.created_at) FROM positions p JOIN users u ON u.id=p.user_id JOIN market_options o ON o.id=p.option_id WHERE p.market_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`, id, limit+1, offset)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return err
		}
		items = append(items, raw)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(paginated(items, limit, offset))
}

func (a *API) ModQueue(c *fiber.Ctx) error {
	rows, err := a.Pool.Query(c.UserContext(), `SELECT m.id FROM markets m JOIN communities c ON c.id=m.community_id WHERE m.status IN ('OPEN','LOCKED') AND ((c.visibility='PRIVATE' AND m.moderator_id=$1) OR (c.visibility='PUBLIC' AND EXISTS(SELECT 1 FROM community_members WHERE community_id=c.id AND user_id=$1 AND role IN ('ADMIN','MODERATOR')))) ORDER BY m.deadline,m.id`, middleware.UserID(c))
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
	pending, active := []json.RawMessage{}, []json.RawMessage{}
	for _, id := range ids {
		d, err := a.detail(c.UserContext(), id, middleware.UserID(c))
		if err != nil {
			return err
		}
		var status struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(d, &status); err != nil {
			return err
		}
		if status.Status == "LOCKED" {
			pending = append(pending, d)
		} else if status.Status == "OPEN" {
			active = append(active, d)
		}
	}
	return c.JSON(fiber.Map{"pending": pending, "active": active})
}

func (a *API) Leaderboard(c *fiber.Ctx) error {
	id, err := pathID(c)
	if err != nil {
		return err
	}
	if err := member(c.UserContext(), a.Pool, id, middleware.UserID(c)); err != nil {
		return err
	}
	rows, err := a.Pool.Query(c.UserContext(), `WITH scores AS (
 SELECT u.id,u.username,u.avatar_url,COALESCE(sum(COALESCE(p.payout,0)-p.amount),0) profit,
 count(DISTINCT p.market_id) FILTER(WHERE p.result IN ('WON','LOST')) total,
 count(DISTINCT p.market_id) FILTER(WHERE p.result='WON') correct
 FROM community_members cm JOIN users u ON u.id=cm.user_id
 LEFT JOIN positions p ON p.user_id=u.id AND p.market_id IN (SELECT id FROM markets WHERE community_id=$1)
 WHERE cm.community_id=$1 GROUP BY u.id)
 SELECT jsonb_build_object('rank',row_number() OVER(ORDER BY profit DESC,id),'user',jsonb_build_object('id',id,'username',username,'avatarUrl',avatar_url),'netProfit',profit,'totalPredictions',total,'correctPredictions',correct,'accuracy',CASE WHEN total=0 THEN 0 ELSE correct::numeric/total END) FROM scores ORDER BY profit DESC,id`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return err
		}
		items = append(items, raw)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(items)
}
