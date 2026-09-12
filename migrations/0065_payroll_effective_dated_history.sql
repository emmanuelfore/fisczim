-- 0065: Effective-dated employee history tables
-- Payroll-relevant history is stored as immutable, effective-dated records.
-- New versions close the previous record's effective_to and open a new one;
-- records referenced by finalized payroll are never overwritten in place.

-- Pre-existing schema drift fix: employee_salary_changes is referenced by the
-- salary-change workflow and by employee_salary_history.salary_change_id, but is
-- missing from this database. Create it if absent.
CREATE TABLE IF NOT EXISTS "employee_salary_changes" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "employee_id" integer NOT NULL,
  "previous_base_salary" numeric(15, 2) NOT NULL,
  "new_base_salary" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
  "reason" text NOT NULL,
  "effective_date" date NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "requested_by" uuid,
  "approved_by" uuid,
  "approved_at" timestamp,
  "rejection_reason" text,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_salary_changes" ADD CONSTRAINT "employee_salary_changes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_salary_changes" ADD CONSTRAINT "employee_salary_changes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_salary_changes" ADD CONSTRAINT "employee_salary_changes_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_salary_changes" ADD CONSTRAINT "employee_salary_changes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "salary_changes_company_idx" ON "employee_salary_changes" ("company_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "salary_changes_employee_idx" ON "employee_salary_changes" ("employee_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_salary_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "employee_id" integer NOT NULL,
  "salary_change_id" integer,
  "salary_amount" numeric(15, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
  "usd_percentage" numeric(5, 2) DEFAULT '100.00' NOT NULL,
  "zig_percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "reason" text,
  "approved_by" uuid,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_salary_history" ADD CONSTRAINT "employee_salary_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_salary_history" ADD CONSTRAINT "employee_salary_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_salary_history" ADD CONSTRAINT "employee_salary_history_salary_change_id_employee_salary_changes_id_fk" FOREIGN KEY ("salary_change_id") REFERENCES "employee_salary_changes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_salary_history" ADD CONSTRAINT "employee_salary_history_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_salary_history_company_idx" ON "employee_salary_history" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_salary_history_employee_period_idx" ON "employee_salary_history" ("employee_id", "effective_from");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_employment_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "employee_id" integer NOT NULL,
  "event_type" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "department_id" integer,
  "position_id" integer,
  "branch_id" integer,
  "employment_type" text,
  "contract_type" text,
  "reason" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_employment_history_company_idx" ON "employee_employment_history" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_employment_history_employee_period_idx" ON "employee_employment_history" ("employee_id", "effective_from");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_income_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "employee_id" integer NOT NULL,
  "recurring_item_id" integer,
  "income_type_id" integer,
  "name" text NOT NULL,
  "amount" numeric(15, 2) NOT NULL,
  "calculation_type" text DEFAULT 'FIXED' NOT NULL,
  "is_taxable" boolean DEFAULT true NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "reason" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_income_history" ADD CONSTRAINT "employee_income_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_income_history" ADD CONSTRAINT "employee_income_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_income_history" ADD CONSTRAINT "employee_income_history_recurring_item_id_payroll_recurring_items_id_fk" FOREIGN KEY ("recurring_item_id") REFERENCES "payroll_recurring_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_income_history" ADD CONSTRAINT "employee_income_history_income_type_id_payroll_earning_types_id_fk" FOREIGN KEY ("income_type_id") REFERENCES "payroll_earning_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_income_history" ADD CONSTRAINT "employee_income_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_income_history_company_idx" ON "employee_income_history" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_income_history_employee_period_idx" ON "employee_income_history" ("employee_id", "effective_from");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_deduction_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "employee_id" integer NOT NULL,
  "recurring_item_id" integer,
  "deduction_type_id" integer,
  "name" text NOT NULL,
  "amount" numeric(15, 2) NOT NULL,
  "calculation_type" text DEFAULT 'FIXED' NOT NULL,
  "is_tax_deductible" boolean DEFAULT false NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "reason" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_deduction_history" ADD CONSTRAINT "employee_deduction_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_deduction_history" ADD CONSTRAINT "employee_deduction_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_deduction_history" ADD CONSTRAINT "employee_deduction_history_recurring_item_id_payroll_recurring_items_id_fk" FOREIGN KEY ("recurring_item_id") REFERENCES "payroll_recurring_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_deduction_history" ADD CONSTRAINT "employee_deduction_history_deduction_type_id_payroll_deduction_types_id_fk" FOREIGN KEY ("deduction_type_id") REFERENCES "payroll_deduction_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "employee_deduction_history" ADD CONSTRAINT "employee_deduction_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_deduction_history_company_idx" ON "employee_deduction_history" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_deduction_history_employee_period_idx" ON "employee_deduction_history" ("employee_id", "effective_from");
