-- 0086_vehicle_permissions_and_sale_rate.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0086_vehicle_permissions_and_sale_rate.sql
--
-- 1. vehicles.sale_exchange_rate: converts sale_price (sale_currency) to the
--    USD base so profit/balance are correct for non-USD sales.
-- 2. Permission backfill. Members with a company_role_id get ONLY the stored
--    role permissions (server/lib/permissions.ts), so new code-side keys never
--    reach existing staff. This grants the CRM + vehicle keys to existing
--    system roles according to their legacy_role, mirroring
--    LEGACY_ROLE_PERMISSIONS in shared/permissions.ts. Custom (non-system)
--    roles are left for an admin to grant explicitly.
--
-- Idempotent: ON CONFLICT DO NOTHING / IF NOT EXISTS.

BEGIN;

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "sale_exchange_rate" numeric(14,6) DEFAULT '1.000000';

INSERT INTO "company_role_permissions" ("role_id", "permission")
SELECT r."id", g."permission"
FROM "company_roles" r
JOIN (VALUES
  ('admin','nav.crm'),('admin','crm.pipeline.view'),('admin','crm.pipeline.manage'),('admin','crm.quotation.create'),
  ('admin','crm.duplicates.merge'),('admin','crm.stages.manage'),('admin','crm.reports.view'),
  ('admin','crm.social.view'),('admin','crm.social.capture'),('admin','crm.social.manage'),
  ('admin','nav.vehicles'),('admin','vehicles.view'),('admin','vehicles.manage'),('admin','vehicles.costs'),
  ('admin','vehicles.payments'),('admin','vehicles.delete'),

  ('manager','nav.crm'),('manager','crm.pipeline.view'),('manager','crm.pipeline.manage'),('manager','crm.quotation.create'),
  ('manager','crm.duplicates.merge'),('manager','crm.stages.manage'),('manager','crm.reports.view'),
  ('manager','crm.social.view'),('manager','crm.social.capture'),('manager','crm.social.manage'),
  ('manager','nav.vehicles'),('manager','vehicles.view'),('manager','vehicles.manage'),('manager','vehicles.costs'),
  ('manager','vehicles.payments'),

  ('sales','nav.crm'),('sales','crm.pipeline.view'),('sales','crm.pipeline.manage'),('sales','crm.quotation.create'),
  ('sales','crm.reports.view'),('sales','crm.social.view'),('sales','crm.social.capture'),
  ('sales','nav.vehicles'),('sales','vehicles.view'),('sales','vehicles.manage'),('sales','vehicles.payments'),

  ('member','nav.crm'),('member','crm.pipeline.view'),('member','crm.pipeline.manage'),
  ('member','crm.social.view'),('member','crm.social.capture'),
  ('member','nav.vehicles'),('member','vehicles.view'),

  ('auditor','nav.crm'),('auditor','crm.pipeline.view'),('auditor','crm.reports.view'),('auditor','crm.social.view'),
  ('auditor','nav.vehicles'),('auditor','vehicles.view'),('auditor','vehicles.costs')
) AS g("legacy_role", "permission") ON g."legacy_role" = r."legacy_role"
WHERE r."is_system" = true
ON CONFLICT DO NOTHING;

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DELETE FROM "company_role_permissions" WHERE "permission" LIKE 'vehicles.%' OR "permission" = 'nav.vehicles';
-- ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "sale_exchange_rate";
-- COMMIT;
-- (CRM grants are not rolled back: they may predate this migration.)
