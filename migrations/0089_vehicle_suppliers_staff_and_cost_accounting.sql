-- 0089_vehicle_suppliers_staff_and_cost_accounting.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0089_vehicle_suppliers_staff_and_cost_accounting.sql
--
-- 1. Link a vehicle to the supplier it was bought from (the legacy
--    supplier_name text column is kept for imports/backfill).
-- 2. Link a vehicle to the staff member (salesperson) handling the sale.
-- 3. Track the supplier bill created when a vehicle cost is posted to
--    accounts payable, so it cannot be posted twice.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "supplier_id" integer REFERENCES "suppliers"("id");
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "salesperson_id" uuid REFERENCES "users"("id");

ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "supplier_invoice_id" integer REFERENCES "supplier_invoices"("id");

CREATE INDEX IF NOT EXISTS "vehicles_supplier_idx" ON "vehicles" ("supplier_id");
CREATE INDEX IF NOT EXISTS "vehicles_salesperson_idx" ON "vehicles" ("salesperson_id");
CREATE INDEX IF NOT EXISTS "vehicle_costs_supplier_invoice_idx" ON "vehicle_costs" ("supplier_invoice_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP INDEX IF EXISTS "vehicle_costs_supplier_invoice_idx";
-- DROP INDEX IF EXISTS "vehicles_salesperson_idx";
-- DROP INDEX IF EXISTS "vehicles_supplier_idx";
-- ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "supplier_invoice_id";
-- ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "salesperson_id";
-- ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "supplier_id";
-- COMMIT;
