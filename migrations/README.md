# PostgreSQL migrations

Target: PostgreSQL 16 or later. Numbered `.up.sql` / `.down.sql` files use the
[golang-migrate format](https://github.com/golang-migrate/migrate/blob/master/MIGRATIONS.md).
Each file is an explicit transaction, so a failed file rolls back its DDL.

| Version | Creates |
| --- | --- |
| 000001 | users, wallets |
| 000002 | communities, community_members |
| 000003 | markets, market_options, market_participants, positions |
| 000004 | settlements, transactions |
| 000005 | refresh_tokens |
| 000006 | communities.visibility |
| 000007 | DEPOSIT transactions |
| 000008 | calculate_prediction_score, score backfill |
| 000009 | PAYOUT_PENDING status, settlements.payout_at / paid_out_at |
| 000010 | wallets.next_daily_bonus_at, DAILY_BONUS transaction type |

Use the golang-migrate CLI with PostgreSQL support. It maintains schema version,
migration locking, and dirty state. Do not run individual files manually against
a shared database: that bypasses version tracking.

From the repository root, with a database URL supplied in your shell environment
(`migrate` does not read `.env`):

```sh
migrate -path migrations -database "$DATABASE_URL" version
migrate -path migrations -database "$DATABASE_URL" up
```

An empty database has no version until its first migration. The database itself
must already exist. No credentials or application connection are supplied here.
Install the CLI separately if it is not available; it is not a Go API dependency.

## Rollback

Down migrations DROP tables and their data. For a disposable development database,
roll back one version with:

```sh
migrate -path migrations -database "$DATABASE_URL" down 1
```

Back up persistent data before any rollback. Do not use `force` to hide a failed
migration; investigate and repair the failure first.

Once a migration is shared/applied, do not edit it: add the next numbered pair.
Owen owns migration numbering for this stage; coordinate before adding files.

## Verify without touching an existing database

The test script creates a private temporary PostgreSQL cluster with TCP disabled,
applies all migrations, checks constraints, rolls everything back, and reapplies.
It stops its own server on exit and leaves the temporary data/logs for inspection.
It does not use DATABASE_URL or any existing server. It checks the SQL lifecycle,
not the golang-migrate CLI/version table.

```sh
bash scripts/test-migrations.sh
```

If PostgreSQL binaries are not on PATH:

```sh
PG_BIN=/Applications/Postgres.app/Contents/Versions/16/bin bash scripts/test-migrations.sh
```

See [schema and integration notes](../docs/database.md) before writing queries.
