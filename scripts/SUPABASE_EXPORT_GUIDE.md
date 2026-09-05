# Supabase Database Export Guide

Since Supabase has reached its quota limit, direct database connections are blocked. Use one of these methods to export your data.

## Method 1: Supabase CLI (Recommended)

The Supabase CLI can often work even when the web service is quota-limited.

### Install Supabase CLI
```bash
npm install -g supabase
# or
brew install supabase/tap/supabase
```

### Login to Supabase
```bash
supabase login
```

### Export Database
```bash
# Link to your project
supabase link --project-ref nopztclveukecdabuist

# Export the entire database
supabase db dump -f fisczim_dump.sql

# Or export in custom format for easier import
supabase db dump -f fisczim_dump.sql --data-only --schema public
supabase db dump -f fisczim_auth_dump.sql --data-only --schema auth
```

### Export with Password Hashes
```bash
# Export auth schema with password hashes
supabase db dump -f fisczim_with_passwords.sql --schema auth --schema public
```

## Method 2: Supabase Dashboard SQL Editor

If CLI doesn't work, use the web dashboard:

1. Go to https://supabase.com/dashboard/project/nopztclveukecdabuist/sql
2. Run the queries from `export-from-dashboard.sql`
3. For each query, click "Download as CSV"
4. Save all CSV files

### Export Schema Structure
```sql
-- Run this in SQL Editor to get table definitions
SELECT 
  'CREATE TABLE ' || table_name || ' (' ||
  string_agg(
    column_name || ' ' || data_type || 
    CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
    ', '
  ) || ');' as create_statement
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name;
```

## Method 3: Supabase API Export

Use the Supabase Management API to export data:

```bash
# Get your access token from Supabase Dashboard
# Settings > API > access_token

curl -X POST \
  https://api.supabase.com/v1/projects/nopztclveukecdabuist/database/dump \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"schema": ["public", "auth"]}' \
  --output fisczim_dump.sql
```

## Method 4: Manual Table Export via API

If all else fails, export each table via the REST API:

```bash
# Export users
curl -X GET \
  "https://nopztclveukecdabuist.supabase.co/rest/v1/users?select=*" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  --output users.json

# Repeat for each table
```

## Import to Self-Hosted PostgreSQL

Once you have the export, import it to your server:

### If you have SQL dump:
```bash
# On your server
psql -U fisczim -d fisczim -f fisczim_dump.sql
```

### If you have CSV files:
```bash
# On your server
# For each CSV file
psql -U fisczim -d fisczim << EOF
COPY users FROM '/path/to/users.csv' CSV HEADER;
COPY companies FROM '/path/to/companies.csv' CSV HEADER;
-- Repeat for each table
EOF
```

### If you have JSON files:
```bash
# Use a script to convert JSON to SQL INSERT statements
# Then import the SQL file
```

## Migrate Password Hashes

After importing the data, migrate password hashes:

```sql
-- On your server PostgreSQL
UPDATE public.users 
SET password = auth.users.encrypted_password
FROM auth.users
WHERE public.users.id = auth.users.id;

-- Mark users for password change
UPDATE public.users 
SET password_changed = false
WHERE password LIKE '\$pbkdf2-sha256\$%';
```

## Next Steps

1. Choose an export method above
2. Export your data from Supabase
3. Upload the export files to your server
4. Import to your self-hosted PostgreSQL
5. Run the password migration SQL
6. Update your .env with the new DATABASE_URL
7. Restart your application

## Troubleshooting

**CLI fails with quota error:**
- Try Method 2 (Dashboard SQL Editor)
- Or Method 3 (Management API)

**Dashboard is also blocked:**
- Try Method 1 (CLI) - it uses different endpoints
- Or Method 4 (REST API) - uses different authentication

**Need password hashes:**
- Must use CLI or Management API
- Dashboard SQL Editor may not have access to auth schema
