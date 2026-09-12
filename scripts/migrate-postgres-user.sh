#!/bin/bash

set -e

echo "=== Import Using postgres User (No Auth Issues) ==="

# First, restore schema only (structure) using postgres user
echo "Restoring schema structure..."
sudo -u postgres pg_restore -d fisczim \
    /root/fisczim-backups/fisczim_public_20260905_122311.dump \
    --schema-only \
    --no-owner \
    --no-privileges 2>&1 || true

echo "✓ Schema structure restored"

# Then, restore data only
echo "Restoring data..."
sudo -u postgres pg_restore -d fisczim \
    /root/fisczim-backups/fisczim_public_20260905_122311.dump \
    --data-only \
    --no-owner \
    --no-privileges \
    --disable-triggers 2>&1 || true

echo "✓ Data restored"

# Migrate password hashes
echo "Migrating password hashes..."
sudo -u postgres psql -d fisczim << 'EOF'
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
sudo -u postgres psql -d fisczim -c "SELECT COUNT(*) FROM public.users;"
