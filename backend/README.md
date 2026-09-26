# Backend

## Scope

This is a compilable Go skeleton, not a running API. Source files contain package
declarations and responsibility comments only, except for an empty main function.
Fiber, PostgreSQL driver, authentication libraries, and other dependencies will
be added when their implementation starts.

Four PostgreSQL migration pairs now define the proposed MVP schema. Review the
[database handoff](docs/database.md), verify the migrations using the isolated
test script, then configure the application's PostgreSQL connection as the next stage.

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

There are no Go tests or external Go dependencies yet; these commands currently
verify that the scaffold compiles and passes static checks. For database migration
tests, see [migrations/README.md](migrations/README.md).

See [team coordination](docs/team-coordination.md) before starting implementation.
