# Backend requirements alignment

Source: repository `docs/api-contract.md` and `docs/requirements.md`, also supplied
by Owen. This is implementation status, not a claim that full-stack acceptance
has passed. The shared Supabase development database has migrations 000001–000011
applied (2026-09-27).

## Implemented in this change

| Requirements | Implementation | Verification |
| --- | --- | --- |
| AUTH-07,13–15,19–20 | Ed25519 PEM pair validation, access/refresh JWT cookies, PostgreSQL refresh hash registry, atomic single-use rotation and logout revocation | Unit tests; database concurrency test added, not yet run |
| COM-01–07,10–13,19; DSC; INV | Explicit visibility, public discovery/join, moderator selection, private access checks, invite preview, code replacement | Existing integration suite updated; live verification pending |
| WAL-07–09 | Atomic wallet/ledger updates, wallet and transaction reads | `lifecycle_test` |
| AUTH-05; WAL-08,11,12; DATA-01,08; SEC-03 | Daily bonus: `POST /me/daily-bonus` credits `DAILY_BONUS_POINTS` (1,000) when `next_daily_bonus_at` has passed, in one conditional `UPDATE` plus a DAILY_BONUS ledger row; early claims get `409 DAILY_BONUS_NOT_READY` ("Your next 1,000 points are ready in 5h 12m"); missed days don't stack; first bonus opens `DAILY_BONUS_HOURS` (24) after signup; `nextDailyBonusAt` on `Me`; deposit endpoint and `DEPOSITS_ENABLED` removed (WAL-03–05,10 withdrawn); migration 000010 | `daily_bonus_test` (incl. 8 parallel claims → one credit), `points_test`, `config_test`; migration 000010 up/down/up verified on PostgreSQL 18 (2026-09-27) |
| INV-04,07,09; COM-06,17 | Invite links expire 15 minutes after creation or regeneration (`communities.invite_expires_at`, migration 000011): expired codes get `404 INVALID_INVITE_CODE` from both invite lookups and from joining, reads never extend the window, and regeneration starts a new one. Invite lookups send `Cache-Control: no-store` (replacing the public lookup's 5-minute cache). The UI can't issue a new code yet (requirements open issue 23) | `invite_expiry_test`; migrations 000010–000011 up/down/up verified on PostgreSQL 18 (2026-09-27) |
| COM-04,21; FEED-06,08 | `GET /users/lookup?username=` (always 200, `{ user }` or `{ user: null }`, trimmed, case-insensitive, registered before `/users/:id`); unknown moderator names on create report the trimmed name; `inviteExpiresAt` on `CommunityDetail` (creator/moderators only, null with `inviteCode`) and on the regenerate response; `GET /communities/discover?q=` filters public communities by name or description; `q` on Discover and `GET /markets` is trimmed and `%`/`_` match literally | `search_and_lookup_test`; checked live against the shared database (read-only) on 2026-09-27 |
| INV-06,07; SEC-10 | Public invite lookup `GET /public/invites/:code`: no sign-in, returns only name, visibility and member count, `404 INVALID_INVITE_CODE`, 120 requests/min per IP | `router_test` (`TestCommunityLifecycle`), `rate_limit_test`; checked live against the shared database |
| MKT; ODD; FEED | Member-only creation, validated options/deadlines, public/private feeds, server search, probabilities and immutable-position-derived history | Integration test added |
| BET; ACT; USR-03–04 | Member-only bets; market/wallet locks; no option switching; balance/pool/ledger atomicity; paginated activity and positions | Lifecycle and concurrent-bet tests added |
| LCK; RES; DATA-01–05 | Computed deadline locking, moderator checks, locked-only settlement, sorted wallet locks, one settlement, exact payouts/refunds | Exact arithmetic unit tests pass; database race tests added |
| MOD; LDR-01–02 | Mod queue, community net-profit leaderboard, one prediction per settled market; refunds excluded | Integration paths added |
| SEC-07,09 | Per-process authentication throttle (30/min per IP), JSON mutation bodies, explicit origin checks | Origin unit test; live proxy check pending |
| RES-05,07,08,10,16–19; LCK-01; MOD-01; DATA-07; API-09 (no-store) | Payout grace period: a pick moves the market to PAYOUT_PENDING with `payoutAt` and moves no points; the pick is final (second pick → `MARKET_CLOSED` "A winner has already been picked. You can only nullify this market"); nullify allowed until the payout; payout job every 5 s plus payout-on-read; row-locked so a payout and a nullify never both happen; `payoutAt`/`paidOutAt`, `ModQueue.payoutPending`, `Cache-Control: no-store` on polled reads; migration 000009 | `grace_period_test`, updated `lifecycle_test`, `config_test` and `tests/schema.sql` pass against PostgreSQL 16.4 (2026-09-27); migration 000009 up/down/up verified, including rollback with a market mid-grace-period |

## Decisions / limitations

- LDR-03 agreed with Owen: prediction_score = round(100 × correct / total),
  with 0 when total is zero and half values rounded up. One prediction per
  resolved market; cancelled/no-winner-refund markets do not count. Migration
  000008 backfills scores from existing counters, and settlement updates score
  with the counters atomically. Rollback preserves computed scores.
- Moderator betting remains allowed for a moderator who is also a member, as in
  the supplied design. The spec explicitly leaves this decision open.
- Original communities are migrated as PRIVATE, preserving existing privacy.
  New requests must supply visibility. ADMINs count as public moderators.
- Probability history is reconstructed from immutable position rows rather than
  stored snapshots, as allowed by the API contract. Feed responses currently
  include detail fields/history; optimize only after measuring MVP-sized data.
- Pagination uses opaque offset cursors with deterministic tie-breaking; rapidly
  changing feeds can move between pages. Performance targets are not measured.
- Refresh-token persistence resolves AUTH-19/20 while access JWT authentication
  remains stateless; no session cookie is introduced. Reuse rejects the old token
  but does not revoke its entire descendant family. Expired hashes may be purged
  by an owner-run maintenance query. Never store raw refresh tokens.
- JWT keys can come entirely from environment variables (for hosts without key
  files, e.g. Vercel): `JWT_PRIVATE_KEY` as a PEM, with literal `\n`, or
  base64-encoded; without `JWT_PUBLIC_KEY` or a public key file the public key is
  derived from it. Covered by `config_test` (`TestAUTH15KeysFromEnvironmentOnly`).
- SEC-01 also protects /api/v1/health now; unauthenticated health probes get 401.
- Operational errors still use INTERNAL_ERROR / DATABASE_UNAVAILABLE (500/503).
  These need documenting as contract extensions; hiding infrastructure failures
  behind a domain validation code would mislead clients.
- Authentication throttling is per-process/IP, not a distributed limiter. Behind
  ngrok callers share the proxy-IP budget; forwarded IPs are not blindly trusted.
- Cookies must use Secure when the browser-facing frontend is HTTPS. For a local
  HTTP frontend proxy use local cookie settings. Set CORS_ORIGINS to the exact
  frontend origin if it forwards browser Origin headers. Keep SameSite=Lax and
  COOKIE_DOMAIN unset for the normal frontend proxy setup.
- Payout grace period: `PAYOUT_GRACE_MINUTES` (default 5, 1–1440) sets it; the
  frontend shows a fixed "5 minutes", so change both together. The job runs in
  the API process every 5 seconds; overdue payouts are also applied before
  reads that show balances, markets or stats, so a read at `payoutAt` sees the
  result even if the job is late. A failed payout is logged and retried rather
  than failing the read. A nullify that arrives after `payoutAt` gets
  `MARKET_CLOSED` "Payouts have already gone out": the payout wins.
- Settlement amounts (`total_pool`, `winning_pool`, mode) are recorded at the pick.
  Betting closed at the deadline, so they can't change during the grace period.
- `MyStake.potentialPayout` on a RESOLVED market is now the actual payout (it
  was still the estimate, so losers saw the whole pool).
- Full-stack scenarios, performance, and browser accessibility remain unverified.

## Safe verification before restart/push

From the repository root (creates an isolated temporary PostgreSQL cluster):

```sh
PG_BIN=/Applications/Postgres.app/Contents/Versions/16/bin RUN_API_TESTS=1 bash scripts/test-migrations.sh
```

The script never uses the shared database URL. Tests truncate data only in that
temporary cluster. On Windows, start a throwaway cluster with the PostgreSQL
`initdb`/`pg_ctl` binaries instead, apply the migrations with `migrate`, and run
`TEST_DATABASE_URL=… go test -p 1 ./...`, then `psql -f tests/schema.sql`. The
Go suite and the schema fixture passed this way on PostgreSQL 18 on 2026-09-27.

The shared Supabase database is at migration 000011 (2026-09-27), and the API
built from `backend-dev` was checked against it (read-only requests: `/me`, wallet,
communities, markets, both invite lookups). Apply new migrations there before
restarting an API that expects them. The invite-expiry migration was first
committed as a second 000010 alongside the daily bonus; golang-migrate rejects
duplicate versions, so it was renumbered to 000011. The API connects as the Supabase
`postgres` role, which owns the tables, so no extra grants are needed; with a
separate `kalshi_app` role it needs `GRANT SELECT, INSERT, DELETE ON refresh_tokens`
and `GRANT UPDATE, DELETE ON settlements`. Migrations 000007 and 000010 refuse
rollback once DEPOSIT or DAILY_BONUS ledger rows exist; they never delete or
relabel financial history to make rollback succeed.

Run requirements E2E-1 through E2E-8 against the frontend proxy with mocks off.
Do not share private.pem. No push is authorized by this document.
