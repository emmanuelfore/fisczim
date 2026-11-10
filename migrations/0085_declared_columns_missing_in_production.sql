-- 0085_declared_columns_missing_in_production.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0085_declared_columns_missing_in_production.sql
--
-- WHY THIS EXISTS
-- shared/schema.ts declares five columns that the live database does not have. That is not
-- cosmetic here: the app reads whole rows with `db.select().from(companies)` rather than
-- naming the columns it needs, so one absent column fails the entire query — Postgres
-- answers `column companies.invoice_terms does not exist` and the caller gets a 500. The
-- reads that break are on paths the product cannot avoid:
--
--   * storage.ts:897 (getCompanies, for a super admin) and storage.ts:944 (getCompany) —
--     getCompanies is what checkCompanyAccess() calls, which gates nearly every
--     authenticated route, including the POS shift routes added today.
--   * api/v1/payroll.ts:1092, 5915, 6045, lib/partnerships.ts:60 and routes.ts:2229 — the
--     payroll product reads the company row to pick its currency, country and fiscal
--     provider, and the settings route reads it back after a write.
--
-- MEASURED, not guessed: every column declared by schema.ts (2,401 of them across 194 live
-- tables) was compared against a structure-only dump of production taken 2026-11-06. Four
-- tables are behind, five columns in total. The other 2,396 match, so this file is the whole
-- of the drift, not a sample of it.
--
-- All five are nullable and unconstrained, exactly as declared:
--   * companies.invoice_terms, layby_items.serial_number — plain text.
--   * payments.vehicle_id — integer with no foreign key. schema.ts declares no reference on
--     it either, which matters because the vehicles table (migration 0079) has not been
--     applied to production; a REFERENCES vehicles(id) here would fail on an absent table.
--   * quotations.sales_order_id, quotations.converted_at — sales_orders does exist, but the
--     link was never enforced, and adding a constraint to 100k+ existing rows is a separate
--     decision with its own orphan check. This file only makes the reads work again.
--
-- Reversible: the rollback at the bottom drops exactly what this adds. Dropping a column
-- that the app already reads would break it again, so the rollback is only for undoing a
-- mistaken run.

BEGIN;

SET LOCAL search_path TO public;

ALTER TABLE companies     ADD COLUMN IF NOT EXISTS invoice_terms  text;
ALTER TABLE layby_items   ADD COLUMN IF NOT EXISTS serial_number  text;
ALTER TABLE payments      ADD COLUMN IF NOT EXISTS vehicle_id     integer;
ALTER TABLE quotations    ADD COLUMN IF NOT EXISTS sales_order_id integer;
ALTER TABLE quotations    ADD COLUMN IF NOT EXISTS converted_at   timestamp;

COMMENT ON COLUMN companies.invoice_terms IS
  'Terms and conditions printed on invoices and quotations. Declared in shared/schema.ts; the app selects companies.*, so its absence fails the whole read.';

COMMIT;

-- Rollback:
--   ALTER TABLE quotations    DROP COLUMN IF EXISTS converted_at;
--   ALTER TABLE quotations    DROP COLUMN IF EXISTS sales_order_id;
--   ALTER TABLE payments      DROP COLUMN IF EXISTS vehicle_id;
--   ALTER TABLE layby_items   DROP COLUMN IF EXISTS serial_number;
--   ALTER TABLE companies     DROP COLUMN IF EXISTS invoice_terms;
