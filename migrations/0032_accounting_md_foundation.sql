-- Broad accounting.md foundation: dimensions, workflow states, WHT, cashbook,
-- inventory valuation snapshots, compliance obligations, and scheduled reports.

CREATE TABLE IF NOT EXISTS "cost_centers" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "parent_id" integer,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "cost_centers_company_code_idx" ON "cost_centers" ("company_id", "code");
CREATE INDEX IF NOT EXISTS "cost_centers_company_idx" ON "cost_centers" ("company_id");
CREATE INDEX IF NOT EXISTS "cost_centers_parent_idx" ON "cost_centers" ("parent_id");

CREATE TABLE IF NOT EXISTS "accounting_segments" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "type" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_segments_company_type_code_idx" ON "accounting_segments" ("company_id", "type", "code");
CREATE INDEX IF NOT EXISTS "accounting_segments_company_idx" ON "accounting_segments" ("company_id");

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "parent_id" integer;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "normal_balance" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "cash_flow_category" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "is_control_account" boolean DEFAULT false NOT NULL;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "default_vat_type_id" integer REFERENCES "tax_types"("id");
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "default_cost_center_id" integer REFERENCES "cost_centers"("id");
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "default_segment_id" integer REFERENCES "accounting_segments"("id");
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "is_budget_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp;
CREATE INDEX IF NOT EXISTS "accounts_parent_idx" ON "accounts" ("parent_id");
CREATE INDEX IF NOT EXISTS "accounts_default_cost_center_idx" ON "accounts" ("default_cost_center_id");

ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "journal_type" text DEFAULT 'GENERAL' NOT NULL;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'POSTED' NOT NULL;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT 'APPROVED' NOT NULL;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id");
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "reversal_of_journal_entry_id" integer;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "auto_reverse_on" timestamp;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "fiscal_signature" text;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "row_version" integer DEFAULT 1 NOT NULL;
CREATE INDEX IF NOT EXISTS "journal_entries_company_status_idx" ON "journal_entries" ("company_id", "status");

ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "cost_center_id" integer REFERENCES "cost_centers"("id");
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "segment_id" integer REFERENCES "accounting_segments"("id");
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "vat_type_id" integer REFERENCES "tax_types"("id");
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "vat_amount" numeric(15, 2) DEFAULT '0.00';
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "withholding_tax_amount" numeric(15, 2) DEFAULT '0.00';
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "memo" text;
CREATE INDEX IF NOT EXISTS "ledger_entries_cost_center_idx" ON "ledger_entries" ("cost_center_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_segment_idx" ON "ledger_entries" ("segment_id");

ALTER TABLE "journal_entry_draft_lines" ADD COLUMN IF NOT EXISTS "cost_center_id" integer REFERENCES "cost_centers"("id");
ALTER TABLE "journal_entry_draft_lines" ADD COLUMN IF NOT EXISTS "segment_id" integer REFERENCES "accounting_segments"("id");
CREATE INDEX IF NOT EXISTS "journal_entry_draft_lines_cost_center_idx" ON "journal_entry_draft_lines" ("cost_center_id");
CREATE INDEX IF NOT EXISTS "journal_entry_draft_lines_segment_idx" ON "journal_entry_draft_lines" ("segment_id");

ALTER TABLE "financial_periods" ADD COLUMN IF NOT EXISTS "period_number" integer;
ALTER TABLE "financial_periods" ADD COLUMN IF NOT EXISTS "fiscal_year" integer;
ALTER TABLE "financial_periods" ADD COLUMN IF NOT EXISTS "is_adjustment_period" boolean DEFAULT false NOT NULL;
ALTER TABLE "financial_periods" ADD COLUMN IF NOT EXISTS "closed_by" uuid REFERENCES "users"("id");
ALTER TABLE "financial_periods" ADD COLUMN IF NOT EXISTS "closed_at" timestamp;
ALTER TABLE "financial_periods" ADD COLUMN IF NOT EXISTS "locked_by" uuid REFERENCES "users"("id");
ALTER TABLE "financial_periods" ADD COLUMN IF NOT EXISTS "locked_at" timestamp;
ALTER TABLE "financial_periods" ADD COLUMN IF NOT EXISTS "reopen_justification" text;

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "withholding_tax_type" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "withholding_tax_rate" numeric(5, 2);

CREATE TABLE IF NOT EXISTS "withholding_tax_rates" (
  "id" serial PRIMARY KEY,
  "company_id" integer REFERENCES "companies"("id"),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "rate" numeric(5, 2) NOT NULL,
  "category" text DEFAULT 'CONTRACT' NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "wht_rates_company_code_idx" ON "withholding_tax_rates" ("company_id", "code");
CREATE INDEX IF NOT EXISTS "wht_rates_company_idx" ON "withholding_tax_rates" ("company_id");

ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "withholding_tax_rate_id" integer REFERENCES "withholding_tax_rates"("id");
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "withholding_tax_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL;
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "withholding_certificate_id" integer;

CREATE TABLE IF NOT EXISTS "withholding_tax_certificates" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "supplier_id" integer NOT NULL REFERENCES "suppliers"("id"),
  "supplier_invoice_id" integer REFERENCES "supplier_invoices"("id"),
  "rate_id" integer REFERENCES "withholding_tax_rates"("id"),
  "certificate_number" text NOT NULL,
  "taxable_amount" numeric(15, 2) NOT NULL,
  "withheld_amount" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "remittance_reference" text,
  "issued_at" timestamp,
  "remitted_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "wht_certificates_company_number_idx" ON "withholding_tax_certificates" ("company_id", "certificate_number");
CREATE INDEX IF NOT EXISTS "wht_certificates_company_idx" ON "withholding_tax_certificates" ("company_id");
CREATE INDEX IF NOT EXISTS "wht_certificates_supplier_idx" ON "withholding_tax_certificates" ("supplier_id");

CREATE TABLE IF NOT EXISTS "cashbook_entries" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "branch_id" integer REFERENCES "branches"("id"),
  "bank_account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "journal_entry_id" integer REFERENCES "journal_entries"("id"),
  "entry_date" timestamp DEFAULT now() NOT NULL,
  "type" text NOT NULL,
  "method" text DEFAULT 'CASH' NOT NULL,
  "reference" text,
  "counterparty_name" text,
  "description" text NOT NULL,
  "total_amount" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" text DEFAULT 'POSTED' NOT NULL,
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cashbook_entries_company_date_idx" ON "cashbook_entries" ("company_id", "entry_date");
CREATE INDEX IF NOT EXISTS "cashbook_entries_bank_account_idx" ON "cashbook_entries" ("bank_account_id");
CREATE INDEX IF NOT EXISTS "cashbook_entries_status_idx" ON "cashbook_entries" ("company_id", "status");

CREATE TABLE IF NOT EXISTS "cashbook_entry_lines" (
  "id" serial PRIMARY KEY,
  "cashbook_entry_id" integer NOT NULL REFERENCES "cashbook_entries"("id"),
  "account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "cost_center_id" integer REFERENCES "cost_centers"("id"),
  "description" text,
  "amount" numeric(15, 2) NOT NULL,
  "vat_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL
);

CREATE INDEX IF NOT EXISTS "cashbook_entry_lines_entry_idx" ON "cashbook_entry_lines" ("cashbook_entry_id");
CREATE INDEX IF NOT EXISTS "cashbook_entry_lines_account_idx" ON "cashbook_entry_lines" ("account_id");
CREATE INDEX IF NOT EXISTS "cashbook_entry_lines_cost_center_idx" ON "cashbook_entry_lines" ("cost_center_id");

CREATE TABLE IF NOT EXISTS "inventory_valuation_snapshots" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "branch_id" integer REFERENCES "branches"("id"),
  "as_of_date" timestamp NOT NULL,
  "valuation_method" text NOT NULL,
  "total_quantity" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "total_value" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "lines" jsonb DEFAULT '[]'::jsonb,
  "journal_entry_id" integer REFERENCES "journal_entries"("id"),
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inventory_valuation_snapshots_company_date_idx" ON "inventory_valuation_snapshots" ("company_id", "as_of_date");
CREATE INDEX IF NOT EXISTS "inventory_valuation_snapshots_branch_idx" ON "inventory_valuation_snapshots" ("branch_id");

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "threshold_amount" numeric(15, 2),
  "requested_by" uuid REFERENCES "users"("id"),
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp,
  "rejected_by" uuid REFERENCES "users"("id"),
  "rejected_at" timestamp,
  "reason" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "approval_requests_company_entity_idx" ON "approval_requests" ("company_id", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "approval_requests_company_status_idx" ON "approval_requests" ("company_id", "status");

CREATE TABLE IF NOT EXISTS "tax_obligations" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "tax_type" text NOT NULL,
  "period_start" timestamp NOT NULL,
  "period_end" timestamp NOT NULL,
  "due_date" timestamp NOT NULL,
  "amount_due" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "amount_paid" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "reference" text,
  "submitted_at" timestamp,
  "paid_at" timestamp,
  "snapshot" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tax_obligations_company_tax_period_idx" ON "tax_obligations" ("company_id", "tax_type", "period_start", "period_end");
CREATE INDEX IF NOT EXISTS "tax_obligations_due_date_idx" ON "tax_obligations" ("company_id", "due_date");

CREATE TABLE IF NOT EXISTS "mobile_money_transactions" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "payment_id" integer REFERENCES "payments"("id"),
  "cashbook_entry_id" integer REFERENCES "cashbook_entries"("id"),
  "network" text NOT NULL,
  "reference" text NOT NULL,
  "amount" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "raw_payload" jsonb,
  "signature_hash" text,
  "confirmed_at" timestamp,
  "reconciled_at" timestamp,
  "reversed_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "mobile_money_company_reference_idx" ON "mobile_money_transactions" ("company_id", "network", "reference");
CREATE INDEX IF NOT EXISTS "mobile_money_company_status_idx" ON "mobile_money_transactions" ("company_id", "status");

CREATE TABLE IF NOT EXISTS "scheduled_reports" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "report_key" text NOT NULL,
  "cadence" text NOT NULL,
  "recipients" jsonb DEFAULT '[]'::jsonb,
  "filters" jsonb DEFAULT '{}'::jsonb,
  "format" text DEFAULT 'PDF' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamp,
  "next_run_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "scheduled_reports_company_idx" ON "scheduled_reports" ("company_id");
CREATE INDEX IF NOT EXISTS "scheduled_reports_next_run_idx" ON "scheduled_reports" ("next_run_at");

CREATE TABLE IF NOT EXISTS "provisions" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "type" text NOT NULL,
  "description" text NOT NULL,
  "opening_balance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "additions" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "reversals" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "utilisation" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "closing_balance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "probability" text DEFAULT 'PROBABLE',
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "journal_entry_id" integer REFERENCES "journal_entries"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "provisions_company_idx" ON "provisions" ("company_id");
CREATE INDEX IF NOT EXISTS "provisions_company_status_idx" ON "provisions" ("company_id", "status");

CREATE TABLE IF NOT EXISTS "revenue_contracts" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "customer_id" integer REFERENCES "customers"("id"),
  "contract_number" text NOT NULL,
  "description" text,
  "total_value" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "recognition_method" text DEFAULT 'POINT_IN_TIME' NOT NULL,
  "deferred_revenue" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "recognized_revenue" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "obligations" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "revenue_contracts_company_number_idx" ON "revenue_contracts" ("company_id", "contract_number");
CREATE INDEX IF NOT EXISTS "revenue_contracts_company_idx" ON "revenue_contracts" ("company_id");
