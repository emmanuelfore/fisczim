#!/bin/bash

set -e

echo "=== Supabase Database Dump Script ==="

# Supabase credentials
SUPABASE_DB_URL="postgresql://postgres:2512@161.97.115.59:6543/postgres"

# Output directory
OUTPUT_DIR="/root/fisczim-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$OUTPUT_DIR"

echo "Dumping Supabase database..."

# Dump public schema using pg_dump-17 explicitly
echo "Dumping public schema..."
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" \
    --format=custom \
    --file="$OUTPUT_DIR/fisczim_public_${TIMESTAMP}.dump" \
    --schema=public

echo "✓ Public schema dumped"

# Dump auth schema
echo "Dumping auth schema..."
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" \
    --format=custom \
    --file="$OUTPUT_DIR/fisczim_auth_${TIMESTAMP}.dump" \
    --schema=auth

echo "✓ Auth schema dumped"

# Create plain SQL dump
echo "Creating plain SQL dump..."
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" \
    --format=plain \
    --file="$OUTPUT_DIR/fisczim_complete_${TIMESTAMP}.sql" \
    --schema=public \
    --schema=auth

echo "✓ Complete SQL dump created"

echo ""
echo "=== Dump Complete ==="
echo "Files in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"
