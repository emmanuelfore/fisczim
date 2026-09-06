#!/bin/bash
set -e
# Usage: ./dump_supabase.sh
# Requires: postgresql-client (pg_dump, psql)

SOURCE_URL="postgresql://postgres.nopztclveukecdabuist:%23Ndakapenga4710@aws-1-eu-west-3.pooler.supabase.com:6543/postgres"
TARGET_URL="postgresql://postgres:2512@161.97.115.59:5432/fisczim"

if ! command -v pg_dump &> /dev/null; then
  echo "pg_dump not found — installing postgresql-client..."
  sudo apt update && sudo apt install -y postgresql-client
fi

echo "Dumping public schema from Supabase..."
pg_dump "$SOURCE_URL" --schema=public --data-only --no-owner --no-privileges --disable-triggers -f /tmp/supabase_public.sql

echo "Dump saved to /tmp/supabase_public.sql ($(wc -l < /tmp/supabase_public.sql) lines)"
echo "Importing to $TARGET_URL ..."
psql "$TARGET_URL" -f /tmp/supabase_public.sql

echo "Done."
