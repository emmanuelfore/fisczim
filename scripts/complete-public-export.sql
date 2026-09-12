-- ============================================
-- Complete Public Schema Export Query
-- Run this in the Supabase Dashboard SQL Editor
-- https://supabase.com/dashboard/project/nopztclveukecdabuist/sql
-- ============================================

-- STEP 1: First, run this to see which tables actually exist in your database
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- STEP 2: Then, for each table that exists, run the corresponding SELECT query below
-- and click "Download as CSV"

-- Common tables (run these if they exist in your database)
SELECT * FROM public.users;
SELECT * FROM public.companies;
SELECT * FROM public.branches;
SELECT * FROM public.customers;
SELECT * FROM public.products;
SELECT * FROM public.invoices;
SELECT * FROM public.invoice_items;
SELECT * FROM public.payments;
SELECT * FROM public.receipts;
SELECT * FROM public.currencies;

-- Additional tables (run only if they exist in your database from STEP 1)
SELECT * FROM public.reset_tokens;
SELECT * FROM public.idempotency_keys;
SELECT * FROM public.branch_users;
SELECT * FROM public.branch_stocks;
SELECT * FROM public.inventory_locations;
SELECT * FROM public.inventory_location_stocks;
SELECT * FROM public.company_roles;
SELECT * FROM public.company_role_permissions;
SELECT * FROM public.approval_requests;
SELECT * FROM public.company_users;
SELECT * FROM public.company_access_roles;
SELECT * FROM public.tax_types;
SELECT * FROM public.tax_categories;
SELECT * FROM public.tax_rate_history;
SELECT * FROM public.product_tax_levies;
SELECT * FROM public.product_categories;
SELECT * FROM public.company_partners;
SELECT * FROM public.validation_errors;
SELECT * FROM public.product_variations;
SELECT * FROM public.product_batches;
SELECT * FROM public.price_adjustments;
SELECT * FROM public.stock_movements;
SELECT * FROM public.expenses;
SELECT * FROM public.accounts;
SELECT * FROM public.transactions;
SELECT * FROM public.exchange_rates;
SELECT * FROM public.bus_shifts;
SELECT * FROM public.bus_tickets;
SELECT * FROM public.bus_routes;
SELECT * FROM public.bus_schedules;
SELECT * FROM public.sage_oauth_tokens;
SELECT * FROM public.sage_webhooks;
SELECT * FROM public.api_logs;
SELECT * FROM public.feature_settings;
SELECT * FROM public.compound_products;
SELECT * FROM public.compound_product_items;
