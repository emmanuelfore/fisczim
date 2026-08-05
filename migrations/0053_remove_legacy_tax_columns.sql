-- Remove legacy statutory columns from tax_tables_config that are now managed in payroll_statutory_rules
ALTER TABLE "tax_tables_config" DROP COLUMN IF EXISTS "nssa_rate_employee";
ALTER TABLE "tax_tables_config" DROP COLUMN IF EXISTS "nssa_rate_employer";
ALTER TABLE "tax_tables_config" DROP COLUMN IF EXISTS "nssa_ceiling_limit";
ALTER TABLE "tax_tables_config" DROP COLUMN IF EXISTS "aids_levy_rate";
