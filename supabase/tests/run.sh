#!/usr/bin/env bash
# Applies the migration to a throwaway Postgres container with Supabase-like stubs and runs the RLS smoke test.
# Usage: bash supabase/tests/run.sh   (needs docker and the postgres:18-alpine image)
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=fairslot-pg-test
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:18-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
run() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
run <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
grant usage on schema public, auth to anon, authenticated;
grant select on auth.users to authenticated;
grant execute on function auth.uid() to anon, authenticated;
SQL
for f in supabase/migrations/*.sql; do run < "$f"; done
run < supabase/tests/rls_smoke.sql
