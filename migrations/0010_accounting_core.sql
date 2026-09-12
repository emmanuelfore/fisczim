CREATE TABLE IF NOT EXISTS "accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "category" text,
  "description" text,
  "is_system" boolean DEFAULT false,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "accounts_company_code_idx" UNIQUE ("company_id", "code")
);

CREATE INDEX IF NOT EXISTS "accounts_company_id_idx" ON "accounts" ("company_id");

CREATE TABLE IF NOT EXISTS "journal_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "entry_date" timestamp DEFAULT now() NOT NULL,
  "description" text NOT NULL,
  "reference_type" text,
  "reference_id" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "journal_entries_company_id_idx" ON "journal_entries" ("company_id");
CREATE INDEX IF NOT EXISTS "journal_entries_reference_idx" ON "journal_entries" ("reference_type", "reference_id");

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "journal_entry_id" integer NOT NULL REFERENCES "journal_entries"("id"),
  "account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "type" text NOT NULL,
  "amount" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD',
  "exchange_rate" numeric(10, 6) DEFAULT '1.000000',
  "is_reconciled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ledger_entries_journal_idx" ON "ledger_entries" ("journal_entry_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_account_idx" ON "ledger_entries" ("account_id");

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "debit_account_id" integer REFERENCES "accounts"("id");
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "credit_account_id" integer REFERENCES "accounts"("id");

CREATE TABLE IF NOT EXISTS "supplier_invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "supplier_id" integer NOT NULL REFERENCES "suppliers"("id"),
  "invoice_number" text NOT NULL,
  "date" timestamp DEFAULT now() NOT NULL,
  "due_date" timestamp,
  "total_amount" numeric(15, 2) NOT NULL,
  "tax_amount" numeric(15, 2) DEFAULT '0.00',
  "currency" text DEFAULT 'USD',
  "exchange_rate" numeric(10, 6) DEFAULT '1.000000',
  "status" text DEFAULT 'unpaid' NOT NULL,
  "paid_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "notes" text,
  "debit_account_id" integer REFERENCES "accounts"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "supplier_invoices_company_idx" ON "supplier_invoices" ("company_id");
CREATE INDEX IF NOT EXISTS "supplier_invoices_supplier_idx" ON "supplier_invoices" ("supplier_id");

CREATE TABLE IF NOT EXISTS "supplier_invoice_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_invoice_id" integer NOT NULL REFERENCES "supplier_invoices"("id"),
  "product_id" integer REFERENCES "products"("id"),
  "description" text NOT NULL,
  "quantity" numeric(15, 4) NOT NULL,
  "unit_price" numeric(15, 2) NOT NULL,
  "total_price" numeric(15, 2) NOT NULL,
  "tax_amount" numeric(15, 2) DEFAULT '0.00'
);

CREATE TABLE IF NOT EXISTS "supplier_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "supplier_id" integer NOT NULL REFERENCES "suppliers"("id"),
  "supplier_invoice_id" integer REFERENCES "supplier_invoices"("id"),
  "amount" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD',
  "payment_date" timestamp DEFAULT now() NOT NULL,
  "method" text NOT NULL,
  "reference" text,
  "notes" text,
  "created_by" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "supplier_payments_company_idx" ON "supplier_payments" ("company_id");
CREATE INDEX IF NOT EXISTS "supplier_payments_supplier_idx" ON "supplier_payments" ("supplier_id");

CREATE TABLE IF NOT EXISTS "financial_periods" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "bank_statements" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "statement_date" timestamp NOT NULL,
  "closing_balance" numeric(12, 2) NOT NULL,
  "uploaded_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "bank_statement_lines" (
  "id" serial PRIMARY KEY NOT NULL,
  "statement_id" integer NOT NULL REFERENCES "bank_statements"("id"),
  "date" timestamp NOT NULL,
  "description" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "is_reconciled" boolean DEFAULT false NOT NULL,
  "matched_ledger_entry_id" integer REFERENCES "ledger_entries"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fixed_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "branch_id" integer REFERENCES "branches"("id"),
  "name" text NOT NULL,
  "description" text,
  "serial_number" text,
  "purchase_date" timestamp NOT NULL,
  "purchase_price" numeric(12, 2) NOT NULL,
  "salvage_value" numeric(12, 2) DEFAULT '0' NOT NULL,
  "useful_life_years" integer NOT NULL,
  "depreciation_method" text DEFAULT 'STRAIGHT_LINE' NOT NULL,
  "accumulated_depreciation" numeric(12, 2) DEFAULT '0' NOT NULL,
  "net_book_value" numeric(12, 2) NOT NULL,
  "asset_account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "depreciation_expense_account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "accumulated_depreciation_account_id" integer NOT NULL REFERENCES "accounts"("id"),
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "last_depreciation_date" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "depreciation_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "asset_id" integer NOT NULL REFERENCES "fixed_assets"("id"),
  "journal_entry_id" integer REFERENCES "journal_entries"("id"),
  "date" timestamp NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
