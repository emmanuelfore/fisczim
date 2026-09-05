#!/bin/bash

# Run this directly on your server - copy and paste into terminal

set -e

echo "=== Supabase Database Dump Script ==="

# Add PostgreSQL repository for version 17
echo "Adding PostgreSQL repository..."
apt install -y curl gnupg lsb-release
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt update
apt install -y postgresql-client-17
echo "✓ postgresql-client-17 installed"

# Supabase credentials
SUPABASE_DB_URL="postgresql://postgres:2512@161.97.115.59:6543/postgres"

# Output directory
OUTPUT_DIR="/root/fisczim-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$OUTPUT_DIR"

echo "Dumping Supabase database..."
echo "This may take a while depending on data size..."

# Dump public schema
echo "Dumping public schema..."
pg_dump "$SUPABASE_DB_URL" \
    --format=custom \
    --file="$OUTPUT_DIR/fisczim_public_${TIMESTAMP}.dump" \
    --schema=public

echo "✓ Public schema dumped"

# Dump auth schema
echo "Dumping auth schema..."
pg_dump "$SUPABASE_DB_URL" \
    --format=custom \
    --file="$OUTPUT_DIR/fisczim_auth_${TIMESTAMP}.dump" \
    --schema=auth

echo "✓ Auth schema dumped"

# Create plain SQL dump
echo "Creating plain SQL dump..."
pg_dump "$SUPABASE_DB_URL" \
    --format=plain \
    --file="$OUTPUT_DIR/fisczim_complete_${TIMESTAMP}.sql" \
    --schema=public \
    --schema=auth

echo "✓ Complete SQL dump created"

echo ""
echo "=== Dump Complete ==="
echo "Files in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"
