-- Rename all lekaku_* database columns to lekuka_* (correct spelling).
-- Revenue Services Lesotho's product is "Lekuka e-Invoicing".

ALTER TABLE "companies" RENAME COLUMN "lekaku_gateway_url" TO "lekuka_gateway_url";
ALTER TABLE "companies" RENAME COLUMN "lekaku_tax_rounding_type" TO "lekuka_tax_rounding_type";

ALTER TABLE "tax_types" RENAME COLUMN "lekaku_tax_id" TO "lekuka_tax_id";
ALTER TABLE "tax_types" RENAME COLUMN "lekaku_tax_type" TO "lekuka_tax_type";
ALTER TABLE "tax_types" RENAME COLUMN "lekaku_tax_code" TO "lekuka_tax_code";
ALTER TABLE "tax_types" RENAME COLUMN "lekaku_environment" TO "lekuka_environment";
ALTER TABLE "tax_types" RENAME COLUMN "lekaku_valid_from" TO "lekuka_valid_from";
ALTER TABLE "tax_types" RENAME COLUMN "lekaku_valid_till" TO "lekuka_valid_till";
