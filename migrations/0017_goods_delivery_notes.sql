CREATE TABLE IF NOT EXISTS "goods_delivery_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "supplier_id" integer REFERENCES "suppliers"("id"),
  "gdn_number" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "notes" text,
  "created_by" uuid REFERENCES "users"("id"),
  "confirmed_by" uuid REFERENCES "users"("id"),
  "confirmed_grv_number" text,
  "confirmed_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "goods_delivery_notes_company_gdn_number_idx" UNIQUE ("company_id", "gdn_number")
);

CREATE INDEX IF NOT EXISTS "goods_delivery_notes_company_id_idx" ON "goods_delivery_notes" ("company_id");
CREATE INDEX IF NOT EXISTS "goods_delivery_notes_status_idx" ON "goods_delivery_notes" ("status");

CREATE TABLE IF NOT EXISTS "goods_delivery_note_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "gdn_id" integer NOT NULL REFERENCES "goods_delivery_notes"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "quantity_received" numeric(10, 2) NOT NULL,
  "quantity_accepted" numeric(10, 2),
  "quantity_rejected" numeric(10, 2),
  "notes" text
);

CREATE INDEX IF NOT EXISTS "goods_delivery_note_items_gdn_id_idx" ON "goods_delivery_note_items" ("gdn_id");
CREATE INDEX IF NOT EXISTS "goods_delivery_note_items_product_id_idx" ON "goods_delivery_note_items" ("product_id");
