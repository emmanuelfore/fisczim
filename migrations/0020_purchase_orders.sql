CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "supplier_id" integer NOT NULL REFERENCES "suppliers"("id"),
  "branch_id" integer REFERENCES "branches"("id"),
  "po_number" text NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "expected_date" timestamp,
  "notes" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "purchase_order_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "purchase_order_id" integer NOT NULL REFERENCES "purchase_orders"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "quantity" numeric(10, 2) NOT NULL,
  "unit_cost" numeric(10, 2) NOT NULL,
  "notes" text
);

CREATE INDEX IF NOT EXISTS "purchase_orders_company_id_idx" ON "purchase_orders" ("company_id");
CREATE INDEX IF NOT EXISTS "purchase_orders_supplier_id_idx" ON "purchase_orders" ("supplier_id");
CREATE INDEX IF NOT EXISTS "purchase_orders_status_idx" ON "purchase_orders" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_company_po_number_idx" ON "purchase_orders" ("company_id", "po_number");
CREATE INDEX IF NOT EXISTS "purchase_order_items_po_id_idx" ON "purchase_order_items" ("purchase_order_id");
CREATE INDEX IF NOT EXISTS "purchase_order_items_product_id_idx" ON "purchase_order_items" ("product_id");
