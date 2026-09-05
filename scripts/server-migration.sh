#!/bin/bash

# Server Migration Script
# This script should be run on the server (212.90.121.97)
# It will:
# 1. Set up PostgreSQL
# 2. Export data from Supabase
# 3. Import to local PostgreSQL
# 4. Migrate password hashes

set -e

echo "=== FiscalZim Server Migration Script ==="
echo "This script will migrate from Supabase to self-hosted PostgreSQL"
echo ""

# Configuration
SUPABASE_URL="https://nopztclveukecdabuist.supabase.co"
# Please provide the correct Supabase database connection string
SUPABASE_DB_URL="postgresql://postgres:YOUR_PASSWORD@aws-1-eu-west-2.pooler.supabase.com:5432/postgres"
LOCAL_DB_NAME="fisczim"
LOCAL_DB_USER="fisczim"
LOCAL_DB_PASSWORD="ChangeThisPassword123"
LOCAL_DB_HOST="localhost"
LOCAL_DB_PORT="5432"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root"
    exit 1
fi

# Step 1: Install PostgreSQL
echo ""
echo "Step 1: Installing PostgreSQL..."
if command -v psql &> /dev/null; then
    print_success "PostgreSQL already installed"
else
    apt update
    apt install -y postgresql postgresql-contrib
    print_success "PostgreSQL installed"
fi

# Step 2: Start PostgreSQL
echo ""
echo "Step 2: Starting PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql
print_success "PostgreSQL started"

# Step 3: Create database and user
echo ""
echo "Step 3: Creating database and user..."
sudo -u postgres psql << EOF
-- Create database
CREATE DATABASE ${LOCAL_DB_NAME};

-- Create user
CREATE USER ${LOCAL_DB_USER} WITH PASSWORD '${LOCAL_DB_PASSWORD}';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ${LOCAL_DB_NAME} TO ${LOCAL_DB_USER};
EOF

print_success "Database and user created"

# Step 4: Export from Supabase
echo ""
echo "Step 4: Exporting data from Supabase..."
echo "This may take a while depending on data size..."

# Create backup directory
mkdir -p /tmp/fisczim-migration
cd /tmp/fisczim-migration

# Export public schema (application data)
pg_dump "${SUPABASE_DB_URL}" \
    --format=custom \
    --file=fisczim_public.dump \
    --schema=public

print_success "Public schema exported"

# Export auth schema (authentication data with password hashes)
pg_dump "${SUPABASE_DB_URL}" \
    --format=custom \
    --file=fisczim_auth.dump \
    --schema=auth

print_success "Auth schema exported"

# Step 5: Import to local PostgreSQL
echo ""
echo "Step 5: Importing data to local PostgreSQL..."

# Import public schema
pg_restore -d ${LOCAL_DB_NAME} -U ${LOCAL_DB_USER} -h localhost fisczim_public.dump
print_success "Public schema imported"

# Import auth schema to a separate schema first
sudo -u postgres psql -d ${LOCAL_DB_NAME} << EOF
CREATE SCHEMA IF NOT EXISTS auth_import;
EOF

pg_restore -d ${LOCAL_DB_NAME} -U ${LOCAL_DB_USER} -h localhost \
    --schema=auth_import \
    --no-owner \
    --no-privileges \
    fisczim_auth.dump

print_success "Auth schema imported to auth_import schema"

# Step 6: Migrate password hashes
echo ""
echo "Step 6: Migrating password hashes..."

sudo -u postgres psql -d ${LOCAL_DB_NAME} << EOF
-- Copy password hashes from auth_import.users to public.users
UPDATE public.users 
SET password = auth_import.users.encrypted_password
FROM auth_import.users
WHERE public.users.id = auth_import.users.id
AND auth_import.users.encrypted_password IS NOT NULL;

-- Mark users as needing password change
UPDATE public.users 
SET password_changed = false
WHERE password LIKE '\$pbkdf2-sha256\$%';

-- Drop the temporary auth_import schema
DROP SCHEMA auth_import CASCADE;
EOF

print_success "Password hashes migrated"

# Step 7: Clean up
echo ""
echo "Step 7: Cleaning up..."
rm -rf /tmp/fisczim-migration
print_success "Cleanup complete"

# Step 8: Configure PostgreSQL for production
echo ""
echo "Step 8: Configuring PostgreSQL for production..."

# Update pg_hba.conf to allow local connections
PG_HBA="/etc/postgresql/*/main/pg_hba.conf"
if [ -f "$PG_HBA" ]; then
    sed -i 's/local   all             all                                     peer/local   all             all                                     md5/' "$PG_HBA"
    systemctl restart postgresql
    print_success "PostgreSQL configured for md5 authentication"
else
    print_warning "Could not find pg_hba.conf"
fi

# Step 9: Display connection string
echo ""
echo "Step 9: Migration complete!"
echo ""
print_success "Database migration completed successfully"
echo ""
echo "Your DATABASE_URL is:"
echo "postgresql://${LOCAL_DB_USER}:${LOCAL_DB_PASSWORD}@${LOCAL_DB_HOST}:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}"
echo ""
echo "IMPORTANT:"
echo "1. Update your .env file with the DATABASE_URL above"
echo "2. Change the database password in production"
echo "3. Users with Supabase password hashes will be upgraded to bcrypt on next login"
echo "4. They will be required to change their password after migration"
echo ""
print_warning "Please save the DATABASE_URL above for your .env file"
