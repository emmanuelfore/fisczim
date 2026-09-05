#!/bin/bash

# Database Dump Script using Supabase credentials
# This will dump the entire Supabase database including password hashes

set -e

echo "=== Supabase Database Dump Script ==="

# Supabase credentials from .env
SUPABASE_DB_URL="postgresql://postgres.nopztclveukecdabuist:%23Ndakapenga4710@aws-1-eu-west-3.pooler.supabase.com:5432/postgres"

# Output directory
OUTPUT_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$OUTPUT_DIR"

echo "Dumping Supabase database..."
echo "This may take a while depending on data size..."

# Dump public schema (application data)
echo "Dumping public schema..."
pg_dump "$SUPABASE_DB_URL" \
    --format=custom \
    --file="$OUTPUT_DIR/fisczim_public_${TIMESTAMP}.dump" \
    --schema=public

echo "✓ Public schema dumped to: $OUTPUT_DIR/fisczim_public_${TIMESTAMP}.dump"

# Dump auth schema (authentication data with password hashes)
echo "Dumping auth schema..."
pg_dump "$SUPABASE_DB_URL" \
    --format=custom \
    --file="$OUTPUT_DIR/fisczim_auth_${TIMESTAMP}.dump" \
    --schema=auth

echo "✓ Auth schema dumped to: $OUTPUT_DIR/fisczim_auth_${TIMESTAMP}.dump"

# Also create a plain SQL dump for easier inspection
echo "Creating plain SQL dump..."
pg_dump "$SUPABASE_DB_URL" \
    --format=plain \
    --file="$OUTPUT_DIR/fisczim_complete_${TIMESTAMP}.sql" \
    --schema=public \
    --schema=auth

echo "✓ Complete SQL dump created: $OUTPUT_DIR/fisczim_complete_${TIMESTAMP}.sql"

echo ""
echo "=== Dump Complete ==="
echo "Files created:"
echo "  - $OUTPUT_DIR/fisczim_public_${TIMESTAMP}.dump (public schema)"
echo "  - $OUTPUT_DIR/fisczim_auth_${TIMESTAMP}.dump (auth schema with passwords)"
echo "  - $OUTPUT_DIR/fisczim_complete_${TIMESTAMP}.sql (complete SQL dump)"
echo ""
echo "Next steps:"
echo "1. Upload these files to your server: scp $OUTPUT_DIR/*_${TIMESTAMP}.* root@212.90.121.97:/root/"
echo "2. On server, import to PostgreSQL"
echo "3. Run password migration script"
