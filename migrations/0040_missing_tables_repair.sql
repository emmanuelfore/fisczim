CREATE TABLE IF NOT EXISTS "accounting_segments" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "type" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "cashbook_entries" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "branch_id" integer,
  "bank_account_id" integer NOT NULL,
  "journal_entry_id" integer,
  "entry_date" timestamp NOT NULL DEFAULT now(),
  "type" text NOT NULL,
  "method" text NOT NULL DEFAULT 'CASH',
  "reference" text,
  "counterparty_name" text,
  "description" text NOT NULL,
  "total_amount" numeric(15, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'POSTED',
  "approved_by" uuid,
  "approved_at" timestamp,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "cashbook_entry_lines" (
  "id" serial PRIMARY KEY,
  "cashbook_entry_id" integer NOT NULL,
  "account_id" integer NOT NULL,
  "cost_center_id" integer,
  "description" text,
  "amount" numeric(15, 2) NOT NULL,
  "vat_amount" numeric(15, 2) NOT NULL DEFAULT '0.00'
);
CREATE TABLE IF NOT EXISTS "company_access_roles" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "permissions" jsonb NOT NULL,
  "is_system" boolean NOT NULL DEFAULT false,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "cost_centers" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "parent_id" integer,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "inventory_location_stocks" (
  "id" serial PRIMARY KEY,
  "location_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "stock_level" numeric(10, 2) NOT NULL DEFAULT '0',
  "reserved_quantity" numeric(10, 2) NOT NULL DEFAULT '0',
  "available_quantity" numeric(10, 2) NOT NULL DEFAULT '0',
  "updated_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "inventory_locations" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "type" text NOT NULL DEFAULT 'WAREHOUSE',
  "name" text NOT NULL,
  "code" text,
  "address" text,
  "branch_id" integer,
  "is_default_receiving" boolean NOT NULL DEFAULT false,
  "is_default_dispatch" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "inventory_valuation_snapshots" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "branch_id" integer,
  "as_of_date" timestamp NOT NULL,
  "valuation_method" text NOT NULL,
  "total_quantity" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "total_value" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "lines" jsonb,
  "journal_entry_id" integer,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "mobile_money_transactions" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "payment_id" integer,
  "cashbook_entry_id" integer,
  "network" text NOT NULL,
  "reference" text NOT NULL,
  "amount" numeric(15, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'PENDING',
  "raw_payload" jsonb,
  "signature_hash" text,
  "confirmed_at" timestamp,
  "reconciled_at" timestamp,
  "reversed_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "provisions" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "opening_balance" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "additions" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "reversals" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "utilisation" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "closing_balance" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "probability" text DEFAULT 'PROBABLE',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "journal_entry_id" integer,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "revenue_contracts" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "customer_id" integer,
  "contract_number" text NOT NULL,
  "description" text,
  "total_value" numeric(15, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "recognition_method" text NOT NULL DEFAULT 'POINT_IN_TIME',
  "deferred_revenue" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "recognized_revenue" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "obligations" jsonb,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "scheduled_reports" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "name" text NOT NULL,
  "report_key" text NOT NULL,
  "cadence" text NOT NULL,
  "recipients" jsonb,
  "filters" jsonb,
  "format" text NOT NULL DEFAULT 'PDF',
  "is_active" boolean NOT NULL DEFAULT true,
  "last_run_at" timestamp,
  "next_run_at" timestamp,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "stock_transfer_items" (
  "id" serial PRIMARY KEY,
  "transfer_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "quantity" numeric(10, 2) NOT NULL,
  "quantity_received" numeric(10, 2),
  "unit_cost" numeric(10, 2) DEFAULT '0.00',
  "notes" text
);
CREATE TABLE IF NOT EXISTS "stock_transfers" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "transfer_number" text NOT NULL,
  "from_branch_id" integer,
  "to_branch_id" integer,
  "from_location_id" integer,
  "to_location_id" integer,
  "status" text NOT NULL DEFAULT 'IN_TRANSIT',
  "notes" text,
  "dispatched_by" uuid,
  "dispatched_at" timestamp DEFAULT now(),
  "received_by" uuid,
  "received_at" timestamp,
  "cancelled_by" uuid,
  "cancelled_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "tax_obligations" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "tax_type" text NOT NULL,
  "period_start" timestamp NOT NULL,
  "period_end" timestamp NOT NULL,
  "due_date" timestamp NOT NULL,
  "amount_due" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "amount_paid" numeric(15, 2) NOT NULL DEFAULT '0.00',
  "status" text NOT NULL DEFAULT 'OPEN',
  "reference" text,
  "submitted_at" timestamp,
  "paid_at" timestamp,
  "snapshot" jsonb,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "withholding_tax_certificates" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL,
  "supplier_id" integer NOT NULL,
  "supplier_invoice_id" integer,
  "rate_id" integer,
  "certificate_number" text NOT NULL,
  "taxable_amount" numeric(15, 2) NOT NULL,
  "withheld_amount" numeric(15, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'DRAFT',
  "remittance_reference" text,
  "issued_at" timestamp,
  "remitted_at" timestamp,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "withholding_tax_rates" (
  "id" serial PRIMARY KEY,
  "company_id" integer,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "rate" numeric(5, 2) NOT NULL,
  "category" text NOT NULL DEFAULT 'CONTRACT',
  "effective_from" date NOT NULL,
  "effective_to" date,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now()
);
