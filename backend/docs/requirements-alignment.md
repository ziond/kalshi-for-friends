# Backend requirements alignment

Source: repository `docs/api-contract.md` and `docs/requirements.md`, also supplied
by Owen. This is implementation status, not a claim that full-stack acceptance
has passed. No production/shared database was changed during implementation.

## Implemented in this change

| Requirements | Implementation | Verification |
| --- | --- | --- |
| AUTH-07,13–15,19–20 | Ed25519 PEM pair validation, access/refresh JWT cookies, PostgreSQL refresh hash registry, atomic single-use rotation and logout revocation | Unit tests; database concurrency test added, not yet run |
| COM-01–07,10–13,19; DSC; INV | Explicit visibility, public discovery/join, moderator selection, private access checks, invite preview, code replacement | Existing integration suite updated; live verification pending |
| WAL-03–05,07–10 | Integer deposit validation, atomic wallet/ledger update, configurable deposit switch, wallet and transaction reads | Integration test added |
| MKT; ODD; FEED | Member-only creation, validated options/deadlines, public/private feeds, server search, probabilities and immutable-position-derived history | Integration test added |
| BET; ACT; USR-03–04 | Member-only bets; market/wallet locks; no option switching; balance/pool/ledger atomicity; paginated activity and positions | Lifecycle and concurrent-bet tests added |
| LCK; RES; DATA-01–05 | Computed deadline locking, moderator checks, locked-only settlement, sorted wallet locks, one settlement, exact payouts/refunds | Exact arithmetic unit tests pass; database race tests added |
| MOD; LDR-01–02 | Mod queue, community net-profit leaderboard, one prediction per settled market; refunds excluded | Integration paths added |
| SEC-07,09 | Per-process authentication throttle, JSON mutation bodies, explicit origin checks | Origin unit test; live proxy check pending |

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
- Full-stack scenarios, performance, and browser accessibility remain unverified.

## Safe verification before restart/push

From backend/, run in Warp (creates an isolated temporary PostgreSQL cluster):

```sh
PG_BIN=/Applications/Postgres.app/Contents/Versions/16/bin RUN_API_TESTS=1 bash scripts/test-migrations.sh
```

The script never uses the shared database URL. Tests truncate data only in that
temporary cluster. This sandbox cannot initialize PostgreSQL shared memory, so
the integration suite could not be executed here. Do not label it passed yet.

After tests pass and Owen approves applying migrations, apply 000005–000007 to
and 000008 to the shared database with the migration owner. The application role additionally
needs `GRANT SELECT, INSERT, DELETE ON refresh_tokens TO kalshi_app;`.
Do not restart the updated API before migrations and permissions are in place.
Migration 000007 rollback intentionally fails if DEPOSIT ledger rows exist;
it never deletes or relabels financial history to make rollback succeed.

Run requirements E2E-1 through E2E-8 against the frontend proxy with mocks off.
Do not share private.pem. No push is authorized by this document.
