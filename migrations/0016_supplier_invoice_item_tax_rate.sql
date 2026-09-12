ALTER TABLE "supplier_invoice_items"
ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5, 2) DEFAULT '0.00';
