# Backend

## Scope

A Fiber + pgx API server targeting [the current API contract](docs/api-contract.md).
See [alignment and verification status](docs/requirements-alignment.md) before deployment.

- Auth: `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` (Ed25519-signed JWTs in HTTP-only cookies).
  Registration creates the user, wallet, and `INITIAL_BONUS` ledger entry in one
  transaction and also signs the user in.
- Users: `GET /me`, `PATCH /me`, `GET /users/:id`.
- Points: `GET /me/wallet` and `POST /me/daily-bonus` (1,000 points every 24 hours,
  never stacked). There is no deposit endpoint.
- Communities: list/create/join/get/update, invite-code regeneration, member list,
  role changes, and remove/leave (a community always keeps at least one admin).
- Invites: `GET /invites/:code` (signed in) and `GET /public/invites/:code`, the one
  signed-out read, which returns only name, visibility and member count for link previews.
  Invite codes expire 15 minutes after creation or `POST /communities/:id/invite-code`.

Market creation/feed/detail, positions/activity/history, settlement/refunds,
mod queue, transaction history and leaderboards are implemented too. Run the
database integration tests (see Local verification) before deploying changes.

## Running locally

Apply the migrations first (see [migrations/README.md](migrations/README.md)).
Run from the repository root; `.env` is loaded automatically without overriding exported
environment variables. Use `.env.example` for a new setup; do not overwrite an
existing `.env`. Keep passwords and private keys out of Git.

Use your existing matching Ed25519 PKCS#8 `private.pem` and SPKI `public.pem`
in the repository root, or put the keys in environment variables instead (see the
table): on hosts without the key files, such as Vercel, set `JWT_PRIVATE_KEY` alone
and the public key is derived from it. The loader parses them into Go Ed25519 keys and checks that they
match. It does not regenerate or overwrite them. Then start:

```sh
go run ./cmd/server
```

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | unset | PostgreSQL connection string; takes precedence over `DB_*` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | `localhost`, `5432`, `kalshi_for_friends`, `kalshi_app` | Used when `DATABASE_URL` is absent |
| `DB_PASSWORD`, `DB_SSLMODE` | required, `disable` | Local database credentials; use TLS for hosted connections |
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

Errors use `{ "error": { "code", "message", "fields"? } }`.
Last-admin removal returns `FORBIDDEN` without deleting membership.

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
their normal short lifetime. Apply migration 000005 and grant the application
role SELECT/INSERT/DELETE on refresh_tokens before restarting this backend.

Give the existing `public.pem` to the frontend developer for `frontend/keys/public.pem` or
`JWT_PUBLIC_KEY_PATH`. If using an inline private key, export its matching public
key instead. The frontend must proxy cookies through its own origin; cookies
issued directly by another host are not visible to its page guard.

Set `FRONTEND_URL` in `.env` and restart the Go server after changing it.
Credentialed CORS is enabled for the configured origins; no wildcard is allowed.
The frontend API client already uses `credentials: "include"` for requests and
refresh. Prefer its existing same-origin Next.js proxy so the page guard can
read the auth cookies. Direct cross-site cookie requests additionally require
`COOKIE_SAME_SITE=None` and `COOKIE_SECURE=true` over HTTPS, may be blocked by
browser third-party-cookie policies, and do not make API-host cookies visible
to the frontend page guard. CORS alone does not solve that cross-site login flow.

## Layout

```text
./
  cmd/server/main.go       Server entry point
  internal/
    config/                Application configuration
    database/              Database connection lifecycle
    router/                API route registration
    middleware/            Authentication and request middleware
    modules/
      auth/                Registration, login, authenticated identity
      users/               User profiles
      communities/         Communities, membership, invite links
      markets/             Markets, options, deadlines, assigned moderator
      predictions/         Positions and point staking
      points/              Balances and the daily bonus
      transactions/        Point movement audit history
      settlement/          Resolution, payouts, cancellation, refunds
      leaderboard/         Rankings
  migrations/              Versioned PostgreSQL up/down migrations
  scripts/                 Isolated migration verification
  tests/                   SQL constraint and lifecycle fixtures
  docs/                    API contracts and team coordination
```

Within each module, handler.go will handle HTTP input/output, service.go will
coordinate rules and transactions, repository.go will hold database queries,
and model.go will define domain types. Modules only have the files relevant to
their intended responsibilities. Concrete types and interfaces are deferred
until the schema and API contracts are agreed.

The math package file in settlement will contain pure payout calculations.
Settlement orchestration and database writes will live in separate files.

## Local verification

Requires Go 1.24 or later. From this directory:

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
