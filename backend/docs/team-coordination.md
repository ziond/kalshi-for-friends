# Team coordination

## Proposed ownership

| Owner | Modules |
| --- | --- |
| Other backend engineer | auth, users, communities |
| Owen | markets, predictions, points, transactions, settlement, leaderboard |
| Shared coordination | config, database, router, middleware, migrations, API contracts |

This split is proposed; confirm it with the other engineer before parallel work.

## Message for the other backend engineer

The Go backend skeleton is being prepared on backend-owen. Please own auth,
users, communities, membership, and invite links. Owen owns markets, positions,
points/refills, transaction history, settlement/refunds, and rankings.

Our next shared task is the PostgreSQL schema and database connection. Agree on
one migration owner, user IDs, the authenticated-user interface, and API response
conventions before writing those integrations. Registration will need to create
the user and starting-point grant atomically; coordinate that with Owen's points
and transaction modules.

## Decisions still pending

- Final schema, ID types, constraints, and migration tooling.
- Starting-point amount and refill eligibility rules.
- Registration integration with point balance and transaction history.
- Payout rounding, no-winning-stake handling, and cancellation rules.
- Leaderboard metric and how refill grants affect it.
- Endpoint names, response conventions, and authentication interface.

## Current review boundary

Skeleton files only. Application logic, migrations, and the database connection
are deferred to later tasks. Review changes locally and obtain Owen's approval
before each push.
