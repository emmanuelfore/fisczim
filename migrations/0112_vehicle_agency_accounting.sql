-- 0112: Vehicle-import agency accounting
--
-- Separates customer money held for third-party costs from Prime Imports'
-- processing-fee revenue. Existing vehicles default to `agent`; a vehicle can
-- still be marked `principal` where Prime Imports legally buys and resells.

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "accounting_model" text DEFAULT 'agent' NOT NULL;
--> statement-breakpoint

ALTER TABLE "vehicle_costs"
  ADD COLUMN IF NOT EXISTS "estimated_base_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  ADD COLUMN IF NOT EXISTS "customer_charge_base_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  ADD COLUMN IF NOT EXISTS "customer_allocated_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  ADD COLUMN IF NOT EXISTS "third_party_paid_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  ADD COLUMN IF NOT EXISTS "include_in_customer_statement" boolean DEFAULT true NOT NULL;
--> statement-breakpoint

-- Existing lines have no separate estimate/charge: treat incurred cost as both.
UPDATE "vehicle_costs"
   SET "estimated_base_amount" = "base_amount"
 WHERE "estimated_base_amount" = 0 AND "base_amount" <> 0;
--> statement-breakpoint
UPDATE "vehicle_costs"
   SET "customer_charge_base_amount" = "base_amount"
 WHERE "customer_charge_base_amount" = 0 AND "base_amount" <> 0;
--> statement-breakpoint

ALTER TABLE "vehicle_sales_agreements"
  ADD COLUMN IF NOT EXISTS "accounting_model" text DEFAULT 'agent' NOT NULL,
  ADD COLUMN IF NOT EXISTS "processing_fee_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  ADD COLUMN IF NOT EXISTS "cost_sheet_total" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  ADD COLUMN IF NOT EXISTS "fee_recognition" text DEFAULT 'on_handover' NOT NULL,
  ADD COLUMN IF NOT EXISTS "fee_recognition_journal_entry_id" integer;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "vehicle_sales_agreements"
    ADD CONSTRAINT "vsa_fee_recognition_journal_fk"
    FOREIGN KEY ("fee_recognition_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vehicle_customer_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "agreement_id" integer,
  "customer_id" integer,
  "currency" text DEFAULT 'USD' NOT NULL,
  "exchange_rate" decimal(14, 6) DEFAULT '1.000000' NOT NULL,
  "total_price" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "cost_sheet_total" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "processing_fee_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "amount_collected" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "amount_allocated_to_costs" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "amount_allocated_to_fee" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "fee_invoice_settled_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "amount_paid_to_third_parties" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "fee_recognised_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "vehicle_customer_accounts" ADD CONSTRAINT "vca_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_customer_accounts" ADD CONSTRAINT "vca_vehicle_fk" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_customer_accounts" ADD CONSTRAINT "vca_agreement_fk" FOREIGN KEY ("agreement_id") REFERENCES "vehicle_sales_agreements"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_customer_accounts" ADD CONSTRAINT "vca_customer_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE "vehicle_customer_accounts"
  ADD COLUMN IF NOT EXISTS "fee_invoice_settled_amount" decimal(15, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vca_vehicle_unique" ON "vehicle_customer_accounts" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "vca_company_idx" ON "vehicle_customer_accounts" ("company_id");
CREATE INDEX IF NOT EXISTS "vca_customer_idx" ON "vehicle_customer_accounts" ("customer_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vehicle_customer_payment_allocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "account_id" integer NOT NULL,
  "payment_id" integer NOT NULL,
  "cost_id" integer,
  "allocation_type" text DEFAULT 'cost' NOT NULL,
  "amount" decimal(15, 2) NOT NULL,
  "allocated_at" timestamp DEFAULT now() NOT NULL,
  "reversed_at" timestamp,
  "reversal_reason" text,
  "reverses_allocation_id" integer,
  "created_by" uuid
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "vehicle_customer_payment_allocations" ADD CONSTRAINT "vcpa_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_customer_payment_allocations" ADD CONSTRAINT "vcpa_account_fk" FOREIGN KEY ("account_id") REFERENCES "vehicle_customer_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_customer_payment_allocations" ADD CONSTRAINT "vcpa_payment_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_customer_payment_allocations" ADD CONSTRAINT "vcpa_cost_fk" FOREIGN KEY ("cost_id") REFERENCES "vehicle_costs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_customer_payment_allocations" ADD CONSTRAINT "vcpa_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE "vehicle_customer_payment_allocations"
  ADD COLUMN IF NOT EXISTS "reversed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text,
  ADD COLUMN IF NOT EXISTS "reverses_allocation_id" integer;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vcpa_account_idx" ON "vehicle_customer_payment_allocations" ("account_id");
CREATE INDEX IF NOT EXISTS "vcpa_payment_idx" ON "vehicle_customer_payment_allocations" ("payment_id");
CREATE INDEX IF NOT EXISTS "vcpa_cost_idx" ON "vehicle_customer_payment_allocations" ("cost_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vehicle_third_party_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "account_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "cost_id" integer,
  "supplier_id" integer,
  "amount" decimal(15, 2) NOT NULL,
  "base_amount" decimal(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "exchange_rate" decimal(14, 6) DEFAULT '1.000000' NOT NULL,
  "payment_date" timestamp DEFAULT now() NOT NULL,
  "payment_method" text DEFAULT 'bank_transfer' NOT NULL,
  "reference" text,
  "bank_account_id" integer,
  "journal_entry_id" integer,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "vehicle_third_party_payments" ADD CONSTRAINT "vtpp_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_third_party_payments" ADD CONSTRAINT "vtpp_account_fk" FOREIGN KEY ("account_id") REFERENCES "vehicle_customer_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_third_party_payments" ADD CONSTRAINT "vtpp_vehicle_fk" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_third_party_payments" ADD CONSTRAINT "vtpp_cost_fk" FOREIGN KEY ("cost_id") REFERENCES "vehicle_costs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_third_party_payments" ADD CONSTRAINT "vtpp_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_third_party_payments" ADD CONSTRAINT "vtpp_bank_fk" FOREIGN KEY ("bank_account_id") REFERENCES "accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_third_party_payments" ADD CONSTRAINT "vtpp_journal_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "vehicle_third_party_payments" ADD CONSTRAINT "vtpp_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vtpp_account_idx" ON "vehicle_third_party_payments" ("account_id");
CREATE INDEX IF NOT EXISTS "vtpp_cost_idx" ON "vehicle_third_party_payments" ("cost_id");
CREATE INDEX IF NOT EXISTS "vtpp_vehicle_idx" ON "vehicle_third_party_payments" ("vehicle_id");
