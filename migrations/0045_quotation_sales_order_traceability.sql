-- Add quotation → sales order traceability fields
-- This enables tracking which sales order a quotation converted to

ALTER TABLE "quotations" 
  ADD COLUMN IF NOT EXISTS "sales_order_id" integer;

-- Add foreign key constraint
ALTER TABLE "quotations" 
  ADD CONSTRAINT "quotations_sales_order_id_sales_orders_id_fk" 
  FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") 
  ON DELETE no action ON UPDATE no action;

-- Add conversion timestamp
ALTER TABLE "quotations" 
  ADD COLUMN IF NOT EXISTS "converted_at" timestamp;

-- Add index for performance
CREATE INDEX IF NOT EXISTS "quotations_sales_order_id_idx" 
  ON "quotations" ("sales_order_id");
