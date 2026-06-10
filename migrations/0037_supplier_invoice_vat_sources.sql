ALTER TABLE "supplier_invoices"
ADD COLUMN IF NOT EXISTS "subtotal_amount" numeric(15, 2) DEFAULT '0.00',
ADD COLUMN IF NOT EXISTS "tax_inclusive" boolean DEFAULT false NOT NULL;

UPDATE "supplier_invoices"
SET "subtotal_amount" = COALESCE("subtotal_amount", "total_amount" - COALESCE("tax_amount", 0))
WHERE "subtotal_amount" IS NULL OR "subtotal_amount" = 0;
