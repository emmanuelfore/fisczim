#!/bin/bash

# Run this script on the live server (212.90.121.97)
# It will install postgresql-client and dump the Supabase database

set -e

echo "=== Supabase Database Dump Script for Live Server ==="

# Install postgresql-client if not already installed
# Add PostgreSQL repository for version 17
if ! command -v pg_dump &> /dev/null; then
    echo "Adding PostgreSQL repository..."
    apt install -y curl gnupg
    sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
    apt update
    apt install -y postgresql-client-17
    echo "✓ postgresql-client-17 installed"
else
    # Check if version matches
    INSTALLED_VERSION=$(pg_dump --version | grep -oP '\d+\.\d+' | head -1)
    if [ "$INSTALLED_VERSION" != "17" ]; then
        echo "Upgrading postgresql-client from version $INSTALLED_VERSION to 17..."
        apt install -y curl gnupg
        sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
        curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
        apt update
        apt install -y postgresql-client-17
        echo "✓ postgresql-client-17 installed"
    else
        echo "✓ postgresql-client-17 already installed"
    fi
fi

# Supabase credentials (using session mode for pg_dump compatibility)
SUPABASE_DB_URL="postgresql://postgres.nopztclveukecdabuist:%23Ndakapenga4710@aws-1-eu-west-3.pooler.supabase.com:6543/postgres"

# Output directory
OUTPUT_DIR="/root/fisczim-backups"
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
echo "Files created in $OUTPUT_DIR:"
echo "  - fisczim_public_${TIMESTAMP}.dump (public schema)"
echo "  - fisczim_auth_${TIMESTAMP}.dump (auth schema with passwords)"
echo "  - fisczim_complete_${TIMESTAMP}.sql (complete SQL dump)"
echo ""
echo "Next steps:"
echo "1. Import to local PostgreSQL on server"
echo "2. Run password migration"
echo "3. Update .env with new DATABASE_URL"
