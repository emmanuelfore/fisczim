-- 0088_vehicle_costing_improvements.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0088_vehicle_costing_improvements.sql
--
-- Vehicle costing improvements:
--   1. Cost lifecycle (status / due_date / paid_at) so committed and paid
--      costs can be tracked separately from the landed cost total.
--   2. Optional supplier link so spending can be filtered/reported by vendor.
--   3. source/source_id lets freight/consignment allocations be re-run
--      idempotently without touching hand-entered cost lines.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "due_date" date;
ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "paid_at" date;
ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "supplier_id" integer REFERENCES "suppliers"("id");
ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';
ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "source_id" integer;

CREATE INDEX IF NOT EXISTS "vehicle_costs_supplier_idx" ON "vehicle_costs" ("supplier_id");
CREATE INDEX IF NOT EXISTS "vehicle_costs_status_idx" ON "vehicle_costs" ("status");

-- Only auto-generated rows are unique per vehicle/source/category. Manual
-- lines keep source_id NULL so Postgres treats them as distinct and users can
-- still enter several lines in the same category.
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_costs_auto_source_unique"
  ON "vehicle_costs" ("vehicle_id", "source", "source_id", "category")
  WHERE "source_id" IS NOT NULL;

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP INDEX IF EXISTS "vehicle_costs_auto_source_unique";
-- DROP INDEX IF EXISTS "vehicle_costs_status_idx";
-- DROP INDEX IF EXISTS "vehicle_costs_supplier_idx";
-- ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "source_id";
-- ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "source";
-- ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "supplier_id";
-- ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "paid_at";
-- ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "due_date";
-- ALTER TABLE "vehicle_costs" DROP COLUMN IF EXISTS "status";
-- COMMIT;
