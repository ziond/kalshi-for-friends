# MVP database schema and implementation handoff

Status: reviewed migration baseline on `backend-owen`. Four migration pairs
passed local PostgreSQL verification; they have not been applied to a shared database.
The original [frontend API draft](api.md) is preserved. No handlers, database
connection, or financial service logic are implemented by this change.

PostgreSQL 16+, one database, one Go service. Use SQL migrations with
golang-migrate; do not also run ORM auto-migration. Owen coordinates migration
numbering so both engineers work from the same schema.

## Tables and ownership

| Table | Key / important fields | Responsibility |
| --- | --- | --- |
| users | id, username, email, password_hash, avatar_url, prediction_score, total_predictions, correct_predictions | Zion: auth and profiles; Owen: prediction stats |
| wallets | user_id PK, balance, updated_at | Owen; registration must create one |
| communities | id, name, description, invite_code, creator_id | Zion |
| community_members | PK (community_id, user_id), role, joined_at | Zion |
| markets | id, community_id, creator_id, moderator_id, title, description, market_type, deadline, status (OPEN, LOCKED, PAYOUT_PENDING, RESOLVED, CANCELLED), cancellation audit | Owen |
| market_options | id, market_id, option_text, sort_order, total_amount | Owen |
| market_participants | PK (market_id, user_id), option_id | Owen |
| positions | id, market_id, user_id, option_id, amount, request_key, result, payout, settled_at | Owen |
| settlements | market_id PK, winning_option_id, resolved_by, resolved_at, payout_at, paid_out_at, notes, pool snapshots, settlement_mode | Owen |
| transactions | id, user_id, amount, transaction_type, balance_after, reference fields, request_key | Owen; registration must write INITIAL_BONUS |

All historical user/market relationships use restrictive deletion. Community
membership may be deleted without deleting positions, transactions, or payouts.
The API does not currently offer user, market, or community hard deletion.

There is no separate AI-analysis table, payment integration, or notification
system in this MVP. There is no refill schedule table until refill policy is agreed.

## Storage conventions

- SQL names are snake_case; Go response structs use the exact camelCase JSON tags
  in the frontend draft. DB records and API responses need not be identical structs.
- IDs are BIGSERIAL with an explicit safe-JSON-number constraint up to
  9,007,199,254,740,991. A BIGSERIAL alone does not enforce that limit.
- Balances, stakes, payouts, and pool snapshots are integer BIGINT values with the
  same safe upper limit. Check aggregate market pools against that limit as well;
  individually valid amounts can still produce an oversized sum.
- Timestamps are TIMESTAMPTZ. Configure the application connection for UTC and
  serialize UTC ISO-8601. Defaults only set initial timestamps; UPDATE queries
  must set updated_at explicitly.
- Status/role values use TEXT or VARCHAR plus CHECK constraints instead of
  PostgreSQL enums, keeping later migrations simple.
- Username/email uniqueness is case-insensitive. Trim input before insert;
  uniqueness errors should map to the agreed API error format. Password hashing
  and email format validation are application responsibilities.

## Identity and registration: ready for Zion

User fields: username (50 characters), email (255), password_hash (nonempty),
avatar_url (nullable), plus the counters and timestamps above.

Register within ONE SQL transaction:

1. Insert users and obtain id with RETURNING.
2. Insert wallets for that user. The default balance is deliberately zero.
3. Set the approved starting balance and insert one INITIAL_BONUS transaction
   with amount equal to the grant, balance_after equal to the resulting balance,
   and no position/market reference.
4. Commit; then return Me by joining users and wallets.

A unique partial index permits only one INITIAL_BONUS per user. Do not give
points through a wallet default: that would create a balance with no ledger
entry. Starting amount is service configuration, not hardcoded in the migration;
1,000 points is still the proposed amount.

Use a shared Go transaction when integrating registration with Owen's points
module. A repository must accept the caller's transaction rather than open its
own transaction midway through registration.

Login queries can use lower(email). Auth is JWT in an HTTP-only cookie per the
frontend draft. Cookie name, expiry, cross-origin settings, CSRF protection, and
whether registration also logs in remain integration decisions.

## Communities: ready for Zion

Create the community and its creator's ADMIN membership atomically. Generate a
random invite code in the service; the unique constraint handles collisions.
A user can have one current membership per community. Regeneration replaces
invite_code, invalidating the old code. Return it only to permitted members.

Community creation and membership operations must enforce authorization in the
service; foreign keys do not prove membership or role. Preserve the last admin.
Coordinate what happens when the assigned moderator leaves a community with an
unresolved market. Historical creator/moderator user references remain valid.

## Markets and positions

Create market and options in one transaction. Service validation enforces 2–10
options, with exactly YES and NO for BINARY. sort_order is 0–9 and unique within
a market, so the database caps the maximum at ten but cannot enforce the minimum
or binary labels by a row CHECK alone.

Option labels are unique per market after trimming and case folding. Composite
foreign keys ensure a position or winning option belongs to its stated market.

market_participants records one selected option for each user/market. Each added
stake becomes a NEW positions row referencing that choice. This preserves the
activity feed and prevents switching outcomes after a stake exists. Do not
update old stake amounts or the participant's option.

Participant count is distinct users (or count of market_participants), not count
of positions. MyStake.amount sums that user's positions in the market.
positionCount counts position rows on each option. total_amount is the cached
sum of original stakes and is retained after resolution/cancellation.

## Atomic operations and lock order

Every point-changing action must update wallets and append transactions in the
same database transaction. Constraints are defense in depth, not a replacement
for this application logic.

For placement, picking a winner, payout, and cancellation:

1. Lock the MARKET row first with SELECT ... FOR UPDATE.
2. Recheck permission, terminal state, and applicable deadline.
3. Lock affected WALLET rows in ascending user_id order.
4. Read/update choices, positions, pool totals, settlement, stats, and ledger.
5. Commit everything together.

Use the same order everywhere to avoid a placement racing with settlement or
two settlements racing with each other. Wallet-only operations (registration
and refill) must never acquire a market lock after locking a wallet.

A request may place a stake only while stored status is OPEN AND now < deadline.
At now >= deadline it is effectively LOCKED. Compute this consistently in
reads, permissions, and writes; a scheduler is optional. The draft uses both
> and < at the boundary; this note closes that gap.

positions.request_key is required and unique per user. Proposed HTTP integration:
Idempotency-Key header on placement; replay the same result for the same
payload, and reject reuse with different input. This header and its error code
must be agreed with frontend. A server-generated key may support legacy callers
but cannot deduplicate network retries. Namespace ledger request keys by action.

Refill transactions require a unique request key but do not yet enforce a daily
or zero-balance policy. Implement eligibility checks under the wallet lock after
the team chooses the policy.

## Settlement, cancellation, and exact point accounting

settlements.market_id is the primary key, allowing one recorded resolution.
The winning option is constrained to the market. Snapshot total_pool and
winning_pool. settlement_mode is PAYOUT or NO_WINNERS_REFUND.

Settlement happens in two steps (migration 000009, api-contract.md decision 16):

1. Pick. The moderator's pick inserts the settlement with resolved_at = now,
   payout_at = now + PAYOUT_GRACE_MINUTES (default 5) and paid_out_at NULL, and
   sets the market to PAYOUT_PENDING. No wallet, position, stat or ledger row
   changes. The pick is final: a second pick is rejected while PAYOUT_PENDING.
2. Payout. Once payout_at has passed, the payout job (every 5 seconds, plus on
   reads if the job is late) locks the market row, re-checks PAYOUT_PENDING and
   payout_at, settles every position as below, sets paid_out_at and moves the
   market to RESOLVED. Running it twice changes nothing.

A nullify during the grace period locks the market row, deletes the pending
settlement, refunds every position and sets CANCELLED. If payout_at has already
passed it is rejected instead, so a payout and a nullify can never both happen.
settlements_payout_check keeps payout_at >= resolved_at and paid_out_at >= payout_at.
settlements_payout_due_idx (partial, paid_out_at IS NULL) serves the payout job.
Rolling 000009 back deletes pending settlements and returns those markets to LOCKED.
The application role needs DELETE and UPDATE on settlements for this.

For a no-winning-stake resolution, keep status RESOLVED and the settlement
record identifying the actual winner, but mark positions REFUNDED and refund
their stakes. Cancellation instead sets CANCELLED, records cancelled_by/time
and the optional reason, refunds positions, and creates no settlement row.
Neither cancellation nor no-winner refunds should affect prediction accuracy.

For a payout, the pool allocation includes the returned stake; do not add the
stake again. Use exact arithmetic with an overflow-safe intermediate. The
frontend draft specifies floor(stake * totalPool / winningPool) and assigning
the remainder to the largest winner. Before implementing the calculator, agree
whether "winner" means aggregated user stake or individual position, and define
a deterministic tie-break. Multiple added stakes must not inflate prediction
counts or create more reward than the total pool.

Positions finish as:
- WON: payout at least the original stake.
- LOST: payout zero.
- REFUNDED: payout exactly the stake.
- PENDING: payout and settled_at both null.

Ledger debits are negative; grants/rewards/refunds are positive. LOSS is optional
history with amount zero. One unique index allows a debit per position and
another allows one final WIN_REWARD, LOSS, or REFUND per position. A second
settlement insert also fails. Services must still make the entire operation
atomic and enforce terminal market state. These indexes do not independently
enforce that a payout amount matches its position or that a wallet equals its
ledger sum; verify those invariants in service tests and reconciliation queries.

Position references use real foreign keys, including transaction ownership.
reference_type and reference_id are generated from position_id/market_id; omit
them from INSERT. Current prediction transaction types use position_id.
MARKET references are reserved; a future market-level transaction type would
need a CHECK-constraint migration. INITIAL_BONUS and POINT_REFILL have null
references. Resolve the display label by joining the referenced position's market.

Do not edit/delete historical ledger entries in application code. No ledger
immutability trigger or separate DB permissions are added at this stage.

## Frontend-derived fields and rankings

- Me.balance: join wallets by user_id.
- Accuracy: correct_predictions / total_predictions, zero when total is zero.
- Market probability: option pool / total pool; uniform split when pool is zero.
- isWinner: null until the market is RESOLVED (still null during PAYOUT_PENDING), then compare to winning_option_id.
- canBet/canResolve/canCancel: computed from current user, role, state, and time.
- potentialPayout: estimate from the current pool; never a guaranteed return. On
  a RESOLVED market, MyStake.potentialPayout is the actual payout.
- Community netProfit: sum(payout - amount) for final positions in that community.
  Refunded positions contribute zero; pending stakes are not realized losses.
- Prediction counts are per user/market, not per added position.
- Refill/initial grants do not affect community netProfit.
- Use (created_at, id) descending cursors for history/feed queries.

Indexes support membership lookups, community feeds, deadlines, user position
history, market activity, and transaction history. Revisit query plans after
implementing actual queries rather than adding speculative indexes now.

## Contract decisions to confirm before those features

1. POINT_REFILL extends TransactionType in the draft; its endpoint, amount,
   cooldown, and eligibility are not yet specified.
2. The draft permits community admins to resolve/cancel, while the original
   discussion allowed only the assigned moderator. Schema supports either rule.
3. The draft lets any member create markets but defaults moderatorId to the
   creator while requiring the moderator to be MODERATOR/ADMIN. For a regular
   member, require an eligible explicit moderator or change the default rule.
4. Whether resolution can happen before deadline, and who may cancel when.
5. Starting grant, integer score formula, tie-breaking, and payout aggregation.
6. Cookie settings, registration auto-login, and idempotency contract above.

These do not block table creation or auth/community scaffolding, but the relevant
services must not silently choose incompatible behavior.

## Verification and references

Run `PG_BIN=/path/to/postgresql/bin bash scripts/test-migrations.sh` from backend.
This creates a separate local cluster and exercises apply, constraint violations,
a representative point lifecycle fixture, rollback, and reapply. The fixture
tests storage, not unimplemented service authorization/concurrency or calculator
logic. Owen ran the complete script locally on 2026-09-26 using PostgreSQL 16.9
and supplied its successful output: all four migrations applied, both constraint
fixture runs passed, rollback left no tables, and reapplication succeeded.
The Codex sandbox itself cannot initialize PostgreSQL shared memory. Verification
used a disposable cluster and did not apply migrations to a shared database or
exercise the golang-migrate CLI.

Design references: [PostgreSQL constraints](https://www.postgresql.org/docs/16/ddl-constraints.html)
and [row locking](https://www.postgresql.org/docs/16/explicit-locking.html).
