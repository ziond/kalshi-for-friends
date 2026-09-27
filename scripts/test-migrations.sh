#!/usr/bin/env bash
set -euo pipefail

backend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pg_bin="${PG_BIN:-}"
if [[ -z "$pg_bin" ]]; then
    pg_ctl_path="$(command -v pg_ctl || true)"
    if [[ -z "$pg_ctl_path" ]]; then
        printf '%s\n' 'Set PG_BIN to a directory containing initdb, pg_ctl, and psql.' >&2
        exit 1
    fi
    pg_bin="$(dirname "$pg_ctl_path")"
fi
for binary in initdb pg_ctl psql postgres; do
    if [[ ! -x "$pg_bin/$binary" ]]; then
        printf 'Missing PostgreSQL executable: %s/%s\n' "$pg_bin" "$binary" >&2
        exit 1
    fi
done

up_files=("$backend_dir"/migrations/*.up.sql)
down_files=("$backend_dir"/migrations/*.down.sql)
if [[ ${#up_files[@]} -ne ${#down_files[@]} ]]; then
    printf '%s\n' 'Migration up/down file counts differ.' >&2
    exit 1
fi
for up_file in "${up_files[@]}"; do
    [[ -f "${up_file%.up.sql}.down.sql" ]] || {
        printf 'Missing down migration for %s\n' "$up_file" >&2
        exit 1
    }
done

# Short path keeps PostgreSQL Unix sockets below the OS path length limit.
cluster_dir="$(mktemp -d /private/tmp/oracle-migrations.XXXXXX 2>/dev/null || mktemp -d /tmp/oracle-migrations.XXXXXX)"
mkdir "$cluster_dir/socket"
cleanup() {
    local result=$?
    trap - EXIT
    if [[ -f "$cluster_dir/data/postmaster.pid" ]]; then
        "$pg_bin/pg_ctl" -D "$cluster_dir/data" -m fast -w stop >/dev/null || result=1
    fi
    printf 'Temporary test cluster (stopped): %s\n' "$cluster_dir"
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$pg_bin/initdb" -D "$cluster_dir/data" -U migration_test \
    --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8 >"$cluster_dir/initdb.log"
"$pg_bin/pg_ctl" -D "$cluster_dir/data" -l "$cluster_dir/server.log" \
    -o "-c listen_addresses='' -c unix_socket_directories='$cluster_dir/socket'" -w start >/dev/null

psql_cmd=("$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$cluster_dir/socket" -U migration_test -d postgres)

for up_file in "${up_files[@]}"; do
    printf 'Apply %s\n' "$(basename "$up_file")"
    "${psql_cmd[@]}" -f "$up_file" >"$cluster_dir/migration.log" 2>&1 || {
        cat "$cluster_dir/migration.log"
        exit 1
    }
done
"${psql_cmd[@]}" -f "$backend_dir/tests/schema.sql"

for ((i=${#down_files[@]}-1; i>=0; i--)); do
    printf 'Rollback %s\n' "$(basename "${down_files[$i]}")"
    "${psql_cmd[@]}" -f "${down_files[$i]}" >"$cluster_dir/migration.log" 2>&1 || {
        cat "$cluster_dir/migration.log"
        exit 1
    }
done
table_count="$("${psql_cmd[@]}" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
if [[ "$table_count" != "0" ]]; then
    printf 'Rollback left %s tables behind.\n' "$table_count" >&2
    exit 1
fi
for up_file in "${up_files[@]}"; do
    "${psql_cmd[@]}" -f "$up_file" >"$cluster_dir/migration.log" 2>&1 || {
        cat "$cluster_dir/migration.log"
        exit 1
    }
done
"${psql_cmd[@]}" -f "$backend_dir/tests/schema.sql"
printf '%s\n' 'PASS: migrations apply, constraints hold, rollback is clean, and reapplication succeeds.'

if [[ "${RUN_API_TESTS:-0}" == "1" ]]; then
    # Only this newly-created isolated cluster is used, never the app database.
    (cd "$backend_dir" && TEST_DATABASE_URL="postgres://migration_test@/postgres?host=$cluster_dir/socket&sslmode=disable" go test -count=1 -p 1 ./...)
fi
