#!/usr/bin/env bash
# Clone wacrm Postgres data from prod Supabase → test Supabase.
#
# Prerequisites:
#   - Supabase CLI logged in:  supabase login
#   - pg_dump / psql (Postgres client tools) — or rely on supabase db dump
#   - Database passwords from each project's Settings → Database
#
# Usage:
#   PROD_DB_PASSWORD='...' TEST_DB_PASSWORD='...' ./scripts/clone-prod-to-test-db.sh
#
# Optional overrides:
#   PROD_REF=fckxyxrbckddbxokzvsa
#   TEST_REF=ndaiorusaqmkdpywvzuf
#   PROD_POOLER_HOST=aws-1-ap-south-1.pooler.supabase.com   # from dashboard Connect
#   TEST_POOLER_HOST=aws-1-ap-southeast-1.pooler.supabase.com
#   SKIP_SCHEMA=1          # skip migration push (test already has schema)
#   SKIP_AUTH=1            # skip auth.users copy (sign up fresh on test instead)
#
# Pooler hosts are NOT always aws-0-* — copy from Supabase → Connect → Session pooler
# if auto-discovery fails.
#
# After clone:
#   - Point .env.local at TEST Supabase URL + keys
#   - Keep the SAME ENCRYPTION_KEY as prod if you copied whatsapp_config
#   - Restart npm run dev

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROD_REF="${PROD_REF:-fckxyxrbckddbxokzvsa}"
TEST_REF="${TEST_REF:-ndaiorusaqmkdpywvzuf}"
DUMP_DIR="${DUMP_DIR:-/tmp/wacrm-db-clone-$$}"
SKIP_SCHEMA="${SKIP_SCHEMA:-0}"
SKIP_AUTH="${SKIP_AUTH:-0}"

if [[ -z "${PROD_DB_PASSWORD:-}" || -z "${TEST_DB_PASSWORD:-}" ]]; then
  echo "ERROR: Set PROD_DB_PASSWORD and TEST_DB_PASSWORD." >&2
  echo "  Supabase → Project → Settings → Database → Database password" >&2
  exit 1
fi

mkdir -p "$DUMP_DIR"
trap 'rm -rf "$DUMP_DIR"' EXIT

# Discover pooler host via supabase link (writes supabase/.temp/pooler-url).
# New projects often land on aws-1 / aws-2, not aws-0 — wrong host → "tenant not found".
discover_pooler_host() {
  local ref=$1
  local password=$2
  local override_var=$3
  local override="${!override_var:-}"

  if [[ -n "$override" ]]; then
    echo "$override"
    return 0
  fi

  supabase link --project-ref "$ref" --password "$password" --yes >/dev/null

  local pooler_url
  pooler_url=$(cat supabase/.temp/pooler-url)
  # postgresql://postgres.REF@HOST:PORT/postgres
  local host
  host=$(echo "$pooler_url" | sed -E 's|^postgresql://[^@]+@([^:/]+).*|\1|')
  if [[ -z "$host" || "$host" == "$pooler_url" ]]; then
    echo "ERROR: Could not parse pooler host for $ref. Set ${override_var} manually." >&2
    echo "  Supabase Dashboard → Connect → Session pooler → copy Host" >&2
    exit 1
  fi
  echo "$host"
}

resolve_psql() {
  local pg_dump_bin
  pg_dump_bin=$(resolve_pg_dump)
  echo "${pg_dump_bin/pg_dump/psql}"
}

run_psql() {
  local ref=$1
  local password=$2
  local pooler_host=$3
  shift 3
  local psql_bin
  psql_bin=$(resolve_psql)
  export PGPASSWORD="$password"
  export PGHOST="$pooler_host"
  export PGPORT="5432"
  export PGUSER="postgres.${ref}"
  export PGDATABASE="postgres"
  "$psql_bin" -v ON_ERROR_STOP=1 "$@"
}

run_pg_dump() {
  local ref=$1
  local password=$2
  local pooler_host=$3
  shift 3
  local user="postgres.${ref}"
  local pg_dump_bin
  pg_dump_bin=$(resolve_pg_dump)
  PGPASSWORD="$password" "$pg_dump_bin" \
    -h "$pooler_host" \
    -p 5432 \
    -U "$user" \
    -d postgres \
    "$@"
}

# Supabase runs PG 17 — Homebrew often ships pg_dump 14, which refuses to dump.
resolve_pg_dump() {
  local candidate ver major
  for candidate in \
    "${PG_DUMP:-}" \
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump" \
    "/usr/local/opt/postgresql@17/bin/pg_dump" \
    "/opt/homebrew/opt/postgresql@16/bin/pg_dump" \
    "/usr/local/opt/postgresql@16/bin/pg_dump" \
    "$(command -v pg_dump 2>/dev/null || true)"; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    ver=$("$candidate" --version 2>/dev/null | grep -oE '[0-9]+' | head -1)
    major=${ver:-0}
    if [[ "$major" -ge 16 ]]; then
      echo "$candidate"
      return 0
    fi
  done
  echo "ERROR: pg_dump 16+ required (Supabase uses PG 17). Install with:" >&2
  echo "  brew install postgresql@17" >&2
  echo "  export PATH=\"/opt/homebrew/opt/postgresql@17/bin:\$PATH\"" >&2
  exit 1
}

# Pooler postgres cannot DISABLE TRIGGER ALL (system RI triggers). Strip those
# lines if present; also drop session_replication_role (superuser-only on some hosts).
sanitize_dump() {
  local file=$1
  sed -E \
    -e '/^SET session_replication_role/d' \
    -e '/^ALTER TABLE .* DISABLE TRIGGER ALL;/d' \
    -e '/^ALTER TABLE .* ENABLE TRIGGER ALL;/d' \
    "$file" > "${file}.sanitized"
  mv "${file}.sanitized" "$file"
}

truncate_public_tables() {
  local ref=$1
  local password=$2
  local pooler_host=$3
  run_psql "$ref" "$password" "$pooler_host" <<'SQL'
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('schema_migrations', 'supabase_migrations')
  ) LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.tablename);
  END LOOP;
END $$;
SQL
}

echo "==> Prod:  $PROD_REF"
echo "==> Test:  $TEST_REF"
echo "==> Temp:  $DUMP_DIR"
echo ""

echo "==> Resolving pooler hosts (via Supabase CLI)..."
PROD_POOLER_HOST=$(discover_pooler_host "$PROD_REF" "$PROD_DB_PASSWORD" PROD_POOLER_HOST)
TEST_POOLER_HOST=$(discover_pooler_host "$TEST_REF" "$TEST_DB_PASSWORD" TEST_POOLER_HOST)
echo "    Prod pooler:  $PROD_POOLER_HOST"
echo "    Test pooler:  $TEST_POOLER_HOST"
echo ""

if [[ "$SKIP_SCHEMA" != "1" ]]; then
  echo "==> [1/5] Applying migrations to TEST (empty schema)..."
  supabase link --project-ref "$TEST_REF" --password "$TEST_DB_PASSWORD" --yes
  supabase db push --linked --yes
  echo ""
fi

echo "==> [2/5] Dumping PROD public schema data..."
run_pg_dump "$PROD_REF" "$PROD_DB_PASSWORD" "$PROD_POOLER_HOST" \
  --schema=public \
  --data-only \
  --no-owner \
  --no-privileges \
  --file="$DUMP_DIR/public_data.sql"
sanitize_dump "$DUMP_DIR/public_data.sql"

if [[ "$SKIP_AUTH" != "1" ]]; then
  echo "==> [3/5] Dumping PROD auth users (so logins work on test)..."
  run_pg_dump "$PROD_REF" "$PROD_DB_PASSWORD" "$PROD_POOLER_HOST" \
    --schema=auth \
    --data-only \
    --no-owner \
    --no-privileges \
    --table=auth.users \
    --table=auth.identities \
    --file="$DUMP_DIR/auth_users.sql" || {
      echo "WARN: auth dump failed — use SKIP_AUTH=1 and sign up fresh on test." >&2
    }
  [[ -f "$DUMP_DIR/auth_users.sql" ]] && sanitize_dump "$DUMP_DIR/auth_users.sql"
else
  echo "==> [3/5] Skipping auth copy (SKIP_AUTH=1)"
fi

echo "==> [4/5] Clearing TEST public data..."
truncate_public_tables "$TEST_REF" "$TEST_DB_PASSWORD" "$TEST_POOLER_HOST"

if [[ "$SKIP_AUTH" != "1" && -f "$DUMP_DIR/auth_users.sql" ]]; then
  echo "    Clearing TEST auth users..."
  run_psql "$TEST_REF" "$TEST_DB_PASSWORD" "$TEST_POOLER_HOST" <<'SQL'
TRUNCATE auth.identities CASCADE;
TRUNCATE auth.users CASCADE;
SQL
fi

echo "==> [5/5] Restoring into TEST..."
if [[ "$SKIP_AUTH" != "1" && -f "$DUMP_DIR/auth_users.sql" && -s "$DUMP_DIR/auth_users.sql" ]]; then
  run_psql "$TEST_REF" "$TEST_DB_PASSWORD" "$TEST_POOLER_HOST" \
    -f "$DUMP_DIR/auth_users.sql"
  # handle_new_user creates profile + account rows on auth insert; wipe
  # those before loading prod public data (avoids idx_accounts_one_per_owner).
  echo "    Clearing signup-trigger rows before public restore..."
  truncate_public_tables "$TEST_REF" "$TEST_DB_PASSWORD" "$TEST_POOLER_HOST"
fi
run_psql "$TEST_REF" "$TEST_DB_PASSWORD" "$TEST_POOLER_HOST" \
  -f "$DUMP_DIR/public_data.sql"

echo ""
echo "Done. Test database now mirrors prod public data."
echo ""
echo "Next steps:"
echo "  1. Update .env.local → TEST Supabase URL, anon key, service_role key"
echo "  2. Keep ENCRYPTION_KEY identical to prod (whatsapp_config tokens)"
echo "  3. npm run dev  (restart after env change)"
