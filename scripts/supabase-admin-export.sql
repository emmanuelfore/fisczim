-- ============================================
-- Supabase Admin Dashboard Export Query
-- Run this in the Supabase Dashboard SQL Editor
-- https://supabase.com/dashboard/project/nopztclveukecdabuist/sql
-- ============================================

-- IMPORTANT: Switch to "auth" schema in the schema selector
-- Then run this query to export auth users with password hashes

SELECT 
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    raw_app_meta_data
FROM auth.users
WHERE encrypted_password IS NOT NULL;

-- After running this, click "Download as CSV" and save as auth_users.csv

-- ============================================
-- Then switch to "public" schema and run these queries
-- ============================================

-- Export users table
SELECT * FROM public.users;

-- Export companies table
SELECT * FROM public.companies;

-- Export customers table
SELECT * FROM public.customers;

-- Export products table
SELECT * FROM public.products;

-- Export invoices table
SELECT * FROM public.invoices;

-- Export invoice_items table
SELECT * FROM public.invoice_items;

-- Export branches table
SELECT * FROM public.branches;

-- Export currencies table
SELECT * FROM public.currencies;

-- Export tax_rates table
SELECT * FROM public.tax_rates;

-- Export all other tables (add more as needed)
SELECT * FROM public.payments;
SELECT * FROM public.receipts;
SELECT * FROM public.stock;
SELECT * FROM public.stock_movements;
SELECT * FROM public.expenses;
SELECT * FROM public.accounts;
SELECT * FROM public.transactions;

-- ============================================
-- Get table structure for schema recreation
-- ============================================

SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ============================================
-- Get foreign key constraints
-- ============================================

SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public';
