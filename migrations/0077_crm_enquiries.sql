-- 0077_crm_enquiries.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0077_crm_enquiries.sql
--
-- WHY THIS EXISTS
-- CRM follow-ups: every enquiry is captured, assigned and followed up, including
-- prospects who return months later. This is the one part of the vehicle-import
-- requirement with no existing home in the schema, so it gets two tables only.
--
-- Everything else the requirement asks for already exists and is NOT duplicated here:
--   vehicle identity  -> products + product_serial_numbers (VIN as serial number)
--   landed cost       -> inventory_cost_components + landed_cost_documents/allocations
--   import tracking   -> consignments + consignment_purchase_orders
--   deposits/partials -> payments + payment_allocations + laybys
--
-- Returning prospects resolve to their existing customer record: enquiries.customer_id
-- is linked by matching phone/email against customers, so history is continuous rather
-- than a second disconnected contact list.
--
-- Reversible: the rollback at the bottom drops both tables and their indexes.

BEGIN;

CREATE TABLE IF NOT EXISTS "enquiries" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "branch_id" integer REFERENCES "branches"("id"),
  "customer_id" integer REFERENCES "customers"("id"),
  "name" text NOT NULL,
  "phone" text,
  "email" text,
  "source" text DEFAULT 'walk_in',
  "interest" text,
  "notes" text,
  "status" text NOT NULL DEFAULT 'new',
  "assigned_to" uuid REFERENCES "users"("id"),
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "enquiries_company_idx" ON "enquiries" ("company_id");
CREATE INDEX IF NOT EXISTS "enquiries_status_idx" ON "enquiries" ("status");
CREATE INDEX IF NOT EXISTS "enquiries_assigned_to_idx" ON "enquiries" ("assigned_to");

CREATE TABLE IF NOT EXISTS "enquiry_follow_ups" (
  "id" serial PRIMARY KEY,
  "enquiry_id" integer NOT NULL REFERENCES "enquiries"("id") ON DELETE CASCADE,
  "due_at" timestamp,
  "channel" text DEFAULT 'call',
  "notes" text,
  "outcome" text,
  "completed_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "enquiry_follow_ups_enquiry_idx" ON "enquiry_follow_ups" ("enquiry_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TABLE IF EXISTS "enquiry_follow_ups";
-- DROP TABLE IF EXISTS "enquiries";
-- COMMIT;
