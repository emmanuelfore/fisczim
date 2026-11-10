-- 0079_vehicle_imports.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0079_vehicle_imports.sql
--
-- Vehicle-import module (Prime Imports): per-vehicle landed costing,
-- import tracking timeline, payment schedule, plus invoice T&Cs and a
-- vehicle link on payments so deposits use the existing payments ledger.

BEGIN;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "invoice_terms" text;

CREATE TABLE IF NOT EXISTS "vehicles" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "stock_number" text NOT NULL,
  "vin" text,
  "make" text NOT NULL,
  "model" text NOT NULL,
  "year" integer,
  "colour" text,
  "mileage" integer,
  "engine" text,
  "transmission" text,
  "supplier_name" text,
  "auction_ref" text,
  "container_number" text,
  "vessel_name" text,
  "port_of_discharge" text,
  "eta" date,
  "stage" text NOT NULL DEFAULT 'purchased',
  "status" text NOT NULL DEFAULT 'available',
  "target_price" numeric(15,2) DEFAULT '0.00',
  "sale_price" numeric(15,2),
  "sale_currency" text DEFAULT 'USD',
  "customer_id" integer REFERENCES "customers"("id"),
  "enquiry_id" integer REFERENCES "enquiries"("id"),
  "consignment_id" integer,
  "invoice_id" integer REFERENCES "invoices"("id"),
  "notes" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "vehicles_company_stock_unique" UNIQUE ("company_id", "stock_number")
);
CREATE INDEX IF NOT EXISTS "vehicles_company_idx" ON "vehicles" ("company_id");
CREATE INDEX IF NOT EXISTS "vehicles_customer_idx" ON "vehicles" ("customer_id");

CREATE TABLE IF NOT EXISTS "vehicle_costs" (
  "id" serial PRIMARY KEY,
  "vehicle_id" integer NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "description" text,
  "amount" numeric(15,2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "exchange_rate" numeric(14,6) NOT NULL DEFAULT '1.000000',
  "base_amount" numeric(15,2) NOT NULL,
  "payee" text,
  "reference" text,
  "cost_date" date,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vehicle_costs_vehicle_idx" ON "vehicle_costs" ("vehicle_id");

CREATE TABLE IF NOT EXISTS "vehicle_stage_events" (
  "id" serial PRIMARY KEY,
  "vehicle_id" integer NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
  "stage" text NOT NULL,
  "event_date" timestamp NOT NULL DEFAULT now(),
  "notes" text,
  "notify_customer" boolean NOT NULL DEFAULT false,
  "notified_at" timestamp,
  "notified_via" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vehicle_stage_events_vehicle_idx" ON "vehicle_stage_events" ("vehicle_id");

CREATE TABLE IF NOT EXISTS "vehicle_payment_schedules" (
  "id" serial PRIMARY KEY,
  "vehicle_id" integer NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
  "type" text NOT NULL DEFAULT 'instalment',
  "due_date" date NOT NULL,
  "amount" numeric(15,2) NOT NULL,
  "last_reminder_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vehicle_payment_schedules_vehicle_idx" ON "vehicle_payment_schedules" ("vehicle_id");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "vehicle_id" integer REFERENCES "vehicles"("id");
CREATE INDEX IF NOT EXISTS "payments_vehicle_id_idx" ON "payments" ("vehicle_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP INDEX IF EXISTS "payments_vehicle_id_idx";
-- ALTER TABLE "payments" DROP COLUMN IF EXISTS "vehicle_id";
-- DROP TABLE IF EXISTS "vehicle_payment_schedules";
-- DROP TABLE IF EXISTS "vehicle_stage_events";
-- DROP TABLE IF EXISTS "vehicle_costs";
-- DROP TABLE IF EXISTS "vehicles";
-- ALTER TABLE "companies" DROP COLUMN IF EXISTS "invoice_terms";
-- COMMIT;
