# Database Migration Agent Prompt

You are tasked with migrating a Supabase database to a self-hosted PostgreSQL instance. Follow these steps carefully.

## Server Details
- **Server IP:** 212.90.121.97
- **SSH User:** root
- **Database Name:** fisczim
- **Database User:** fisczim
- **Database Password:** ChangeThisPassword123

## Supabase Connection Details
- **Project Ref:** nopztclveukecdabuist
- **Database URL:** `postgresql://postgres:2512@161.97.115.59:6543/postgres`
- **Important:** Use port 6543 for pg_dump (session mode required for pg_dump compatibility)

## Backup Directory
- **Path:** /root/fisczim-backups/

## Step 1: SSH into the server
```bash
ssh root@212.90.121.97
```

## Step 2: Check existing dump files
List the files in the backup directory:
```bash
ls -lh /root/fisczim-backups/
```

Check if the SQL dump file exists and has data:
```bash
wc -l /root/fisczim-backups/fisczim_complete_20260905_122311.sql
head -50 /root/fisczim-backups/fisczim_complete_20260905_122311.sql
```

**If the file is empty (0 lines) or doesn't exist, proceed to Step 3 to redo the dump.**

## Step 3: Redo the dump from Supabase (if needed)

### 3a. Ensure PostgreSQL client 17 is installed
```bash
# Add PostgreSQL repository
echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt-get update
apt-get install -y postgresql-client-17
```

### 3b. Dump the database
```bash
# Create backup directory
mkdir -p /root/fisczim-backups

# Set Supabase connection string
SUPABASE_DB_URL="postgresql://postgres:2512@161.97.115.59:6543/postgres"

# Dump public schema
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" --format=custom --schema=public --file=/root/fisczim-backups/fisczim_public.dump

# Dump auth schema
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" --format=custom --schema=auth --file=/root/fisczim-backups/fisczim_auth.dump

# Create complete SQL dump
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" --format=plain --no-owner --no-privileges --file=/root/fisczim-backups/fisczim_complete.sql

# List the files
ls -lh /root/fisczim-backups/
```

## Step 4: Import the complete SQL dump

### 4a. Fix file permissions
```bash
chmod 644 /root/fisczim-backups/fisczim_complete.sql
```

### 4b. Import using postgres user (no auth issues)
```bash
sudo -u postgres psql -d fisczim -f /root/fisczim-backups/fisczim_complete.sql
```

## Step 5: Migrate password hashes from auth.users to public.users

```bash
sudo -u postgres psql -d fisczim -c "UPDATE public.users SET password = auth.users.encrypted_password FROM auth.users WHERE public.users.id = auth.users.id AND auth.users.encrypted_password IS NOT NULL;"
```

## Step 6: Mark users with Supabase passwords for password change

```bash
sudo -u postgres psql -d fisczim -c "UPDATE public.users SET password_changed = false WHERE password LIKE '\$pbkdf2-sha256\$%';"
```

## Step 7: Verify the migration

Check the users count:
```bash
sudo -u postgres psql -d fisczim -c "SELECT COUNT(*) FROM public.users;"
```

Check if password hashes were migrated:
```bash
sudo -u postgres psql -d fisczim -c "SELECT id, email, LEFT(password, 20) as password_preview FROM public.users LIMIT 5;"
```

Check auth schema has users:
```bash
sudo -u postgres psql -d fisczim -c "SELECT COUNT(*) FROM auth.users;"
```

## Step 8: Update the application .env file

The application .env file is located at: `/root/fisczim/.env` (or adjust path as needed)

Update the DATABASE_URL to:
```
DATABASE_URL=postgresql://fisczim:ChangeThisPassword123@localhost:5432/fisczim
```

## Step 9: Restart the application

Find the application process and restart it:
```bash
# If using systemd
systemctl restart fisczim

# If using pm2
pm2 restart fisczim

# If using docker
docker-compose restart
```

## Step 10: Final verification

Test the application by checking if it's running and can connect to the database:
```bash
# Check application logs
journalctl -u fisczim -f
# or
pm2 logs
```

## Troubleshooting

### If pg_restore fails with permission errors
Use the SQL dump instead of the custom format dump.

### If the fisczim user cannot authenticate
Use the postgres user with `sudo -u postgres` for all database operations.

### If the public schema is empty
The SQL dump should contain both auth and public schemas. If public is missing, you may need to extract only the public schema statements:
```bash
sed -n '/^CREATE TABLE public\./p' /root/fisczim-backups/fisczim_complete.sql > /root/fisczim-backups/public_schema.sql
sed -n '/^INSERT INTO public\./p' /root/fisczim-backups/fisczim_complete.sql > /root/fisczim-backups/public_data.sql
```

## Summary of Credentials
- **PostgreSQL User:** fisczim
- **PostgreSQL Password:** ChangeThisPassword123
- **PostgreSQL Database:** fisczim
- **Supabase DB URL:** `postgresql://postgres:2512@161.97.115.59:6543/postgres`

## Expected Outcome
- All public schema tables imported with data
- Auth schema imported with password hashes
- Password hashes migrated from auth.users to public.users
- Users with Supabase PBKDF2 passwords marked for password change
- Application running with new local database
