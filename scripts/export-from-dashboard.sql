-- ============================================
-- Supabase Database Export Script
-- Run this in the Supabase Dashboard SQL Editor
-- ============================================

-- This script will export all your data to CSV files
-- You can then import these into your self-hosted PostgreSQL

-- Step 1: Export all tables from public schema
-- Run each of these queries and use the "Download as CSV" button in the dashboard

-- Export users table
COPY (
  SELECT * FROM public.users
) TO STDOUT WITH CSV HEADER;

-- Export companies table
COPY (
  SELECT * FROM public.companies
) TO STDOUT WITH CSV HEADER;

-- Export customers table
COPY (
  SELECT * FROM public.customers
) TO STDOUT WITH CSV HEADER;

-- Export products table
COPY (
  SELECT * FROM public.products
) TO STDOUT WITH CSV HEADER;

-- Export invoices table
COPY (
  SELECT * FROM public.invoices
) TO STDOUT WITH CSV HEADER;

-- Export invoice_items table
COPY (
  SELECT * FROM public.invoice_items
) TO STDOUT WITH CSV HEADER;

-- Export all other tables (add more as needed)
COPY (
  SELECT * FROM public.branches
) TO STDOUT WITH CSV HEADER;

COPY (
  SELECT * FROM public.currencies
) TO STDOUT WITH CSV HEADER;

COPY (
  SELECT * FROM public.tax_rates
) TO STDOUT WITH CSV HEADER;

-- Step 2: Export auth users with password hashes
-- This requires admin access to the auth schema
-- Run this in a separate query with auth schema selected

COPY (
  SELECT 
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data
  FROM auth.users
) TO STDOUT WITH CSV HEADER;

-- Step 3: Export schema structure
-- Run this to get the table definitions
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
