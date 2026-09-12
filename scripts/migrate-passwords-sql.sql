-- This script should be run on the Supabase database (auth schema)
-- It extracts password hashes from auth.users and converts them to bcrypt format
-- Then updates the public.users table with the bcrypt hashes

-- Enable pgcrypto for bcrypt support (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a temporary function to convert PBKDF2 to bcrypt
-- Note: This is a simplified approach. In production, you might need to:
-- 1. Export the data
-- 2. Convert passwords using a script
-- 3. Import back

-- First, let's create a migration table to track the conversion
CREATE TABLE IF NOT EXISTS password_migration_log (
    user_id UUID PRIMARY KEY,
    email TEXT,
    old_hash TEXT,
    new_hash TEXT,
    migrated_at TIMESTAMP DEFAULT NOW()
);

-- Export users with their password hashes
-- This query will give you the data needed for migration
SELECT 
    u.id,
    u.email,
    u.encrypted_password as password_hash,
    u.created_at,
    u.updated_at
FROM auth.users u
WHERE u.encrypted_password IS NOT NULL;

-- IMPORTANT: Supabase uses PBKDF2-SHA256 which is not directly compatible with bcrypt
-- To migrate passwords, you have two options:

-- OPTION 1: Force password reset (recommended for security)
-- Update all users to require password change
UPDATE public.users 
SET password_changed = false 
WHERE id IN (SELECT id FROM auth.users);

-- OPTION 2: Hybrid authentication (support both hash types during transition)
-- This requires updating your auth middleware to check both hash types
-- See the updated server/routes/auth.ts for hybrid password verification

-- OPTION 3: Convert hashes (complex, requires external script)
-- You would need to:
-- 1. Export the auth.users table
-- 2. Use a Node.js script to convert PBKDF2 to bcrypt
-- 3. Import the converted hashes back
-- This is complex because PBKDF2 and bcrypt use different algorithms

-- RECOMMENDED APPROACH:
-- Use hybrid authentication that supports both hash types
-- When a user logs in with their old Supabase password, verify with PBKDF2
-- Then re-hash with bcrypt and update the database
-- This allows seamless migration without forcing password resets
