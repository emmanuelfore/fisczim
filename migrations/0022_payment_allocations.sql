ALTER TABLE "payments" ALTER COLUMN "invoice_id" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "payment_allocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "payment_id" integer NOT NULL REFERENCES "payments"("id"),
  "invoice_id" integer NOT NULL REFERENCES "invoices"("id"),
  "amount" numeric(15, 2) NOT NULL,
  "allocated_at" timestamp DEFAULT now() NOT NULL,
  "reversed_at" timestamp,
  "reversal_reason" text
);

CREATE INDEX IF NOT EXISTS "payment_allocations_payment_idx" ON "payment_allocations" ("payment_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_invoice_idx" ON "payment_allocations" ("invoice_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_company_idx" ON "payment_allocations" ("company_id");

CREATE TABLE IF NOT EXISTS "supplier_payment_allocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "supplier_payment_id" integer NOT NULL REFERENCES "supplier_payments"("id"),
  "supplier_invoice_id" integer NOT NULL REFERENCES "supplier_invoices"("id"),
  "amount" numeric(15, 2) NOT NULL,
  "allocated_at" timestamp DEFAULT now() NOT NULL,
  "reversed_at" timestamp,
  "reversal_reason" text
);

CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_payment_idx" ON "supplier_payment_allocations" ("supplier_payment_id");
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_invoice_idx" ON "supplier_payment_allocations" ("supplier_invoice_id");
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_company_idx" ON "supplier_payment_allocations" ("company_id");
