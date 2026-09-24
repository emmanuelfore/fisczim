-- LEKUKA authoritative tax reference data (spec: Tax object from GetConfig).
--
-- Test and production gateways issue DIFFERENT taxIDs for the same semantic
-- tax, so tax_types rows are scoped per environment (lekuka_environment).
-- Products are remapped to the new env's rows on environment switch — never
-- reuse one env's taxID against the other gateway (RCPT025).
ALTER TABLE "tax_types" ADD COLUMN IF NOT EXISTS "lekuka_tax_code" text;
ALTER TABLE "tax_types" ADD COLUMN IF NOT EXISTS "lekuka_environment" text DEFAULT 'test';
ALTER TABLE "tax_types" ADD COLUMN IF NOT EXISTS "lekuka_valid_from" date;
ALTER TABLE "tax_types" ADD COLUMN IF NOT EXISTS "lekuka_valid_till" date;

-- LEKUKA receipt arithmetic mode (spec TaxRoundingType). Stable per fiscal day.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "lekuka_tax_rounding_type" text DEFAULT 'PerReceipt';

-- Backfill: existing LEKUKA-mapped rows belong to the test environment.
UPDATE "tax_types" SET "lekuka_environment" = 'test' WHERE "lekuka_tax_id" IS NOT NULL AND "lekuka_environment" IS NULL;
