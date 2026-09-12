ALTER TABLE "goods_delivery_notes"
  ADD COLUMN IF NOT EXISTS "purchase_order_id" integer REFERENCES "purchase_orders"("id");

ALTER TABLE "supplier_invoices"
  ADD COLUMN IF NOT EXISTS "purchase_order_id" integer REFERENCES "purchase_orders"("id"),
  ADD COLUMN IF NOT EXISTS "grv_reference" text;

CREATE INDEX IF NOT EXISTS "goods_delivery_notes_purchase_order_idx"
  ON "goods_delivery_notes" ("purchase_order_id");

CREATE INDEX IF NOT EXISTS "supplier_invoices_purchase_order_idx"
  ON "supplier_invoices" ("purchase_order_id");

CREATE INDEX IF NOT EXISTS "supplier_invoices_grv_reference_idx"
  ON "supplier_invoices" ("grv_reference");

ALTER TABLE "products"
  ALTER COLUMN "tax_rate" SET DEFAULT '15.50';

UPDATE "tax_types"
SET
  "rate" = '15.50',
  "effective_from" = DATE '2026-01-01',
  "description" = COALESCE(NULLIF("description", ''), 'Standard VAT rate for taxable supplies')
WHERE "code" = 'VAT-STD';

INSERT INTO "tax_rate_history" (
  "tax_type_id",
  "rate",
  "effective_from",
  "reason",
  "gazette_reference"
)
SELECT
  tt."id",
  '15.50',
  DATE '2026-01-01',
  'Zimbabwe standard VAT rate effective from 1 January 2026',
  'ZIMRA Public Notice 7 of 2026 / Public Notice 28 of 2026'
FROM "tax_types" tt
WHERE tt."code" = 'VAT-STD'
  AND NOT EXISTS (
    SELECT 1
    FROM "tax_rate_history" h
    WHERE h."tax_type_id" = tt."id"
      AND h."rate" = '15.50'
      AND h."effective_from" = DATE '2026-01-01'
  );
