# Supabase to Custom Auth Migration Guide

This guide explains how to migrate from Supabase authentication to a custom JWT-based authentication system.

## Overview

The migration replaces Supabase Auth with a custom JWT-based authentication system while keeping the database layer intact. This gives you complete control over authentication while maintaining all existing data.

## What Has Been Changed

### Server-Side Changes

1. **New JWT Library** (`server/lib/jwt.ts`)
   - JWT token generation and verification
   - Access token (1h expiry) and refresh token (7d expiry)
   - Configurable expiration times

2. **New Auth Routes** (`server/routes/auth.ts`)
   - `POST /api/auth/register` - User registration
   - `POST /api/auth/login` - User login
   - `POST /api/auth/refresh` - Token refresh
   - `POST /api/auth/logout` - User logout
   - `GET /api/auth/me` - Get current user
   - `POST /api/auth/change-password` - Change password

3. **Updated Auth Middleware** (`server/auth.ts`)
   - Simplified JWT verification
   - Removed Supabase-specific logic
   - Uses custom JWT verification

4. **Removed Supabase Dependencies**
   - Removed Supabase client from `server/db.ts`
   - Removed Supabase imports from auth middleware

### Client-Side Changes

1. **New Auth Client** (`client/src/lib/auth.ts`)
   - Custom auth client replacing Supabase
   - Token management in localStorage
   - Auto-refresh on 401 errors
   - Auth state change listeners

2. **Updated Auth Hooks** (`client/src/hooks/use-auth.ts`)
   - Replaced Supabase auth calls with custom auth
   - Maintained offline support
   - Updated password change to accept current password

3. **Removed Supabase Dependencies**
   - Removed Supabase imports from auth hooks

### Mobile-Side Changes

1. **New Auth Client** (`mobile/src/lib/auth.ts`)
   - Custom auth client for mobile
   - Secure storage using expo-secure-store
   - Token management and auto-refresh

2. **Updated Screens**
   - `LoginScreen.tsx` - Uses custom auth
   - `SignUpScreen.tsx` - Uses custom auth

3. **Updated API Layer** (`mobile/src/lib/api.ts`)
   - Replaced Supabase session with JWT tokens
   - Token refresh on 401 errors
   - Maintained offline support

## Migration Steps

### 1. Set Up PostgreSQL Database

If you haven't already, set up your self-hosted PostgreSQL database:

```bash
# Install PostgreSQL on your server
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE fisczim;
CREATE USER fisczim_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE fisczim TO fisczim_user;
```

### 2. Export Data from Supabase

```bash
# Use existing backup or create new one
pg_dump "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres" \
  --format=custom \
  --file=fisczim_backup.dump
```

### 3. Import to Self-Hosted PostgreSQL

```bash
pg_restore -d fisczim -U fisczim_user -h localhost fisczim_backup.dump
```

### 4. Migrate User Accounts

Run the migration script to transfer user accounts from Supabase Auth to your database:

```bash
# Make sure Supabase credentials are still in .env
npm run tsx scripts/migrate-users-from-supabase.ts
```

**Important:** All migrated users will have a temporary password `ChangeMe123!` and will be required to change it on first login.

### 5. Update Environment Variables

Update your `.env` file:

```bash
# Custom JWT Authentication Configuration
JWT_SECRET=your-jwt-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Database URL for Drizzle ORM (PostgreSQL)
DATABASE_URL=postgresql://fisczim_user:secure_password@localhost:5432/fisczim

# Application
NODE_ENV=development
PORT=5000
VITE_API_URL=https://fiscalstack.co.zw
```

For mobile, update `mobile/.env`:

```bash
EXPO_PUBLIC_API_BASE_URL=https://fiscalstack.co.zw
```

### 6. Install Dependencies

Dependencies are already installed in the main project:

```bash
npm install jsonwebtoken bcrypt
npm install --save-dev @types/jsonwebtoken @types/bcrypt
```

### 7. Test the Migration

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Test registration:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123","name":"Test User"}'
   ```

3. **Test login:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```

4. **Test protected endpoint:**
   ```bash
   curl -X GET http://localhost:5000/api/user \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```

### 8. Update Mobile App

1. Update mobile environment variables
2. Rebuild the mobile app
3. Test login/signup flows

## Post-Migration Cleanup

### Remove Supabase Dependencies

After successful migration, you can remove Supabase dependencies:

```bash
npm uninstall @supabase/supabase-js @supabase/ssr
```

### Remove Supabase Files

Delete or archive these files:
- `server/supabase.ts`
- `client/src/lib/supabase.ts`
- `mobile/src/lib/supabase.ts`
- `SUPABASE_SETUP.md`
- `supabase_rls_policies.sql`

### Update Documentation

Update any documentation that references Supabase authentication.

## Important Notes

### Password Changes

- Migrated users must change their password on first login
- The `updatePassword` function now requires `currentPassword` parameter
- Update any UI components that handle password changes

### Google OAuth

- Google OAuth is not implemented in the custom auth system
- If you need OAuth, you'll need to implement it separately using a library like `passport-google-oauth20`

### Token Refresh

- Access tokens expire after 1 hour (configurable)
- Refresh tokens expire after 7 days (configurable)
- The auth clients automatically handle token refresh

### Security

- Generate strong JWT secrets for production
- Use environment variables for secrets
- Never commit secrets to version control
- Consider using a secrets manager for production

## Troubleshooting

### Login Fails After Migration

1. Check that the user was migrated successfully
2. Try the temporary password `ChangeMe123!`
3. Check server logs for authentication errors

### Token Refresh Fails

1. Verify JWT secrets match between server and client
2. Check that refresh tokens are being stored correctly
3. Verify token expiration times

### Mobile App Issues

1. Ensure API URL is correct in mobile env
2. Check that secure storage is working
3. Verify network connectivity to the server

## Rollback Plan

If you need to rollback:

1. Restore Supabase dependencies:
   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   ```

2. Restore Supabase environment variables

3. Revert code changes from git

4. Restore Supabase auth integration in auth hooks and screens

## Support

For issues or questions during migration, check:
- Server logs for authentication errors
- Browser console for client-side errors
- Mobile logs for mobile-specific issues
