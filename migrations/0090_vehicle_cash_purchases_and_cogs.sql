-- 0090_vehicle_cash_purchases_and_cogs.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0090_vehicle_cash_purchases_and_cogs.sql
--
-- Vehicle imports are settled immediately by cash or bank transfer, not on
-- supplier credit. This migration:
--   1. Replaces the supplier-bill link on vehicle costs with a direct ledger
--      journal link (each cost is capitalised to inventory and paid from
--      cash/bank at the same time).
--   2. Records the COGS journal posted when the vehicle is invoiced.
--
-- Idempotent: ADD/DROP COLUMN IF EXISTS / CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "cost_journal_entry_id" integer REFERENCES "journal_entries"("id");
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "cogs_journal_entry_id" integer REFERENCES "journal_entries"("id");
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "cogs_amount" numeric(15, 2);
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "cogs_posted_at" timestamp;

DROP INDEX IF EXISTS "vehicle_costs_supplier_invoice_idx";
ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "supplier_invoice_id";

CREATE INDEX IF NOT EXISTS "vehicle_costs_cost_journal_idx" ON "vehicle_costs" ("cost_journal_entry_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP INDEX IF EXISTS "vehicle_costs_cost_journal_idx";
-- ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "supplier_invoice_id" integer REFERENCES "supplier_invoices"("id");
-- ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "cogs_posted_at";
-- ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "cogs_amount";
-- ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "cogs_journal_entry_id";
-- ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "cost_journal_entry_id";
-- COMMIT;
