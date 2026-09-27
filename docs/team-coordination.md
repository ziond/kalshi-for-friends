# Team coordination

> Historical: the original ownership split and handoff from the first backend
> baseline. Current status is in [requirements-alignment.md](requirements-alignment.md);
> the schema is in [database.md](database.md) and all migrations through 000010 are applied.

## Proposed ownership

| Owner | Modules |
| --- | --- |
| Other backend engineer | auth, users, communities |
| Owen | markets, predictions, points, transactions, settlement, leaderboard |
| Shared coordination | config, database, router, middleware, migrations, API contracts |

This split is proposed; confirm it with the other engineer before parallel work.

## Message for the other backend engineer

The Go backend skeleton and reviewed PostgreSQL migration pairs 000001 through
000004 are the baseline on backend-owen. The migration test passed locally;
the shared database is not connected or migrated yet. Please own auth, users, communities, membership, and
invite links. Owen owns markets, positions, points/refills, transaction history,
settlement/refunds, and rankings, and coordinates migration numbering.

Once you have this baseline commit, start handlers and SQL queries against
docs/api.md and docs/database.md. Use /api/v1, camelCase JSON, and JWT in an
HTTP-only cookie. Do not create competing migrations or auto-migrate.
Registration must create user + wallet + INITIAL_BONUS in one transaction.
Community creation must create the creator's ADMIN membership in one transaction.
Read docs/database.md for exact columns, constraints, and transaction integration.

## Decisions still pending

- Configure the development database and apply migrations with golang-migrate.
- Starting-point amount and refill endpoint/eligibility rules.
- Registration integration, cookie settings, and idempotency headers.
- Payout rounding aggregation/tie-breaking and score formula.
- Moderator/admin resolution permissions, timing, and cancellation rules.

## Current review boundary

Skeleton, frontend API draft, and proposed SQL migrations/documentation only.
Application logic and the database connection are deferred to later tasks.
Review changes locally and obtain Owen's approval before each push.
