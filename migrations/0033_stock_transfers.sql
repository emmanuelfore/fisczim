CREATE TABLE IF NOT EXISTS "stock_transfers" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "transfer_number" text NOT NULL,
  "from_branch_id" integer REFERENCES "branches"("id"),
  "to_branch_id" integer REFERENCES "branches"("id"),
  "status" text DEFAULT 'IN_TRANSIT' NOT NULL,
  "notes" text,
  "dispatched_by" uuid REFERENCES "users"("id"),
  "dispatched_at" timestamp DEFAULT now(),
  "received_by" uuid REFERENCES "users"("id"),
  "received_at" timestamp,
  "cancelled_by" uuid REFERENCES "users"("id"),
  "cancelled_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "stock_transfers_company_number_idx" ON "stock_transfers" ("company_id", "transfer_number");
CREATE INDEX IF NOT EXISTS "stock_transfers_company_id_idx" ON "stock_transfers" ("company_id");
CREATE INDEX IF NOT EXISTS "stock_transfers_status_idx" ON "stock_transfers" ("status");

CREATE TABLE IF NOT EXISTS "stock_transfer_items" (
  "id" serial PRIMARY KEY,
  "transfer_id" integer NOT NULL REFERENCES "stock_transfers"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "quantity" numeric(10, 2) NOT NULL,
  "quantity_received" numeric(10, 2),
  "unit_cost" numeric(10, 2) DEFAULT '0.00',
  "notes" text
);

CREATE INDEX IF NOT EXISTS "stock_transfer_items_transfer_id_idx" ON "stock_transfer_items" ("transfer_id");
CREATE INDEX IF NOT EXISTS "stock_transfer_items_product_id_idx" ON "stock_transfer_items" ("product_id");
