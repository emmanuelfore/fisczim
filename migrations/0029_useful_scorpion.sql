CREATE TABLE "accounting_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"type" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "accounting_segments_company_type_code_idx" UNIQUE("company_id","type","code")
);
--> statement-breakpoint
CREATE TABLE "cashbook_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"branch_id" integer,
	"bank_account_id" integer NOT NULL,
	"journal_entry_id" integer,
	"entry_date" timestamp DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"method" text DEFAULT 'CASH' NOT NULL,
	"reference" text,
	"counterparty_name" text,
	"description" text NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'POSTED' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cashbook_entry_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"cashbook_entry_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"cost_center_id" integer,
	"description" text,
	"amount" numeric(15, 2) NOT NULL,
	"vat_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_access_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "company_access_roles_company_name_idx" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"parent_id" integer,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "cost_centers_company_code_idx" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "inventory_location_stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"stock_level" numeric(10, 2) DEFAULT '0' NOT NULL,
	"reserved_quantity" numeric(10, 2) DEFAULT '0' NOT NULL,
	"available_quantity" numeric(10, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "inventory_location_stocks_location_product_idx" UNIQUE("location_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"type" text DEFAULT 'WAREHOUSE' NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"address" text,
	"branch_id" integer,
	"is_default_receiving" boolean DEFAULT false NOT NULL,
	"is_default_dispatch" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "inventory_locations_company_code_idx" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "inventory_valuation_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"branch_id" integer,
	"as_of_date" timestamp NOT NULL,
	"valuation_method" text NOT NULL,
	"total_quantity" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_value" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb,
	"journal_entry_id" integer,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mobile_money_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"payment_id" integer,
	"cashbook_entry_id" integer,
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
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "mobile_money_company_reference_idx" UNIQUE("company_id","network","reference")
);
--> statement-breakpoint
CREATE TABLE "provisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"opening_balance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"additions" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"reversals" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"utilisation" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"closing_balance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"probability" text DEFAULT 'PROBABLE',
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"journal_entry_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer,
	"contract_number" text NOT NULL,
	"description" text,
	"total_value" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"recognition_method" text DEFAULT 'POINT_IN_TIME' NOT NULL,
	"deferred_revenue" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"recognized_revenue" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"obligations" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "revenue_contracts_company_number_idx" UNIQUE("company_id","contract_number")
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"report_key" text NOT NULL,
	"cadence" text NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb,
	"filters" jsonb DEFAULT '{}'::jsonb,
	"format" text DEFAULT 'PDF' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"quantity_received" numeric(10, 2),
	"unit_cost" numeric(10, 2) DEFAULT '0.00',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"transfer_number" text NOT NULL,
	"from_branch_id" integer,
	"to_branch_id" integer,
	"from_location_id" integer,
	"to_location_id" integer,
	"status" text DEFAULT 'IN_TRANSIT' NOT NULL,
	"notes" text,
	"dispatched_by" uuid,
	"dispatched_at" timestamp DEFAULT now(),
	"received_by" uuid,
	"received_at" timestamp,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "stock_transfers_company_number_idx" UNIQUE("company_id","transfer_number")
);
--> statement-breakpoint
CREATE TABLE "tax_obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
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
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tax_obligations_company_tax_period_idx" UNIQUE("company_id","tax_type","period_start","period_end")
);
--> statement-breakpoint
CREATE TABLE "withholding_tax_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"supplier_invoice_id" integer,
	"rate_id" integer,
	"certificate_number" text NOT NULL,
	"taxable_amount" numeric(15, 2) NOT NULL,
	"withheld_amount" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"remittance_reference" text,
	"issued_at" timestamp,
	"remitted_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "wht_certificates_company_number_idx" UNIQUE("company_id","certificate_number")
);
--> statement-breakpoint
CREATE TABLE "withholding_tax_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"category" text DEFAULT 'CONTRACT' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "wht_rates_company_code_idx" UNIQUE("company_id","code")
);
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "tax_rate" SET DEFAULT '15.50';--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "sub_type" text DEFAULT 'Operating' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "normal_balance" text DEFAULT 'DEBIT' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "ifrs_mapping_tag" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "cash_flow_category" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_control_account" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "default_vat_type_id" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "default_cost_center_id" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "default_segment_id" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_budget_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "deactivated_at" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "superadmin_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "company_partners" ADD COLUMN "invoice_template" text;--> statement-breakpoint
ALTER TABLE "company_users" ADD COLUMN "access_role_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opening_balance" numeric(15, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "period_number" integer;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "fiscal_year" integer;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "is_adjustment_period" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "closed_by" uuid;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "locked_by" uuid;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "reopen_justification" text;--> statement-breakpoint
ALTER TABLE "goods_delivery_notes" ADD COLUMN "purchase_order_id" integer;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "location_id" integer;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "journal_type" text DEFAULT 'GENERAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "status" text DEFAULT 'POSTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "approval_status" text DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "reversal_of_journal_entry_id" integer;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "auto_reverse_on" timestamp;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "fiscal_signature" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "row_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" ADD COLUMN "cost_center_id" integer;--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" ADD COLUMN "segment_id" integer;--> statement-breakpoint
ALTER TABLE "journal_entry_drafts" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "cost_center_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "segment_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "vat_type_id" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "vat_amount" numeric(15, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "withholding_tax_amount" numeric(15, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "memo" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "journal_entry_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "account_code" text;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "quantity_received" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "ship_to" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "purchase_order_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "transaction_type" text DEFAULT 'Invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "reference_invoice_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "subtotal_amount" numeric(15, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "tax_inclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "withholding_tax_rate_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "withholding_tax_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "withholding_certificate_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "grv_reference" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "reference_gdn_id" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "withholding_tax_type" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "withholding_tax_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "opening_balance" numeric(15, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "accounting_segments" ADD CONSTRAINT "accounting_segments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_bank_account_id_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_lines" ADD CONSTRAINT "cashbook_entry_lines_cashbook_entry_id_cashbook_entries_id_fk" FOREIGN KEY ("cashbook_entry_id") REFERENCES "public"."cashbook_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_lines" ADD CONSTRAINT "cashbook_entry_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_lines" ADD CONSTRAINT "cashbook_entry_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_access_roles" ADD CONSTRAINT "company_access_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_access_roles" ADD CONSTRAINT "company_access_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location_stocks" ADD CONSTRAINT "inventory_location_stocks_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location_stocks" ADD CONSTRAINT "inventory_location_stocks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_valuation_snapshots" ADD CONSTRAINT "inventory_valuation_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_valuation_snapshots" ADD CONSTRAINT "inventory_valuation_snapshots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_valuation_snapshots" ADD CONSTRAINT "inventory_valuation_snapshots_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_valuation_snapshots" ADD CONSTRAINT "inventory_valuation_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_transactions" ADD CONSTRAINT "mobile_money_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_transactions" ADD CONSTRAINT "mobile_money_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_money_transactions" ADD CONSTRAINT "mobile_money_transactions_cashbook_entry_id_cashbook_entries_id_fk" FOREIGN KEY ("cashbook_entry_id") REFERENCES "public"."cashbook_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisions" ADD CONSTRAINT "provisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisions" ADD CONSTRAINT "provisions_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_contracts" ADD CONSTRAINT "revenue_contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_contracts" ADD CONSTRAINT "revenue_contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_location_id_inventory_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_location_id_inventory_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dispatched_by_users_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_obligations" ADD CONSTRAINT "tax_obligations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_tax_certificates" ADD CONSTRAINT "withholding_tax_certificates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_tax_certificates" ADD CONSTRAINT "withholding_tax_certificates_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_tax_certificates" ADD CONSTRAINT "withholding_tax_certificates_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_tax_certificates" ADD CONSTRAINT "withholding_tax_certificates_rate_id_withholding_tax_rates_id_fk" FOREIGN KEY ("rate_id") REFERENCES "public"."withholding_tax_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_tax_certificates" ADD CONSTRAINT "withholding_tax_certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withholding_tax_rates" ADD CONSTRAINT "withholding_tax_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_segments_company_idx" ON "accounting_segments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cashbook_entries_company_date_idx" ON "cashbook_entries" USING btree ("company_id","entry_date");--> statement-breakpoint
CREATE INDEX "cashbook_entries_bank_account_idx" ON "cashbook_entries" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "cashbook_entries_status_idx" ON "cashbook_entries" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "cashbook_entry_lines_entry_idx" ON "cashbook_entry_lines" USING btree ("cashbook_entry_id");--> statement-breakpoint
CREATE INDEX "cashbook_entry_lines_account_idx" ON "cashbook_entry_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "cashbook_entry_lines_cost_center_idx" ON "cashbook_entry_lines" USING btree ("cost_center_id");--> statement-breakpoint
CREATE INDEX "company_access_roles_company_idx" ON "company_access_roles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cost_centers_company_idx" ON "cost_centers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cost_centers_parent_idx" ON "cost_centers" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "inventory_location_stocks_location_idx" ON "inventory_location_stocks" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "inventory_location_stocks_product_idx" ON "inventory_location_stocks" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_locations_company_idx" ON "inventory_locations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "inventory_locations_branch_idx" ON "inventory_locations" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "inventory_valuation_snapshots_company_date_idx" ON "inventory_valuation_snapshots" USING btree ("company_id","as_of_date");--> statement-breakpoint
CREATE INDEX "inventory_valuation_snapshots_branch_idx" ON "inventory_valuation_snapshots" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "mobile_money_company_status_idx" ON "mobile_money_transactions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "provisions_company_idx" ON "provisions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "provisions_company_status_idx" ON "provisions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "revenue_contracts_company_idx" ON "revenue_contracts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "scheduled_reports_company_idx" ON "scheduled_reports" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "scheduled_reports_next_run_idx" ON "scheduled_reports" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "stock_transfer_items_transfer_id_idx" ON "stock_transfer_items" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "stock_transfer_items_product_id_idx" ON "stock_transfer_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_company_id_idx" ON "stock_transfers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tax_obligations_due_date_idx" ON "tax_obligations" USING btree ("company_id","due_date");--> statement-breakpoint
CREATE INDEX "wht_certificates_company_idx" ON "withholding_tax_certificates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "wht_certificates_supplier_idx" ON "withholding_tax_certificates" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "wht_rates_company_idx" ON "withholding_tax_rates" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_default_vat_type_id_tax_types_id_fk" FOREIGN KEY ("default_vat_type_id") REFERENCES "public"."tax_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_default_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("default_cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_default_segment_id_accounting_segments_id_fk" FOREIGN KEY ("default_segment_id") REFERENCES "public"."accounting_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_access_role_id_company_access_roles_id_fk" FOREIGN KEY ("access_role_id") REFERENCES "public"."company_access_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_delivery_notes" ADD CONSTRAINT "goods_delivery_notes_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" ADD CONSTRAINT "journal_entry_draft_lines_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" ADD CONSTRAINT "journal_entry_draft_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" ADD CONSTRAINT "journal_entry_draft_lines_segment_id_accounting_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."accounting_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_drafts" ADD CONSTRAINT "journal_entry_drafts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_segment_id_accounting_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."accounting_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_vat_type_id_tax_types_id_fk" FOREIGN KEY ("vat_type_id") REFERENCES "public"."tax_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_withholding_tax_rate_id_withholding_tax_rates_id_fk" FOREIGN KEY ("withholding_tax_rate_id") REFERENCES "public"."withholding_tax_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_reference_gdn_id_goods_delivery_notes_id_fk" FOREIGN KEY ("reference_gdn_id") REFERENCES "public"."goods_delivery_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_parent_idx" ON "accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "accounts_default_cost_center_idx" ON "accounts" USING btree ("default_cost_center_id");--> statement-breakpoint
CREATE INDEX "company_users_access_role_idx" ON "company_users" USING btree ("access_role_id");--> statement-breakpoint
CREATE INDEX "company_users_company_role_idx" ON "company_users" USING btree ("company_role_id");--> statement-breakpoint
CREATE INDEX "journal_entries_branch_idx" ON "journal_entries" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "journal_entries_company_status_idx" ON "journal_entries" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "journal_entries_company_branch_idx" ON "journal_entries" USING btree ("company_id","branch_id");--> statement-breakpoint
CREATE INDEX "journal_entry_draft_lines_branch_idx" ON "journal_entry_draft_lines" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "journal_entry_draft_lines_cost_center_idx" ON "journal_entry_draft_lines" USING btree ("cost_center_id");--> statement-breakpoint
CREATE INDEX "journal_entry_draft_lines_segment_idx" ON "journal_entry_draft_lines" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "journal_entry_drafts_company_branch_idx" ON "journal_entry_drafts" USING btree ("company_id","branch_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_branch_idx" ON "ledger_entries" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_cost_center_idx" ON "ledger_entries" USING btree ("cost_center_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_segment_idx" ON "ledger_entries" USING btree ("segment_id");