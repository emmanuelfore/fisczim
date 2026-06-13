-- Migration: Enforce IFRS fields on accounts
-- Date: 2026-06-11
-- Purpose:
--   1. Add sub_type (Current, Non-current, Operating, Finance)
--   2. Add ifrs_mapping_tag
--   3. Backfill data based on existing type and category

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sub_type text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ifrs_mapping_tag text;

-- Temporarily set default for normalBalance since we enforce NOT NULL
ALTER TABLE accounts ALTER COLUMN normal_balance SET DEFAULT 'DEBIT';

-- Backfill normal_balance
UPDATE accounts 
SET normal_balance = CASE 
    WHEN type IN ('ASSET', 'EXPENSE') THEN 'DEBIT'
    WHEN type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN 'CREDIT'
    ELSE 'DEBIT'
END
WHERE normal_balance IS NULL;

ALTER TABLE accounts ALTER COLUMN normal_balance SET NOT NULL;

-- Backfill sub_type
UPDATE accounts
SET sub_type = CASE
    WHEN category IN ('Current Assets', 'Current Liabilities') THEN 'Current'
    WHEN category IN ('Non-current Assets', 'Non-current Liabilities') THEN 'Non-current'
    WHEN category IN ('Equity', 'Revenue', 'Cost of Sales', 'Operating Expenses', 'Taxation') THEN 'Operating'
    WHEN category IN ('Finance Costs', 'Other Income') THEN 'Finance'
    ELSE 'Operating'
END
WHERE sub_type IS NULL;

-- Set NOT NULL and DEFAULT for sub_type
ALTER TABLE accounts ALTER COLUMN sub_type SET DEFAULT 'Operating';
ALTER TABLE accounts ALTER COLUMN sub_type SET NOT NULL;
