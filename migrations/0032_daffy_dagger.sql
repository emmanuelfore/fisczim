CREATE TABLE "statutory_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"aids_levy_rate" numeric(5, 4) DEFAULT '0.0300' NOT NULL,
	"zimdef_rate" numeric(5, 4) DEFAULT '0.0100' NOT NULL,
	"standards_levy_rate" numeric(5, 4) DEFAULT '0.0050' NOT NULL,
	"tax_free_bonus_threshold" numeric(15, 2) DEFAULT '400.00' NOT NULL,
	"nssa_rate_employee" numeric(5, 4) DEFAULT '0.0450' NOT NULL,
	"nssa_rate_employer" numeric(5, 4) DEFAULT '0.0450' NOT NULL,
	"nssa_ceiling_limit" numeric(15, 2) DEFAULT '700.00' NOT NULL,
	"medical_aid_credit_monthly" numeric(15, 2) DEFAULT '75.00' NOT NULL,
	"blind_person_credit_annual" numeric(15, 2) DEFAULT '900.00' NOT NULL,
	"elderly_person_credit_annual" numeric(15, 2) DEFAULT '900.00' NOT NULL,
	"hours_per_day" integer DEFAULT 8 NOT NULL,
	"working_days_per_month" integer DEFAULT 22 NOT NULL,
	"overtime_multiplier_standard" numeric(5, 2) DEFAULT '1.50' NOT NULL,
	"overtime_multiplier_sunday" numeric(5, 2) DEFAULT '2.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_brackets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_table_id" integer NOT NULL,
	"min_amount" numeric(15, 2) NOT NULL,
	"max_amount" numeric(15, 2),
	"rate" numeric(5, 4) NOT NULL,
	"deduction_constant" numeric(15, 2) DEFAULT '0.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"tax_year" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "segment_id" integer;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "segment_id" integer;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "base_currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" ADD COLUMN "base_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "base_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_earning_types" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "segment_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "goods_delivery_note_id" integer;--> statement-breakpoint
ALTER TABLE "statutory_settings" ADD CONSTRAINT "statutory_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_brackets" ADD CONSTRAINT "tax_brackets_tax_table_id_tax_tables_id_fk" FOREIGN KEY ("tax_table_id") REFERENCES "public"."tax_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_tables" ADD CONSTRAINT "tax_tables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_segment_id_accounting_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."accounting_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_segment_id_accounting_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."accounting_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_segment_id_accounting_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."accounting_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_goods_delivery_note_id_goods_delivery_notes_id_fk" FOREIGN KEY ("goods_delivery_note_id") REFERENCES "public"."goods_delivery_notes"("id") ON DELETE no action ON UPDATE no action;