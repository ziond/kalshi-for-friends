# Backend

## Scope

This is a compilable Go skeleton, not a running API. Source files contain package
declarations and responsibility comments only, except for an empty main function.
Fiber, PostgreSQL driver, authentication libraries, and other dependencies will
be added when their implementation starts.

The next stage is to agree on the schema, add SQL migrations, and connect PostgreSQL.

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
  migrations/              Future versioned SQL migrations
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

There are no tests or external dependencies yet; these commands currently verify
that the scaffold compiles and passes static checks.

See [team coordination](docs/team-coordination.md) before starting implementation.
