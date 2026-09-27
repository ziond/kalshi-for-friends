# called it. — Backend

A Fiber + pgx API server for called it., a points-based prediction market for friends, targeting
[the current API contract](docs/api-contract.md). See [alignment and verification status](docs/requirements-alignment.md)
before deployment. The Next.js frontend lives on the `frontend-dev` branch; the live app is at
https://called-it-zeta.vercel.app.

## Scope

- Auth: register, login, refresh and logout with Ed25519-signed JWTs in HTTP-only cookies.
  Registration creates the user, wallet, and `INITIAL_BONUS` ledger entry in one
  transaction and also signs the user in. Login and register are rate-limited to 30 requests
  per minute per IP.
- Users: current user, profile updates, public profiles with prediction stats, and a username
  lookup used to validate moderator names while creating a community.
- Points: wallet balance and a daily bonus (1,000 points every 24 hours, never stacked).
  There is no deposit endpoint.
- Communities: list/create/join/get/update, Discover with name search, invite-code
  regeneration, member list, role changes, and remove/leave (a community always keeps at
  least one admin).
- Invites: invite codes expire 15 minutes after creation or regeneration; responses include
  `inviteExpiresAt`. `GET /public/invites/:code` is the one signed-out read. It returns only
  name, visibility and member count for link previews and is limited to 120 requests per
  minute per IP.
- Markets: creation, feed with search and filters, detail, positions (bets), activity,
  probability history, mod queue, transaction history and community leaderboards.
- Settlement: a moderator's pick starts a 5-minute payout grace period (`PAYOUT_PENDING`),
  during which the market can still be nullified. A background job in the server pays out
  due markets every 5 seconds, and reads that show balances, markets or stats pay out any
  overdue market first. Nullifying refunds every bet.

### Routes

All routes are under `/api/v1` and require the `access_token` cookie unless noted.

| Area | Routes |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` (refresh cookie only), `POST /auth/logout` |
| Current user | `GET /me`, `PATCH /me`, `GET /me/wallet`, `POST /me/daily-bonus`, `GET /me/positions`, `GET /me/transactions`, `GET /me/mod-queue` |
| Users | `GET /users/lookup?username=`, `GET /users/:id` |
| Invites | `GET /invites/:code`, `GET /public/invites/:code` (no auth) |
| Communities | `GET /communities`, `POST /communities`, `POST /communities/join` (invite code), `GET /communities/discover?q=`, `POST /communities/:id/join` (public), `GET /communities/:id`, `PATCH /communities/:id`, `POST /communities/:id/invite-code` |
| Members | `GET /communities/:id/members`, `PATCH /communities/:id/members/:userId`, `DELETE /communities/:id/members/:userId` |
| Markets | `GET /markets`, `GET /communities/:id/markets`, `POST /communities/:id/markets`, `GET /markets/:id`, `GET /markets/:id/activity`, `POST /markets/:id/positions`, `POST /markets/:id/resolve`, `POST /markets/:id/cancel` |
| Leaderboard | `GET /communities/:id/leaderboard` |

Market lists accept `q`, `status`, `visibility`, `sort` (default `volume`), `limit` and `cursor`.
Request and response shapes are in [docs/api-contract.md](docs/api-contract.md).

Errors use `{ "error": { "code", "message", "fields"? } }`.
Last-admin removal returns `FORBIDDEN` without deleting membership.

## First-time setup

You need Go 1.24 or later, PostgreSQL 16 or later, and the
[golang-migrate](https://github.com/golang-migrate/migrate) CLI:

```sh
go install -tags postgres github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

1. Create a local database and app role (as the `postgres` superuser):

   ```sh
   psql -U postgres -c "CREATE ROLE kalshi_app LOGIN PASSWORD 'devpass';" \
                    -c "CREATE DATABASE kalshi_for_friends OWNER kalshi_app;"
   ```

2. Apply the migrations (see [migrations/README.md](migrations/README.md)). This changes only the
   database you point it at, never the repository:

   ```sh
   migrate -path migrations -database "postgres://kalshi_app:devpass@localhost:5432/kalshi_for_friends?sslmode=disable" up
   ```

3. Generate a local Ed25519 key pair in the repository root. `*.pem` is gitignored; never commit
   or share a private key, and don't use the team's deployed keys for local work:

   ```sh
   openssl genpkey -algorithm ed25519 -out private.pem
   openssl pkey -in private.pem -pubout -out public.pem
   ```

4. Copy `.env.example` to `.env` and set `DB_PASSWORD`. Do not overwrite an existing `.env`.

5. Start the server; it listens on `http://127.0.0.1:8080`:

   ```sh
   go run ./cmd/server
   ```

## Configuration

`.env` in the repository root is loaded automatically without overriding exported
environment variables. Keep passwords and private keys out of Git.

The server reads a matching Ed25519 PKCS#8 `private.pem` and SPKI `public.pem`
from the repository root, or keys from environment variables instead (see the
table): on hosts without the key files, such as Vercel, set `JWT_PRIVATE_KEY` alone
and the public key is derived from it. The loader parses them into Go Ed25519 keys and checks that they
match. It does not regenerate or overwrite them.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | unset | PostgreSQL connection string; takes precedence over `DB_*` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | `localhost`, `5432`, `kalshi_for_friends`, `kalshi_app` | Used when `DATABASE_URL` is absent |
| `DB_PASSWORD`, `DB_SSLMODE` | required, `disable` | Local database credentials; use `require` for hosted databases such as Supabase |
| `JWT_PRIVATE_KEY` | unset | Ed25519 PKCS#8 PEM; takes precedence over the key file. Accepts the PEM with real newlines, with literal `\n`, or base64-encoded (`base64 -w0 private.pem`) |
| `JWT_PRIVATE_KEY_FILE` | `private.pem` | Used when `JWT_PRIVATE_KEY` is absent; never share the private key |
| `JWT_PUBLIC_KEY` | unset | Optional SPKI public PEM (same formats), overriding the file |
| `JWT_PUBLIC_KEY_FILE` | `public.pem` | Used when `JWT_PUBLIC_KEY` is absent; must match the private key. If neither is set and `public.pem` doesn't exist, the public key is derived from the private key. A file named here explicitly must exist |
| `HTTP_HOST` | `127.0.0.1` | Set `0.0.0.0` explicitly to expose the API on the LAN |
| `PORT` | `8080` | |
| `APP_ENV` | `development` | `production` turns on secure cookies by default |
| `ACCESS_TOKEN_TTL` | `15m` | Access JWT lifetime |
| `REFRESH_TOKEN_TTL` | `168h` | Refresh JWT lifetime; must exceed access lifetime |
| `COOKIE_SECURE` | `true` in production | |
| `COOKIE_SAME_SITE` | `Lax` | `None` requires `COOKIE_SECURE=true` |
| `COOKIE_DOMAIN` | unset | |
| `CORS_ORIGINS` | unset | Comma-separated; only needed if the browser calls the API cross-origin |
| `FRONTEND_URL` | unset | Exact browser-facing frontend origin, e.g. `http://localhost:3000`; added to CORS and mutation origin allowlists |
| `INITIAL_BALANCE` | `1000` | Keep at 1000 to meet AUTH-05 |
| `DAILY_BONUS_POINTS` | `1000` | Points per daily bonus claim (WAL-11); the frontend says 1,000, so keep them in sync |
| `DAILY_BONUS_HOURS` | `24` | Time between claims; the first opens this long after signup. Missed days don't stack |
| `PAYOUT_GRACE_MINUTES` | `5` | Wait between a moderator's pick and the payout (RES-16); the frontend shows 5 minutes, so keep them in sync |

## Connecting the frontend

The frontend verifies access tokens with this server's public key. Point its
`JWT_PUBLIC_KEY_PATH` (in the frontend's `.env.local`) at the `public.pem` matching
your `private.pem`, or give it the PEM through `JWT_PUBLIC_KEY`. With your own local keys, the
frontend's committed `public.pem` won't verify your tokens. Also set `NEXT_PUBLIC_API_MOCK=false`
and `API_URL=http://localhost:8080` there.

To run both at once from one clone, check the backend out in a second folder:

```sh
git worktree add ../called-it-backend backend-dev
```

The frontend must proxy cookies through its own origin (it does: `/api/v1/*` is rewritten to
`API_URL`); cookies issued directly by another host are not visible to its page guard.
Set `FRONTEND_URL` in `.env` and restart the Go server after changing it.
Credentialed CORS is enabled for the configured origins; no wildcard is allowed.
Direct cross-site cookie requests additionally require
`COOKIE_SAME_SITE=None` and `COOKIE_SECURE=true` over HTTPS, may be blocked by
browser third-party-cookie policies, and do not make API-host cookies visible
to the frontend page guard. CORS alone does not solve that cross-site login flow.

## Auth details

`GET /api/v1/health` requires access authentication (SEC-01) and checks PostgreSQL:
200 means connected; 503 means unavailable. An unauthenticated request returns 401.
Auth sets `access_token` and `refresh_token`, both HTTP-only with `Path=/`.
Access claims include numeric `user_id`, `iat`, and `exp`. Token types are checked
so refresh tokens cannot authenticate protected endpoints. Refresh returns 204
with a fresh pair, or 401 on invalid/expired tokens. Logout requires access auth
and expires both cookies. Old `oracle_session` cookies no longer authenticate.

Access JWTs are stateless. Refresh token hashes are stored in PostgreSQL;
rotation atomically removes the old hash and inserts the new hash. Reuse fails
with 401, including concurrent refresh attempts. Logout deletes the presented
refresh-token hash before clearing cookies. Copied access JWTs still expire at
their normal short lifetime.

## Layout

```text
./
  cmd/server/main.go       Server entry point; also starts the payout job
  internal/
    apperror/              Typed API errors
    config/                Application configuration
    database/              Database connection lifecycle and query helpers
    router/                API route registration and integration tests
    middleware/            Authentication, error handling, request security, rate limits
    modules/
      auth/                Registration, login, token issuing, refresh-token store
      users/               Profiles and username lookup
      communities/         Communities, membership, Discover, invite links
      markets/             Markets, bets, activity, feeds, mod queue, leaderboards,
                           transactions, settlement and payouts
      points/              Balances and the daily bonus
      settlement/          Pure payout calculations (calculator.go)
      predictions/, transactions/, leaderboard/
                           Placeholders from the original module split; the working
                           code for these is in markets/
  migrations/              Versioned PostgreSQL up/down migrations
  scripts/                 Isolated migration verification
  tests/                   SQL constraint and lifecycle fixtures
  docs/                    API contract, requirements, database notes
```

## Local verification

From the repository root:

```sh
go test ./...
go vet ./...
```

The API integration tests in `internal/router` are skipped unless
`TEST_DATABASE_URL` points at a migrated, **disposable** database (they truncate
every table):

```sh
TEST_DATABASE_URL=postgres://user@localhost:5432/oracle_test?sslmode=disable go test -p 1 ./...
```

For database migration tests, see [migrations/README.md](migrations/README.md).

[Team coordination](docs/team-coordination.md) records the original module ownership split (historical).
