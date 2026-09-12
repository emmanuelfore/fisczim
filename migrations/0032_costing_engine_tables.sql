CREATE TABLE "assigned_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"employee_id" integer,
	"asset_name" text NOT NULL,
	"serial_number" text,
	"value" numeric(15, 2),
	"assigned_date" date,
	"returned_date" date,
	"condition" text DEFAULT 'GOOD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"gl_account_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "disciplinary_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"incident_date" date NOT NULL,
	"offense_type" text NOT NULL,
	"description" text NOT NULL,
	"action_taken" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"contract_type" text DEFAULT 'PERMANENT' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"base_salary" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"usd_percentage" numeric(5, 2) DEFAULT '100.00' NOT NULL,
	"zig_percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"pay_grade_id" integer,
	"nec_sector_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text,
	"file_hash" text,
	"uploaded_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"principal_amount" numeric(15, 2) NOT NULL,
	"interest_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"repayment_term_months" integer NOT NULL,
	"monthly_repayment_amount" numeric(15, 2) NOT NULL,
	"remaining_balance" numeric(15, 2) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"disbursed_date" date,
	"approved_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_payroll_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"salary_structure_id" integer,
	"pay_grade_id" integer,
	"pay_grade_step_id" integer,
	"pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_nssa_exempt" boolean DEFAULT false NOT NULL,
	"is_paye_exempt" boolean DEFAULT false NOT NULL,
	"tax_credit_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"department_id" integer,
	"position_id" integer,
	"employee_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"national_id" text NOT NULL,
	"nssa_number" text,
	"zimra_tax_number" text,
	"bank_name" text,
	"bank_branch" text,
	"bank_account_number" text,
	"ecocash_number" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"joining_date" date NOT NULL,
	"termination_date" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employees_company_emp_no_unique" UNIQUE("company_id","employee_number")
);
--> statement-breakpoint
CREATE TABLE "inventory_cost_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_transaction_id" integer NOT NULL,
	"type" text NOT NULL,
	"unit_cost" numeric(15, 4) NOT NULL,
	"total_cost" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"exchange_rate" numeric(15, 6) DEFAULT '1',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "landed_cost_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"landed_cost_document_id" integer NOT NULL,
	"inventory_transaction_id" integer NOT NULL,
	"allocated_amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "landed_cost_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"supplier_id" integer,
	"reference" text NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(15, 6) DEFAULT '1',
	"status" text DEFAULT 'PENDING' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type" text DEFAULT 'ANNUAL' NOT NULL,
	"accrued_days" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"used_days" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"pending_days" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"available_days" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"last_accrued_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type" text DEFAULT 'ANNUAL' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_days" integer NOT NULL,
	"reason" text,
	"attachment_url" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"encashment_days" integer DEFAULT 0 NOT NULL,
	"encashment_amount" numeric(15, 2),
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loan_installments" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"payroll_run_employee_id" integer,
	"amount_paid" numeric(15, 2) NOT NULL,
	"principal_paid" numeric(15, 2) NOT NULL,
	"interest_paid" numeric(15, 2) NOT NULL,
	"remaining_balance_after" numeric(15, 2) NOT NULL,
	"repayment_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nec_sectors_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"employee_rate" numeric(5, 4) DEFAULT '0.0000' NOT NULL,
	"employer_rate" numeric(5, 4) DEFAULT '0.0000' NOT NULL,
	"fixed_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_batch_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"payroll_run_employee_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "payment_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"payment_method" text DEFAULT 'BANK_TRANSFER' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"exported_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_allowances" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_run_employee_id" integer NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"is_cash" boolean DEFAULT true NOT NULL,
	"allowance_type" text DEFAULT 'OTHER' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_attendance_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"branch_id" integer,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"provider" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'IMPORTED' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"summary_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imported_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_deduction_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"country_code" text DEFAULT 'ZW' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'COMPANY' NOT NULL,
	"timing" text DEFAULT 'POST_TAX' NOT NULL,
	"contribution_side" text DEFAULT 'EMPLOYEE' NOT NULL,
	"calculation_method" text DEFAULT 'FIXED' NOT NULL,
	"formula" text,
	"employee_rate" numeric(8, 6) DEFAULT '0.000000' NOT NULL,
	"employer_rate" numeric(8, 6) DEFAULT '0.000000' NOT NULL,
	"max_amount" numeric(15, 2),
	"priority_order" integer DEFAULT 100 NOT NULL,
	"gl_account_id" integer,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_deductions" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_run_employee_id" integer NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"is_tax_deductible" boolean DEFAULT false NOT NULL,
	"deduction_type" text DEFAULT 'OTHER' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_earning_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"country_code" text DEFAULT 'ZW' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'ALLOWANCE' NOT NULL,
	"tax_treatment" text DEFAULT 'TAXABLE' NOT NULL,
	"taxable_percentage" numeric(5, 2) DEFAULT '100.00' NOT NULL,
	"is_pensionable" boolean DEFAULT false NOT NULL,
	"is_nssa_applicable" boolean DEFAULT false NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"calculation_method" text DEFAULT 'FIXED' NOT NULL,
	"formula" text,
	"gl_account_id" integer,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"import_type" text NOT NULL,
	"source_file_name" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"validation_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payroll_import_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_integration_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"integration_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"direction" text DEFAULT 'OUTBOUND' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_pay_grade_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"pay_grade_id" integer NOT NULL,
	"step_code" text NOT NULL,
	"step_name" text NOT NULL,
	"salary_amount" numeric(15, 2) NOT NULL,
	"progression_months" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_pay_grades" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"salary_structure_id" integer,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"min_salary" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"midpoint_salary" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"max_salary" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"nec_sector_id" integer,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payroll_pay_grades_company_code_unique" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "payroll_recurring_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"is_tax_deductible" boolean DEFAULT false NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_report_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"format" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text,
	"file_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_report_validation_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer,
	"company_id" integer NOT NULL,
	"report_type" text NOT NULL,
	"severity" text DEFAULT 'ERROR' NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_run_employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_run_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"basic_salary" numeric(15, 2) NOT NULL,
	"gross_salary" numeric(15, 2) NOT NULL,
	"net_salary" numeric(15, 2) NOT NULL,
	"paye" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"aids_levy" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"nssa_employee" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"nssa_employer" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"nec_employee" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"nec_employer" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"pension_employee" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"pension_employer" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"usd_percentage" numeric(5, 2) DEFAULT '100.00' NOT NULL,
	"zig_percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"net_salary_usd" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"net_salary_zig" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"paye_usd" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"paye_zig" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"nssa_employee_usd" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"nssa_employee_zig" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_allowances" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_deductions" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp,
	"payment_reference" text,
	"snapshot_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"branch_id" integer,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(15, 6) DEFAULT '1.000000' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reversal_of_run_id" integer,
	"total_basic" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_gross" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_deductions" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"total_net" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"locked_by" uuid,
	"locked_at" timestamp,
	"journal_entry_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_salary_structures" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"default_earning_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_deduction_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "payroll_salary_structures_company_code_unique" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "payroll_statutory_deadlines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"country_code" text DEFAULT 'ZW' NOT NULL,
	"authority" text NOT NULL,
	"report_type" text NOT NULL,
	"name" text NOT NULL,
	"due_day" integer,
	"due_month" integer,
	"frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"reminder_days_before" integer DEFAULT 7 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_statutory_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"report_type" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"tax_year" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payroll_run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tax_tables_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"statutory_rates_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"report_data" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"status" text DEFAULT 'GENERATED' NOT NULL,
	"approval_status" text DEFAULT 'PENDING' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"submission_status" text DEFAULT 'NOT_SUBMITTED' NOT NULL,
	"submission_reference" text,
	"amendment_of_report_id" integer,
	"generated_by" uuid,
	"generated_at" timestamp DEFAULT now(),
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payroll_statutory_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"country_code" text DEFAULT 'ZW' NOT NULL,
	"rule_code" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"employee_rate" numeric(8, 6) DEFAULT '0.000000' NOT NULL,
	"employer_rate" numeric(8, 6) DEFAULT '0.000000' NOT NULL,
	"ceiling_amount" numeric(15, 2),
	"floor_amount" numeric(15, 2),
	"calculation_basis" text DEFAULT 'TAXABLE_INCOME' NOT NULL,
	"formula" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_tax_brackets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_table_id" integer NOT NULL,
	"bracket_order" integer NOT NULL,
	"min_income" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"max_income" numeric(15, 2),
	"rate" numeric(8, 6) DEFAULT '0.000000' NOT NULL,
	"deduction" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"base_tax" numeric(15, 2) DEFAULT '0.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_tax_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"country_code" text DEFAULT 'ZW' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"tax_year" integer NOT NULL,
	"pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"version" integer DEFAULT 1 NOT NULL,
	"source_reference" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payslip_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"payroll_run_id" integer NOT NULL,
	"payroll_run_employee_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"document_url" text,
	"document_hash" text,
	"delivery_channel" text DEFAULT 'DOWNLOAD' NOT NULL,
	"delivery_status" text DEFAULT 'GENERATED' NOT NULL,
	"password_protected" boolean DEFAULT false NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"title" text NOT NULL,
	"grade" text,
	"nec_category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tax_tables_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"brackets" jsonb NOT NULL,
	"nssa_rate_employee" numeric(5, 4) DEFAULT '0.0450' NOT NULL,
	"nssa_rate_employer" numeric(5, 4) DEFAULT '0.0450' NOT NULL,
	"nssa_ceiling_limit" numeric(15, 2) NOT NULL,
	"aids_levy_rate" numeric(5, 4) DEFAULT '0.0300' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_integration_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"integration_type" text NOT NULL,
	"credential_data" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "company_integration_unique" UNIQUE("company_id","integration_type")
);
--> statement-breakpoint
ALTER TABLE "assigned_assets" ADD CONSTRAINT "assigned_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_assets" ADD CONSTRAINT "assigned_assets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_gl_account_id_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_records" ADD CONSTRAINT "disciplinary_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinary_records" ADD CONSTRAINT "disciplinary_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_pay_grade_id_payroll_pay_grades_id_fk" FOREIGN KEY ("pay_grade_id") REFERENCES "public"."payroll_pay_grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_nec_sector_id_nec_sectors_config_id_fk" FOREIGN KEY ("nec_sector_id") REFERENCES "public"."nec_sectors_config"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_profiles" ADD CONSTRAINT "employee_payroll_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_profiles" ADD CONSTRAINT "employee_payroll_profiles_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_profiles" ADD CONSTRAINT "employee_payroll_profiles_salary_structure_id_payroll_salary_structures_id_fk" FOREIGN KEY ("salary_structure_id") REFERENCES "public"."payroll_salary_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_profiles" ADD CONSTRAINT "employee_payroll_profiles_pay_grade_id_payroll_pay_grades_id_fk" FOREIGN KEY ("pay_grade_id") REFERENCES "public"."payroll_pay_grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_profiles" ADD CONSTRAINT "employee_payroll_profiles_pay_grade_step_id_payroll_pay_grade_steps_id_fk" FOREIGN KEY ("pay_grade_step_id") REFERENCES "public"."payroll_pay_grade_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cost_components" ADD CONSTRAINT "inventory_cost_components_inventory_transaction_id_inventory_transactions_id_fk" FOREIGN KEY ("inventory_transaction_id") REFERENCES "public"."inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_allocations" ADD CONSTRAINT "landed_cost_allocations_landed_cost_document_id_landed_cost_documents_id_fk" FOREIGN KEY ("landed_cost_document_id") REFERENCES "public"."landed_cost_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_allocations" ADD CONSTRAINT "landed_cost_allocations_inventory_transaction_id_inventory_transactions_id_fk" FOREIGN KEY ("inventory_transaction_id") REFERENCES "public"."inventory_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_documents" ADD CONSTRAINT "landed_cost_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_cost_documents" ADD CONSTRAINT "landed_cost_documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_loan_id_employee_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."employee_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_payroll_run_employee_id_payroll_run_employees_id_fk" FOREIGN KEY ("payroll_run_employee_id") REFERENCES "public"."payroll_run_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nec_sectors_config" ADD CONSTRAINT "nec_sectors_config_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batch_details" ADD CONSTRAINT "payment_batch_details_batch_id_payment_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payment_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batch_details" ADD CONSTRAINT "payment_batch_details_payroll_run_employee_id_payroll_run_employees_id_fk" FOREIGN KEY ("payroll_run_employee_id") REFERENCES "public"."payroll_run_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_batches" ADD CONSTRAINT "payment_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_allowances" ADD CONSTRAINT "payroll_allowances_payroll_run_employee_id_payroll_run_employees_id_fk" FOREIGN KEY ("payroll_run_employee_id") REFERENCES "public"."payroll_run_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_attendance_imports" ADD CONSTRAINT "payroll_attendance_imports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_attendance_imports" ADD CONSTRAINT "payroll_attendance_imports_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_attendance_imports" ADD CONSTRAINT "payroll_attendance_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deduction_types" ADD CONSTRAINT "payroll_deduction_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deduction_types" ADD CONSTRAINT "payroll_deduction_types_gl_account_id_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_payroll_run_employee_id_payroll_run_employees_id_fk" FOREIGN KEY ("payroll_run_employee_id") REFERENCES "public"."payroll_run_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_earning_types" ADD CONSTRAINT "payroll_earning_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_earning_types" ADD CONSTRAINT "payroll_earning_types_gl_account_id_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_import_batches" ADD CONSTRAINT "payroll_import_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_import_batches" ADD CONSTRAINT "payroll_import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_import_rows" ADD CONSTRAINT "payroll_import_rows_batch_id_payroll_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payroll_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_integration_events" ADD CONSTRAINT "payroll_integration_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_pay_grade_steps" ADD CONSTRAINT "payroll_pay_grade_steps_pay_grade_id_payroll_pay_grades_id_fk" FOREIGN KEY ("pay_grade_id") REFERENCES "public"."payroll_pay_grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_pay_grades" ADD CONSTRAINT "payroll_pay_grades_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_pay_grades" ADD CONSTRAINT "payroll_pay_grades_nec_sector_id_nec_sectors_config_id_fk" FOREIGN KEY ("nec_sector_id") REFERENCES "public"."nec_sectors_config"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_recurring_items" ADD CONSTRAINT "payroll_recurring_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_report_exports" ADD CONSTRAINT "payroll_report_exports_report_id_payroll_statutory_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."payroll_statutory_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_report_exports" ADD CONSTRAINT "payroll_report_exports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_report_validation_issues" ADD CONSTRAINT "payroll_report_validation_issues_report_id_payroll_statutory_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."payroll_statutory_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_report_validation_issues" ADD CONSTRAINT "payroll_report_validation_issues_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_employees" ADD CONSTRAINT "payroll_run_employees_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_employees" ADD CONSTRAINT "payroll_run_employees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_salary_structures" ADD CONSTRAINT "payroll_salary_structures_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_statutory_deadlines" ADD CONSTRAINT "payroll_statutory_deadlines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_statutory_reports" ADD CONSTRAINT "payroll_statutory_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_statutory_reports" ADD CONSTRAINT "payroll_statutory_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_statutory_reports" ADD CONSTRAINT "payroll_statutory_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_statutory_rules" ADD CONSTRAINT "payroll_statutory_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_tax_brackets" ADD CONSTRAINT "payroll_tax_brackets_tax_table_id_payroll_tax_tables_id_fk" FOREIGN KEY ("tax_table_id") REFERENCES "public"."payroll_tax_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_tax_tables" ADD CONSTRAINT "payroll_tax_tables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_documents" ADD CONSTRAINT "payslip_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_documents" ADD CONSTRAINT "payslip_documents_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_documents" ADD CONSTRAINT "payslip_documents_payroll_run_employee_id_payroll_run_employees_id_fk" FOREIGN KEY ("payroll_run_employee_id") REFERENCES "public"."payroll_run_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_documents" ADD CONSTRAINT "payslip_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_documents" ADD CONSTRAINT "payslip_documents_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_integration_credentials" ADD CONSTRAINT "tenant_integration_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assigned_assets_company_idx" ON "assigned_assets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "departments_company_idx" ON "departments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "disciplinary_records_company_idx" ON "disciplinary_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_contracts_employee_idx" ON "employee_contracts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_documents_employee_idx" ON "employee_documents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_documents_company_idx" ON "employee_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_loans_company_idx" ON "employee_loans" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_loans_employee_idx" ON "employee_loans" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_payroll_profiles_employee_idx" ON "employee_payroll_profiles" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_payroll_profiles_company_idx" ON "employee_payroll_profiles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employees_company_idx" ON "employees" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employees_branch_idx" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inv_cost_comp_trans_id_idx" ON "inventory_cost_components" USING btree ("inventory_transaction_id");--> statement-breakpoint
CREATE INDEX "landed_cost_alloc_doc_id_idx" ON "landed_cost_allocations" USING btree ("landed_cost_document_id");--> statement-breakpoint
CREATE INDEX "landed_cost_alloc_trans_id_idx" ON "landed_cost_allocations" USING btree ("inventory_transaction_id");--> statement-breakpoint
CREATE INDEX "landed_cost_doc_company_id_idx" ON "landed_cost_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "leave_balances_employee_type_idx" ON "leave_balances" USING btree ("employee_id","leave_type");--> statement-breakpoint
CREATE INDEX "leave_requests_company_idx" ON "leave_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "loan_installments_loan_idx" ON "loan_installments" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "nec_sectors_company_idx" ON "nec_sectors_config" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payment_batch_details_batch_idx" ON "payment_batch_details" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "payment_batches_company_idx" ON "payment_batches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_allowances_employee_line_idx" ON "payroll_allowances" USING btree ("payroll_run_employee_id");--> statement-breakpoint
CREATE INDEX "payroll_attendance_imports_company_idx" ON "payroll_attendance_imports" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_attendance_imports_period_idx" ON "payroll_attendance_imports" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "payroll_deduction_types_company_code_idx" ON "payroll_deduction_types" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "payroll_deduction_types_priority_idx" ON "payroll_deduction_types" USING btree ("priority_order");--> statement-breakpoint
CREATE INDEX "payroll_deductions_employee_line_idx" ON "payroll_deductions" USING btree ("payroll_run_employee_id");--> statement-breakpoint
CREATE INDEX "payroll_earning_types_company_code_idx" ON "payroll_earning_types" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "payroll_import_batches_company_idx" ON "payroll_import_batches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_import_batches_type_idx" ON "payroll_import_batches" USING btree ("import_type","created_at");--> statement-breakpoint
CREATE INDEX "payroll_import_rows_batch_idx" ON "payroll_import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "payroll_import_rows_status_idx" ON "payroll_import_rows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payroll_integration_events_company_idx" ON "payroll_integration_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_integration_events_entity_idx" ON "payroll_integration_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "payroll_pay_grade_steps_grade_idx" ON "payroll_pay_grade_steps" USING btree ("pay_grade_id");--> statement-breakpoint
CREATE INDEX "payroll_pay_grades_company_idx" ON "payroll_pay_grades" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_recurring_employee_idx" ON "payroll_recurring_items" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_report_exports_report_idx" ON "payroll_report_exports" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "payroll_report_validation_company_idx" ON "payroll_report_validation_issues" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_report_validation_report_idx" ON "payroll_report_validation_issues" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "payroll_run_employees_run_idx" ON "payroll_run_employees" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "payroll_run_employees_employee_idx" ON "payroll_run_employees" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_runs_company_period_idx" ON "payroll_runs" USING btree ("company_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payroll_deadline_lookup_idx" ON "payroll_statutory_deadlines" USING btree ("country_code","authority","report_type");--> statement-breakpoint
CREATE INDEX "payroll_deadline_company_idx" ON "payroll_statutory_deadlines" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_statutory_reports_company_idx" ON "payroll_statutory_reports" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_statutory_reports_type_period_idx" ON "payroll_statutory_reports" USING btree ("report_type","period_start","period_end");--> statement-breakpoint
CREATE INDEX "payroll_statutory_rules_lookup_idx" ON "payroll_statutory_rules" USING btree ("country_code","rule_code","currency","pay_frequency","effective_from");--> statement-breakpoint
CREATE INDEX "payroll_statutory_rules_company_idx" ON "payroll_statutory_rules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_tax_brackets_table_idx" ON "payroll_tax_brackets" USING btree ("tax_table_id","bracket_order");--> statement-breakpoint
CREATE INDEX "payroll_tax_tables_company_idx" ON "payroll_tax_tables" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_tax_tables_lookup_idx" ON "payroll_tax_tables" USING btree ("country_code","currency","pay_frequency","effective_from");--> statement-breakpoint
CREATE INDEX "payslip_documents_run_idx" ON "payslip_documents" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "payslip_documents_employee_idx" ON "payslip_documents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "positions_company_idx" ON "positions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tax_tables_currency_period_idx" ON "tax_tables_config" USING btree ("currency","effective_from");