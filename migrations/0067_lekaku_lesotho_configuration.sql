-- LEKAKU / Revenue Services Lesotho configuration and product-level levies.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fiscal_provider" text DEFAULT 'ZIMRA';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "lekaku_gateway_url" text;
ALTER TABLE "tax_types" ADD COLUMN IF NOT EXISTS "lekaku_tax_id" text;
ALTER TABLE "tax_types" ADD COLUMN IF NOT EXISTS "lekaku_tax_type" text;

CREATE TABLE IF NOT EXISTS "product_tax_levies" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "tax_type_id" integer NOT NULL REFERENCES "tax_types"("id") ON DELETE CASCADE,
  "applied_for_quantity" numeric(14, 3),
  CONSTRAINT "product_tax_levies_product_tax_unique" UNIQUE("product_id", "tax_type_id")
);
