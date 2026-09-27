# API Contract (MVP)

> Historical draft. The canonical contract is now [api-contract.md](api-contract.md).
> Implementation and pending verification are tracked in [requirements-alignment.md](requirements-alignment.md).
> Outdated here: resolving no longer pays out immediately. A pick starts a 5-minute
> payout grace period (`PAYOUT_PENDING`); see api-contract.md, schema decision 16 and §6.
> Points now come only from the signup bonus and `POST /me/daily-bonus` (decision 17);
> there is no deposit or refill endpoint. `GET /public/invites/:code` is the one
> signed-out read.

Contract between the Go backend and the Next.js frontend. Go structs should mirror the TypeScript types below exactly (same field names via `json:"camelCase"` tags).

Status: **draft** — built from the database schema; revisit once screens are finalized.

---

## 1. Schema decisions to settle

| # | Issue | Decision |
|---|---|---|
| 1 | `users.username` isn't unique | Add `UNIQUE` |
| 2 | A user could join a community twice | `UNIQUE(community_id, user_id)` on `community_members` |
| 3 | A user could have two wallets | `UNIQUE(user_id)` on `wallets` |
| 4 | Multiple bets per market? | Users may add to the same option; switching to another option is rejected (`OPTION_SWITCH_NOT_ALLOWED`) |
| 5 | Payout model | Parimutuel pool: `payout = floor(stake × totalPool / winningOptionPool)`. Rounding remainder goes to the largest winner. Displayed odds = `option.total_amount / market pool` |
| 6 | `LOSS` transaction | Coins already left at `PLACE_POSITION`. Log `LOSS` with `amount = 0` for history only (or drop the type) so the ledger doesn't double-count |
| 7 | `transactions.reference_id` is ambiguous | Add `reference_type` (`POSITION` / `MARKET`) and `balance_after` |
| 8 | Who sets `LOCKED`? | A market is locked when `now > deadline` — computed on read or set by a scheduled job, never manual |
| 9 | `CANCELLED` markets | Refund every position with `REFUND` transactions. No settlement row |
| 10 | Wallets are global, leaderboards are per community | Community leaderboards are computed from positions + settlements within that community. `users.prediction_score` stays global |
| 11 | `BINARY` options | Backend auto-creates `YES` / `NO`; the client never sends them |

## 2. Conventions

- Base path: `/api/v1`
- JSON fields are camelCase.
- IDs are JSON numbers (BIGSERIAL stays below JS's 2^53 limit).
- Timestamps are ISO-8601 UTC strings.
- Coins are integers only.
- Auth: JWT in an `httpOnly` cookie. Next.js server components forward the cookie to the Go API.
- Lists use cursor pagination: `?cursor=&limit=`.
- All errors share one shape:

```json
{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "Not enough coins", "fields": {} } }
```

## 3. Response types

```ts
// ---- primitives ----
type ID = number;
type ISODate = string;
type Role = 'MEMBER' | 'MODERATOR' | 'ADMIN';
type MarketType = 'BINARY' | 'MULTIPLE_CHOICE';
type MarketStatus = 'OPEN' | 'LOCKED' | 'RESOLVED' | 'CANCELLED';
type TransactionType = 'INITIAL_BONUS' | 'PLACE_POSITION' | 'WIN_REWARD' | 'LOSS' | 'REFUND';
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
  createdAt: ISODate;
}

interface UserProfile extends UserSummary, UserStats { createdAt: ISODate; }

// ---- communities ----
interface CommunitySummary {
  id: ID;
  name: string;
  description: string | null;
  memberCount: number;
  openMarketCount: number;
  myRole: Role;
  createdAt: ISODate;
}

interface CommunityDetail extends CommunitySummary {
  creator: UserSummary;
  inviteCode: string | null;   // only returned to MODERATOR/ADMIN
}

interface CommunityMember { user: UserSummary; role: Role; joinedAt: ISODate; }

interface LeaderboardEntry {
  rank: number;
  user: UserSummary;
  netProfit: number;           // winnings minus stakes, this community only
  correctPredictions: number;
  totalPredictions: number;
  accuracy: number;
}

// ---- markets ----
interface MarketOption {
  id: ID;
  text: string;
  totalAmount: number;
  positionCount: number;
  probability: number;         // totalAmount / market pool, 0–1 (even split if pool = 0)
  isWinner: boolean | null;    // null until resolved
}

interface MyStake { optionId: ID; amount: number; potentialPayout: number; }

interface MarketSummary {
  id: ID;
  communityId: ID;
  title: string;
  marketType: MarketType;
  status: MarketStatus;
  deadline: ISODate;
  totalPool: number;
  participantCount: number;
  options: MarketOption[];
  creator: UserSummary;
  myStake: MyStake | null;     // null if the current user hasn't bet
}

interface Settlement {
  winningOptionId: ID;
  resolvedBy: UserSummary;
  resolvedAt: ISODate;
  notes: string | null;
}

interface MarketDetail extends MarketSummary {
  description: string | null;
  moderator: UserSummary;
  settlement: Settlement | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  permissions: { canBet: boolean; canResolve: boolean; canCancel: boolean };
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

interface CreateCommunityRequest  { name: string; description?: string; }
interface UpdateCommunityRequest  { name?: string; description?: string; }
interface JoinCommunityRequest    { inviteCode: string; }
interface UpdateMemberRoleRequest { role: Role; }

interface CreateMarketRequest {
  title: string;
  description?: string;
  marketType: MarketType;
  deadline: ISODate;           // must be in the future
  options?: string[];          // required for MULTIPLE_CHOICE (2–10), ignored for BINARY
  moderatorId?: ID;            // defaults to creator; must be a MODERATOR/ADMIN member
}

interface PlacePositionRequest { optionId: ID; amount: number; }  // 1 <= amount <= balance
interface ResolveMarketRequest { winningOptionId: ID; notes?: string; }
interface CancelMarketRequest  { reason?: string; }
```

## 5. Routes

All routes are prefixed with `/api/v1`.

### Auth and current user

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `RegisterRequest` | `Me` — also creates wallet + `INITIAL_BONUS` transaction |
| POST | `/auth/login` | `LoginRequest` | `Me` + sets auth cookie |
| POST | `/auth/logout` | — | `204` |
| GET | `/me` | — | `Me` |
| PATCH | `/me` | `UpdateMeRequest` | `Me` |
| GET | `/me/positions?status=open\|settled&cursor=` | — | `Paginated<Position>` |
| GET | `/me/wallet` | — | `Wallet` |
| GET | `/me/transactions?cursor=` | — | `Paginated<Transaction>` |
| GET | `/users/:id` | — | `UserProfile` |

### Communities

| Method | Route | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/communities` | any | — | `CommunitySummary[]` (mine) |
| POST | `/communities` | any | `CreateCommunityRequest` | `CommunityDetail` — creator becomes ADMIN |
| POST | `/communities/join` | any | `JoinCommunityRequest` | `CommunityDetail` |
| GET | `/communities/:id` | member | — | `CommunityDetail` |
| PATCH | `/communities/:id` | admin | `UpdateCommunityRequest` | `CommunityDetail` |
| POST | `/communities/:id/invite-code` | admin | — | `{ inviteCode: string }` — issues a new code |
| GET | `/communities/:id/members` | member | — | `CommunityMember[]` |
| PATCH | `/communities/:id/members/:userId` | admin | `UpdateMemberRoleRequest` | `CommunityMember` |
| DELETE | `/communities/:id/members/:userId` | admin, or self to leave | — | `204` |
| GET | `/communities/:id/leaderboard` | member | — | `LeaderboardEntry[]` |

### Markets

| Method | Route | Who | Body | Returns |
|---|---|---|---|---|
| GET | `/markets?status=&cursor=` | any | — | `Paginated<MarketSummary>` — home feed across my communities |
| GET | `/communities/:id/markets?status=&cursor=` | member | — | `Paginated<MarketSummary>` |
| POST | `/communities/:id/markets` | member | `CreateMarketRequest` | `MarketDetail` |
| GET | `/markets/:id` | member | — | `MarketDetail` |
| GET | `/markets/:id/activity?cursor=` | member | — | `Paginated<MarketActivity>` |
| POST | `/markets/:id/positions` | member, while OPEN | `PlacePositionRequest` | `{ position: Position; market: MarketDetail; balance: number }` |
| POST | `/markets/:id/resolve` | market moderator or community admin | `ResolveMarketRequest` | `MarketDetail` |
| POST | `/markets/:id/cancel` | market moderator or community admin | `CancelMarketRequest` | `MarketDetail` |

`POST /markets/:id/positions` returns the updated market and new balance so the UI can refresh odds and the wallet without a second fetch.

## 6. Transactional operations

Each of these must run inside a single database transaction.

**Place a position**
1. Lock the wallet row (`SELECT … FOR UPDATE`).
2. Check balance ≥ amount, market is `OPEN`, and `now < deadline`.
3. Debit the wallet.
4. Insert the position.
5. Increment `market_options.total_amount`.
6. Insert a `PLACE_POSITION` transaction.

**Resolve a market**
1. Check status is `OPEN` or `LOCKED`.
2. Insert the settlement row; set market status to `RESOLVED`.
3. Pay each winner using the payout formula; log `WIN_REWARD`.
4. Update `correct_predictions`, `total_predictions`, and `prediction_score` for every participant.
5. If nobody picked the winning option, refund everyone instead.

**Cancel a market**
1. Set market status to `CANCELLED`.
2. Refund every position with a `REFUND` transaction.

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
