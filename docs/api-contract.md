# API Contract (MVP)

Contract between the Go backend and the Next.js frontend. Go structs should mirror the TypeScript types below exactly (same field names via `json:"camelCase"` tags).

Status: **draft, authoritative for the backend** — the Go API implements what this document says. When the frontend needs a behaviour change, this document is updated in the same change (see [requirements.md](requirements.md)).

---

## 1. Schema decisions to settle

| # | Issue | Decision |
|---|---|---|
| 1 | `users.username` isn't unique | Add `UNIQUE` |
| 2 | A user could join a community twice | `UNIQUE(community_id, user_id)` on `community_members` |
| 3 | A user could have two wallets | `UNIQUE(user_id)` on `wallets` |
| 4 | Multiple bets per market? | Users may add to the same option; switching to another option is rejected (`OPTION_SWITCH_NOT_ALLOWED`) |
| 5 | Payout model | Parimutuel pool: `payout = floor(stake × totalPool / winningOptionPool)`. Rounding remainder goes to the largest winner. Displayed odds = `option.total_amount / market pool`. The stake confirmation in the UI estimates a return with the same formula, adding the new stake to the pool and option first |
| 6 | `LOSS` transaction | Coins already left at `PLACE_POSITION`. Log `LOSS` with `amount = 0` for history only (or drop the type) so the ledger doesn't double-count |
| 7 | `transactions.reference_id` is ambiguous | Add `reference_type` (`POSITION` / `MARKET`) and `balance_after` |
| 8 | Who sets `LOCKED`? | A market is locked when `now > deadline` — computed on read or set by a scheduled job, never manual. The same job pays out `PAYOUT_PENDING` markets whose `payout_at` has passed (see row 16) |
| 9 | `CANCELLED` markets | Refund every position with `REFUND` transactions. No settlement row (delete the pending one if the market was nullified during its grace period). Final: a cancelled market never changes again |
| 10 | Wallets are global, leaderboards are per community | Community leaderboards are computed from positions + settlements within that community (see `LeaderboardEntry`). `users.prediction_score` stays global. The UI ranks leaderboards by win rate (`correctPredictions / totalPredictions`) itself, so the API's order doesn't matter |
| 11 | `BINARY` options | Backend auto-creates `YES` / `NO`; the client never sends them |
| 12 | Public vs private communities (from the original design) | Add `communities.visibility VARCHAR(10) NOT NULL` (`PUBLIC` / `PRIVATE`). Public ones appear in Discover and can be joined directly; private ones need an invite code |
| 13 | Who moderates a market | **Public** community: the community's `MODERATOR`s (chosen at creation) resolve all its markets, and `moderatorId` is ignored. **Private** community: the creator picks any member as `markets.moderator_id` per market |
| 14 | When moderators act | The moderator can pick a winner only once the market is `LOCKED` (past its deadline), and can nullify while it's `LOCKED` or `PAYOUT_PENDING`. "Nullify" = cancel + refund, immediate and final |
| 15 | "Probability history" chart | Needs history. Add `market_price_snapshots(market_id, taken_at, probabilities JSONB)`, and write a row on market creation and after every position. Alternatively, rebuild the history from `positions` on read. Return the full history: the UI's 1H / 24H / ALL toggles filter it client-side using each point's `at` |
| 16 | Payout grace period | Picking a winner doesn't pay out. It inserts the settlement with `payout_at = resolved_at + 5 minutes` (`PAYOUT_GRACE_MINUTES`, one backend setting) and sets status `PAYOUT_PENDING`; no coins move and positions stay `PENDING`. The pick is final: it can never be switched to another outcome, so until `payout_at` the moderator's only option is to nullify (refund everyone, final). A second pick for any option, including the same one, is rejected and changes nothing. At `payout_at` a scheduled job — or the next read, if the job is late — pays out, sets `paid_out_at` and status `RESOLVED`. Add `settlements.payout_at` and `settlements.paid_out_at`, and allow `PAYOUT_PENDING` in the `markets.status` check |
| 17 | Points economy (MVP) | 1,000 points on signup (`INITIAL_BONUS`) and 1,000 more claimable every 24 hours (`DAILY_BONUS`); no other way to add points. Add `wallets.next_daily_bonus_at TIMESTAMPTZ NOT NULL` (set to `created_at + 24h` at signup, backfill existing wallets to `now()`), allow `DAILY_BONUS` in the transaction type check, and remove the deposit endpoint. Amount and interval are backend settings |

## 2. Conventions

- Base path: `/api/v1`
- JSON fields are camelCase.
- IDs are JSON numbers (BIGSERIAL stays below JS's 2^53 limit).
- Timestamps are ISO-8601 UTC strings.
- Coins are integers only.
- Auth: JWTs in httpOnly cookies — see [Authentication](#authentication) below.
- Lists use cursor pagination: `?cursor=&limit=`.
- Every request from the frontend (browser calls and the route guard's refresh) carries `ngrok-skip-browser-warning: 1`. Free ngrok tunnels otherwise answer browser requests with an HTML warning page (`ERR_NGROK_6024`, status 200) instead of forwarding them to the API. The backend can ignore the header; if the API is ever called cross-origin, add it to `Access-Control-Allow-Headers`.
- Every response with a body is JSON (`Content-Type: application/json`). The frontend treats any other successful response as an error.
- All errors share one shape:

```json
{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "Not enough coins", "fields": {} } }
```

### Live updates (MVP polling)

There's no push channel in the MVP. A market page stays current by polling:

- **What's polled:** `GET /markets/:id` and `GET /markets/:id/activity`, every **5 seconds**, only while the page is open and visible and the market is `OPEN`, `LOCKED` or `PAYOUT_PENDING`. Polling stops once the market is `RESOLVED` or `CANCELLED`. The Mod queue page also polls `GET /me/mod-queue` every 5 seconds while `payoutPending` isn't empty.
- **Countdowns:** during a grace period the UI counts down to `settlement.payoutAt` (or `MarketSummary.payoutAt`) on its own and re-fetches the moment it reaches zero, so the payout must be visible to reads made at or just after `payoutAt` (see schema decision 16).
- **Load:** about 2 requests per viewer every 5 seconds (≈ 40 requests/second for 100 viewers). Both endpoints should stay cheap: no per-request recomputation that grows with total bets beyond what's needed for the response.
- **No caching:** these endpoints must send `Cache-Control: no-store`, so no browser or proxy serves stale odds or statuses.
- **Rate limits:** if the API rate-limits, allow at least 1 request per 5 seconds per endpoint per user (and a burst when a tab regains focus).
- **Settlement:** when a poll returns a market that has moved from `OPEN`/`LOCKED`/`PAYOUT_PENDING` to `RESOLVED`/`CANCELLED`, the frontend refetches `GET /me`, the user's positions, the feeds and that community's leaderboard. `MarketDetail.status`, `settlement` and `myStake` must therefore be up to date on every read.
- **Later:** replace polling with Server-Sent Events or WebSockets, or support `ETag` / `If-None-Match` → `304 Not Modified` to make unchanged polls cheap. Either is backwards-compatible with this contract.

### Authentication

The Go backend issues two JWTs and sends both as cookies. No server-side sessions.

| | `access_token` | `refresh_token` |
|---|---|---|
| Purpose | Authenticates every API request | Gets a new pair when the access token expires |
| Signed with | EdDSA (Ed25519) private key held only by the backend | Backend's choice (only the backend reads it) |
| Required claims | `user_id` (number), `exp`, `iat` | Backend's choice; include a `jti` if refresh tokens can be revoked |
| Suggested lifetime | 15 minutes | 7–30 days |
| Cookie attributes | `HttpOnly; SameSite=Lax; Path=/; Secure` (omit `Secure` on http://localhost). No `Domain` | same |

- **Set on:** `POST /auth/login`, `POST /auth/register` and `POST /auth/refresh`. **Cleared on:** `POST /auth/logout` (expire both cookies).
- **`Path=/` is required on both cookies.** The Next.js route guard (`src/proxy.ts`) runs on page URLs, not `/api/v1`, so it can only see cookies scoped to `/`.
- **Don't set `Domain`.** The browser calls `/api/v1/*` on the Next.js origin, which rewrites to `API_URL`, so the cookies arrive from the Next.js host. A `Domain` naming the backend host (e.g. an ngrok URL) makes the browser drop them and login appears to do nothing.
- **Public key:** the backend shares its Ed25519 public key as `public.pem` (SPKI PEM). The frontend reads it from `JWT_PUBLIC_KEY_PATH` (default `public.pem` at the frontend repository root) or `JWT_PUBLIC_KEY` and verifies `access_token` locally, accepting only `alg: EdDSA`.
- **Refresh:** `POST /auth/refresh` reads the `refresh_token` cookie, returns `204` with new `access_token` and `refresh_token` cookies, or `401` if the refresh token is missing, expired or revoked. It should rotate the refresh token on every use.
- **Backend checks on every protected endpoint:** verify the `access_token` signature and `exp`, take the acting user from `user_id` (never from the request body), and return `401 UNAUTHORIZED` if the token is missing, invalid or expired.

**How the frontend uses them:**
1. **Page requests:** `proxy.ts` verifies `access_token` with the public key. Invite pages (`/invite/:code`) and link-preview images are open to everyone, because link-preview bots never send cookies; signed-out visitors there get a sign-up/log-in card instead of a redirect. If it's invalid and a `refresh_token` exists, the proxy calls `POST {API_URL}/api/v1/auth/refresh`, forwards the new `Set-Cookie` headers to the browser, and lets the page load. Otherwise it redirects to `/login?next=<path>`.
2. **API calls from the browser:** on a `401`, the client calls `/auth/refresh` once, retries the original request, and redirects to `/login?next=<path>` if it still fails. Simultaneous 401s share one refresh call.
3. **After login, register and logout:** the frontend does a full page load to `next` (or `/`, or `/login` after logout) rather than a client-side route change, so the guard reads the cookies the response just set. The cookies must therefore be set on the `/auth/login` and `/auth/register` responses themselves.

## 3. Response types

```ts
// ---- primitives ----
type ID = number;
type ISODate = string;
type Role = 'MEMBER' | 'MODERATOR' | 'ADMIN';
type Visibility = 'PUBLIC' | 'PRIVATE';
type MarketType = 'BINARY' | 'MULTIPLE_CHOICE';
type MarketStatus = 'OPEN' | 'LOCKED' | 'PAYOUT_PENDING' | 'RESOLVED' | 'CANCELLED';
// OPEN → LOCKED (deadline) → PAYOUT_PENDING (winner picked, grace period) → RESOLVED (paid out)
// LOCKED | PAYOUT_PENDING → CANCELLED (nullified, refunded, final)
type TransactionType = 'INITIAL_BONUS' | 'DAILY_BONUS' | 'DEPOSIT' | 'PLACE_POSITION' | 'WIN_REWARD' | 'LOSS' | 'REFUND';
// DEPOSIT is legacy (free top-ups, removed); keep it only so existing rows still parse. Never create it.
type PositionResult = 'PENDING' | 'WON' | 'LOST' | 'REFUNDED';

interface Paginated<T> { items: T[]; nextCursor: string | null; }
interface ApiError { error: { code: string; message: string; fields?: Record<string, string> } }

// ---- users ----
interface UserSummary { id: ID; username: string; avatarUrl: string | null; }

interface UserStats {
  predictionScore: number;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;            // correct / total, 0–1, computed
}

interface Me extends UserSummary, UserStats {
  email: string;
  balance: number;             // joined from wallets so the navbar needs one call
  nextDailyBonusAt: ISODate;   // when the next daily bonus can be claimed; claimable once in the past
                               // (signup + 24h at first, then last claim + 24h)
  createdAt: ISODate;
}

interface DailyBonusResponse { // POST /me/daily-bonus
  amount: number;              // 1000 (DAILY_BONUS_POINTS)
  balance: number;             // new wallet balance
  nextDailyBonusAt: ISODate;   // now + 24h
}

interface UserProfile extends UserSummary, UserStats { createdAt: ISODate; }

// ---- communities ----
interface CommunitySummary {
  id: ID;
  name: string;
  description: string | null;
  visibility: Visibility;
  memberCount: number;
  openMarketCount: number;
  moderators: UserSummary[];   // community-level moderators
  myRole: Role | null;         // null when not a member (Discover)
  createdAt: ISODate;
}

interface CommunityDetail extends CommunitySummary {
  creator: UserSummary;
  inviteCode: string | null;   // only returned to MODERATOR/ADMIN
}

interface InvitePreview {      // shown on /invite/:code before joining
  inviteCode: string;
  community: Pick<CommunitySummary, 'id' | 'name' | 'description' | 'visibility' | 'memberCount' | 'moderators'>;
  alreadyMember: boolean;
}

interface PublicInvite {       // GET /public/invites/:code — no sign-in; link previews and the signed-out invite page
  inviteCode: string;
  community: Pick<CommunitySummary, 'name' | 'visibility' | 'memberCount'>;  // nothing else: no description, moderators or members
}

interface CommunityMember { user: UserSummary; role: Role; joinedAt: ISODate; }

interface LeaderboardEntry {   // one per member, including members with no settled predictions
  rank: number;                // server's rank by netProfit; the UI ignores it and re-ranks by win rate
  user: UserSummary;
  netProfit: number;           // payouts minus stakes on WON/LOST positions in this community; refunds excluded
  correctPredictions: number;  // markets in this community the member won (each market counts once)
  totalPredictions: number;    // markets in this community the member won or lost; refunded/unsettled excluded
  accuracy: number;            // correctPredictions / totalPredictions, 0–1; 0 when totalPredictions = 0
}

// ---- markets ----
interface MarketOption {
  id: ID;
  text: string;
  totalAmount: number;
  positionCount: number;
  probability: number;         // totalAmount / market pool, 0–1 (even split if pool = 0)
  isWinner: boolean | null;    // null until RESOLVED (still null during PAYOUT_PENDING; see settlement.winningOptionId)
}

interface MyStake { optionId: ID; amount: number; potentialPayout: number; }  // after RESOLVED, potentialPayout is the actual payout; the "You literally called it." card shows potentialPayout - amount

interface MarketSummary {
  id: ID;
  communityId: ID;
  communityName: string;       // cards show the community chip
  communityVisibility: Visibility;
  title: string;
  marketType: MarketType;
  status: MarketStatus;
  deadline: ISODate;
  totalPool: number;           // cards: "N pts staked"; market info: "Volume"
  participantCount: number;    // market page: "N predicting"
  options: MarketOption[];
  creator: UserSummary;
  moderator: UserSummary;
  myStake: MyStake | null;     // null if the current user hasn't bet
  payoutAt: ISODate | null;    // settlement.payoutAt once a winner is picked, else null (Mod queue countdowns)
}

interface Settlement {         // exists from the moment a winner is picked; removed if the market is nullified
  winningOptionId: ID;
  resolvedBy: UserSummary;
  resolvedAt: ISODate;         // when the moderator picked the winner
  payoutAt: ISODate;           // resolvedAt + PAYOUT_GRACE_MINUTES (5)
  paidOutAt: ISODate | null;   // null during the grace period (PAYOUT_PENDING)
  notes: string | null;
}

interface PricePoint {
  at: ISODate;
  probabilities: Record<ID, number>;  // optionId -> 0–1
}

interface MarketDetail extends MarketSummary {
  description: string | null;
  settlement: Settlement | null;
  history: PricePoint[];       // oldest first; last point = current probabilities; the full history is returned on every poll
  createdAt: ISODate;
  updatedAt: ISODate;
  permissions: { canBet: boolean; canResolve: boolean; canCancel: boolean };
  // canResolve: moderator && LOCKED. canCancel: moderator && (LOCKED || PAYOUT_PENDING).
}

interface ModQueue {           // markets the current user moderates; the two Mod queue tabs
  pending: MarketSummary[];    // LOCKED, waiting for a pick or nullify (counted in the nav badge)
  payoutPending: MarketSummary[]; // PAYOUT_PENDING, in the grace period; can still be nullified
  active: MarketSummary[];     // still OPEN
}

interface MarketActivity {     // "Sarah put 150 on John" feed
  id: ID;                      // position id
  user: UserSummary;
  optionId: ID;
  optionText: string;
  amount: number;
  createdAt: ISODate;
}

// ---- positions / wallet ----
interface Position {
  id: ID;
  market: Pick<MarketSummary, 'id' | 'communityId' | 'title' | 'status' | 'deadline'>;
  optionId: ID;
  optionText: string;
  amount: number;
  result: PositionResult;
  payout: number | null;       // set once resolved or cancelled
  potentialPayout: number;     // at current odds, while PENDING
  createdAt: ISODate;
}

interface Wallet { balance: number; updatedAt: ISODate; }

interface Transaction {
  id: ID;
  amount: number;              // signed: -200 or +450
  type: TransactionType;
  balanceAfter: number;
  reference: { type: 'POSITION' | 'MARKET'; id: ID; label: string } | null; // label = market title
  createdAt: ISODate;
}
```

## 4. Request bodies

```ts
interface RegisterRequest   { username: string; email: string; password: string; }
interface LoginRequest      { email: string; password: string; }
interface UpdateMeRequest   { username?: string; avatarUrl?: string; }

interface CreateCommunityRequest {
  name: string;
  description?: string;
  visibility: Visibility;
  moderatorUsernames?: string[]; // PUBLIC only; creator is always included
}
interface UpdateCommunityRequest  { name?: string; description?: string; }
interface JoinCommunityRequest    { inviteCode: string; }
interface UpdateMemberRoleRequest { role: Role; }

interface CreateMarketRequest {
  title: string;
  description?: string;
  marketType: MarketType;
  deadline: ISODate;           // must be in the future
  options?: string[];          // required for MULTIPLE_CHOICE (2–10), ignored for BINARY
  moderatorId?: ID;            // PRIVATE communities only: any member, defaults to creator
}

interface MarketListParams {   // query string for GET /markets
  status?: MarketStatus;
  visibility?: Visibility;     // PRIVATE = my private communities, PUBLIC = all public ones
  sort?: 'volume' | 'newest';  // default volume
  cursor?: string;
  limit?: number;
}


interface PlacePositionRequest { optionId: ID; amount: number; }  // whole number, 1 <= amount <= balance (the UI pre-checks the balance; the API must still enforce it)
interface ResolveMarketRequest { winningOptionId: ID; notes?: string; }
interface CancelMarketRequest  { reason?: string; }
```

## 5. Routes

All routes are prefixed with `/api/v1`. Every route requires a valid `access_token` cookie except `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` and `GET /public/invites/:code`.

### Auth and current user

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `RegisterRequest` | `Me` + sets `access_token` and `refresh_token` cookies — also creates wallet (1,000 points, `next_daily_bonus_at = now + 24h`) + `INITIAL_BONUS` transaction |
| POST | `/auth/login` | `LoginRequest` | `Me` + sets `access_token` and `refresh_token` cookies. `401 UNAUTHORIZED` for wrong email or password |
| POST | `/auth/refresh` | — (uses the `refresh_token` cookie) | `204` + new `access_token` and `refresh_token` cookies, or `401` |
| POST | `/auth/logout` | — | `204` + clears both cookies |
| GET | `/me` | — | `Me` |
| PATCH | `/me` | `UpdateMeRequest` | `Me` |
| GET | `/me/positions?status=open\|settled&cursor=` | — | `Paginated<Position>` |
| GET | `/me/wallet` | — | `Wallet` |
| POST | `/me/daily-bonus` | — | `DailyBonusResponse` — adds 1,000 points if `nextDailyBonusAt` has passed and sets it to now + 24h; writes a `DAILY_BONUS` transaction. Otherwise `409 DAILY_BONUS_NOT_READY` ("Your next 1,000 points are ready in 5h 12m") and nothing changes. Missed days don't stack. (Replaces the removed `POST /me/wallet/deposit`.) |
| GET | `/me/transactions?cursor=` | — | `Paginated<Transaction>` |
| GET | `/me/mod-queue` | — | `ModQueue` — polled every 5 s while `payoutPending` isn't empty; `Cache-Control: no-store` |
| GET | `/users/:id` | — | `UserProfile` |

### Communities

| Method | Route | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/communities` | any | — | `CommunitySummary[]` (mine) — Home "Your communities", the Groups page and the profile |
| POST | `/communities` | any | `CreateCommunityRequest` | `CommunityDetail` — creator becomes ADMIN |
| GET | `/communities/discover` | any | — | `CommunitySummary[]` — all PUBLIC communities, joined or not |
| POST | `/communities/join` | any | `JoinCommunityRequest` | `CommunityDetail` — join via invite code |
| GET | `/invites/:code` | any | — | `InvitePreview` |
| GET | `/public/invites/:code` | **no sign-in** | — | `PublicInvite`, or `404 INVALID_INVITE_CODE`. Called server-side by the Next.js app (no cookies, no `Origin`) to build link previews and the signed-out invite page. Rate-limit per IP; may send `Cache-Control: public, max-age=300` |
| GET | `/communities/:id` | member, or anyone if PUBLIC | — | `CommunityDetail` |
| POST | `/communities/:id/join` | any, PUBLIC only | — | `CommunityDetail` |
| PATCH | `/communities/:id` | admin | `UpdateCommunityRequest` | `CommunityDetail` |
| POST | `/communities/:id/invite-code` | admin | — | `{ inviteCode: string }` — issues a new code |
| GET | `/communities/:id/members` | member | — | `CommunityMember[]` |
| PATCH | `/communities/:id/members/:userId` | admin | `UpdateMemberRoleRequest` | `CommunityMember` |
| DELETE | `/communities/:id/members/:userId` | admin, or self to leave | — | `204` |
| GET | `/communities/:id/leaderboard` | member | — | `LeaderboardEntry[]` — every member, including those with no settled predictions; any order |

### Markets

| Method | Route | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/markets?status=&visibility=&sort=&cursor=&limit=` | any | — | `Paginated<MarketSummary>` — home "trending" sections (see `MarketListParams`) |
| GET | `/communities/:id/markets?status=&cursor=` | member, or anyone if PUBLIC | — | `Paginated<MarketSummary>` |
| POST | `/communities/:id/markets` | member | `CreateMarketRequest` | `MarketDetail` |
| GET | `/markets/:id` | member | — | `MarketDetail` — polled every 5 s while `OPEN`/`LOCKED`/`PAYOUT_PENDING` (see [Live updates](#live-updates-mvp-polling)); `Cache-Control: no-store` |
| GET | `/markets/:id/activity?cursor=` | member | — | `Paginated<MarketActivity>` — newest first; polled with `/markets/:id`; `Cache-Control: no-store` |
| POST | `/markets/:id/positions` | member, while OPEN | `PlacePositionRequest` | `{ position: Position; market: MarketDetail; balance: number }` |
| POST | `/markets/:id/resolve` | market moderator, while LOCKED | `ResolveMarketRequest` | `MarketDetail` with status `PAYOUT_PENDING` — picks the winner (final) and starts the 5-minute grace period; no coins move. While `PAYOUT_PENDING`: `409 MARKET_CLOSED` "A winner has already been picked. You can only nullify this market" for any option. Other statuses: `409 MARKET_CLOSED` |
| POST | `/markets/:id/cancel` | market moderator, while LOCKED or PAYOUT_PENDING ("Nullify") | `CancelMarketRequest` | `MarketDetail` with status `CANCELLED` — refunds every bet immediately; final. `409 MARKET_CLOSED` once paid out, including a nullify that arrives after `payoutAt` but before the payout ran ("Payouts have already gone out"): the payout wins |

`POST /markets/:id/positions` returns the updated market and new balance so the UI can refresh odds and the wallet without a second fetch.

## 6. Transactional operations

Each of these must run inside a single database transaction.

**Claim the daily bonus** (`POST /me/daily-bonus`)
1. In one statement, credit and move the timer only if it's due, so double clicks and parallel requests can't claim twice:
   `UPDATE wallets SET balance = balance + 1000, next_daily_bonus_at = now() + interval '24 hours', updated_at = now() WHERE user_id = $me AND next_daily_bonus_at <= now() RETURNING balance, next_daily_bonus_at`.
2. No row returned → `409 DAILY_BONUS_NOT_READY`, with the time left in the message; nothing changes.
3. Insert a `DAILY_BONUS` transaction of +1,000 with `balance_after`.
4. Don't stack: the new time is always claim time + 24 hours, however late the claim.

**Place a position**
1. Lock the wallet row (`SELECT … FOR UPDATE`).
2. Check balance ≥ amount, market is `OPEN`, and `now < deadline`.
3. Debit the wallet.
4. Insert the position.
5. Increment `market_options.total_amount`.
6. Insert a `PLACE_POSITION` transaction.

**Pick a winner** (`POST /markets/:id/resolve`)
1. Lock the market row (`SELECT … FOR UPDATE`); check the caller is its moderator and status is `LOCKED`. If it's `PAYOUT_PENDING`, reject with `MARKET_CLOSED` "A winner has already been picked. You can only nullify this market" and change nothing — the pick is final.
2. Insert the settlement row with `resolved_at = now`, `payout_at = now + PAYOUT_GRACE_MINUTES`, `paid_out_at = NULL`.
3. Set market status to `PAYOUT_PENDING`. No coins move; positions stay `PENDING`.

**Pay out** (scheduled job at `payout_at`, or on the next read if the job is late — must be idempotent. The Go API runs the job every 5 seconds and also pays out overdue markets before `GET /me`, `/me/wallet`, `/me/positions`, `/me/transactions`, `/me/mod-queue`, `/users/:id`, `/markets`, `/markets/:id`, `/markets/:id/activity`, `/communities/:id/markets` and `/communities/:id/leaderboard`)
1. Lock the market row; continue only if status is still `PAYOUT_PENDING` and `now ≥ payout_at`.
2. Pay each winner using the payout formula; log `WIN_REWARD`. Mark positions `WON` / `LOST`.
3. If nobody picked the winning option, refund everyone instead (`REFUND`, positions `REFUNDED`).
4. Update `correct_predictions`, `total_predictions`, and `prediction_score` for every participant.
5. Set `paid_out_at = now` and market status to `RESOLVED`.

**Cancel a market** (`POST /markets/:id/cancel`, "Nullify")
1. Lock the market row; check the caller is its moderator and status is `LOCKED` or `PAYOUT_PENDING`.
2. Delete the pending settlement row, if any. If its `payout_at` has already passed, stop with `MARKET_CLOSED` and change nothing: the payout wins.
3. Refund every position with a `REFUND` transaction; mark positions `REFUNDED`.
4. Set market status to `CANCELLED`. Because the payout also locks the row and re-checks the status, a nullify and a payout can never both happen.

## 7. Error codes

| Code | HTTP |
|---|---|
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `VALIDATION_ERROR` | 400 |
| `INSUFFICIENT_FUNDS` | 409 |
| `MARKET_CLOSED` | 409 |
| `ALREADY_MEMBER` | 409 |
| `INVALID_INVITE_CODE` | 404 |
| `OPTION_SWITCH_NOT_ALLOWED` | 409 |
| `DAILY_BONUS_NOT_READY` | 409 |

Rate limits answer `429` with code `FORBIDDEN` and `Retry-After: 60`: `POST /auth/register` and `POST /auth/login` allow 30 requests a minute per IP, and `GET /public/invites/:code` allows 120. The Next.js server makes every public invite lookup, so all link previews and signed-out visitors share its budget.

`BAD_RESPONSE` (502) is frontend-only: the client uses it when a response isn't JSON (e.g. a tunnel or proxy page). The API never sends it.

`MARKET_CLOSED` covers every action the market's status doesn't allow: betting after the deadline, picking a winner when one is already picked (message: "A winner has already been picked. You can only nullify this market") or the market is settled, and nullifying after the payout.
