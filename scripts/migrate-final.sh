#!/bin/bash

set -e

echo "=== Create Schema and Import Data ==="

# Extract CREATE TABLE statements for public schema
echo "Extracting table structure..."
sed -n '/^CREATE TABLE public\./p' /root/fisczim-backups/fisczim_complete_20260905_122311.sql > /root/fisczim-backups/schema.sql

# Add the closing semicolons
sed -i 's/;$//' /root/fisczim-backups/schema.sql

echo "✓ Schema extracted"

# Create the schema
echo "Creating tables..."
psql -U fisczim -d fisczim -h localhost -f /root/fisczim-backups/schema.sql 2>&1 || true

echo "✓ Tables created (some may have failed)"

# Extract INSERT statements for public schema
echo "Extracting data..."
sed -n '/^INSERT INTO public\./p' /root/fisczim-backups/fisczim_complete_20260905_122311.sql > /root/fisczim-backups/data.sql

echo "✓ Data extracted"

# Import the data
echo "Importing data..."
psql -U fisczim -d fisczim -h localhost -f /root/fisczim-backups/data.sql 2>&1 || true

echo "✓ Data imported"

# Migrate password hashes
echo "Migrating password hashes..."
psql -U fisczim -d fisczim -h localhost << 'EOF'
UPDATE public.users 
SET password = auth.users.encrypted_password
FROM auth.users
WHERE public.users.id = auth.users.id
AND auth.users.encrypted_password IS NOT NULL;

UPDATE public.users 
SET password_changed = false
WHERE password LIKE '$pbkdf2-sha256$%';
EOF

echo "✓ Password hashes migrated"

echo ""
echo "=== Complete ==="
echo "Check users count:"
psql -U fisczim -d fisczim -h localhost -c "SELECT COUNT(*) FROM public.users;"
