# Backend

## Scope

A Fiber + pgx API server. Implemented so far (see [api.md](docs/api.md)):

- Auth: `POST /auth/register`, `/auth/login`, `/auth/logout` (Ed25519-signed JWT in an HTTP-only cookie).
  Registration creates the user, wallet, and `INITIAL_BONUS` ledger entry in one
  transaction and also signs the user in.
- Users: `GET /me`, `PATCH /me`, `GET /users/:id`.
- Communities: list/create/join/get/update, invite-code regeneration, member list,
  role changes, and remove/leave (a community always keeps at least one admin).

Markets, predictions, points, transactions, settlement, and leaderboard are still
skeletons. Review the [database handoff](docs/database.md) before writing queries.

## Running locally

Apply the migrations first (see [migrations/README.md](migrations/README.md)), then:

```sh
DATABASE_URL=postgres://user@localhost:5432/oracle?sslmode=disable \
JWT_PRIVATE_KEY="$(cat jwt_ed25519.pem)" \
go run ./cmd/server
```

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL connection string |
| `JWT_PRIVATE_KEY` | required | Ed25519 PKCS#8 PEM (`openssl genpkey -algorithm ed25519 -out jwt_ed25519.pem`). Literal `\n` is accepted for one-line env files. Sessions are EdDSA JWTs verified with the derived public key |
| `PORT` | `8080` | |
| `APP_ENV` | `development` | `production` turns on secure cookies by default |
| `SESSION_TTL` | `168h` | Cookie and JWT lifetime |
| `COOKIE_NAME` | `oracle_session` | |
| `COOKIE_SECURE` | `true` in production | |
| `COOKIE_SAME_SITE` | `Lax` | `None` requires `COOKIE_SECURE=true` |
| `COOKIE_DOMAIN` | unset | |
| `CORS_ORIGINS` | unset | Comma-separated; only needed if the browser calls the API cross-origin |
| `INITIAL_BALANCE` | `1000` | Starting grant recorded as `INITIAL_BONUS` |

Errors always use `{ "error": { "code", "message", "fields"? } }`. Besides the codes
in api.md, communities return `LAST_ADMIN` (409) when a change would leave no admin.

## Layout

```text
backend/
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
      points/              Balances and refill claims
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

See [team coordination](docs/team-coordination.md) before starting implementation.
