CREATE TABLE "bank_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"apply_to" text DEFAULT 'ALL' NOT NULL,
	"conditions" jsonb NOT NULL,
	"action_type" text NOT NULL,
	"target_account_id" integer,
	"tax_type_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_of_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"bom_id" integer NOT NULL,
	"component_product_id" integer NOT NULL,
	"type" text DEFAULT 'COMPONENT' NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_of_measure" text NOT NULL,
	"scrap_percentage" numeric(5, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"is_exclusive" boolean DEFAULT false NOT NULL,
	"customer_sku" text,
	"artwork_version" text,
	"spec_reference" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_products_customer_product_idx" UNIQUE("customer_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "customer_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"customer_id" integer,
	"batch_id" integer,
	"quantity" numeric(10, 2) DEFAULT '0' NOT NULL,
	"uom" text,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"last_movement_date" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_stock_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration" integer,
	"result_data" jsonb,
	"error_data" jsonb,
	"company_id" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "manufacturing_machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_center_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_material_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity_reserved" numeric(15, 4) NOT NULL,
	"status" text DEFAULT 'RESERVED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_material_shortages" (
	"id" serial PRIMARY KEY NOT NULL,
	"mrp_run_id" integer,
	"product_id" integer NOT NULL,
	"shortage_quantity" numeric(15, 4) NOT NULL,
	"required_date" date,
	"status" text DEFAULT 'UNRESOLVED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_material_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"production_run_id" integer,
	"product_id" integer NOT NULL,
	"type" text DEFAULT 'ISSUE' NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "manufacturing_mrp_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"mrp_run_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"required_date" date,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reference_id" integer
);
--> statement-breakpoint
CREATE TABLE "manufacturing_mrp_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "manufacturing_production_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" text,
	"uploaded_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_production_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"production_run_id" integer,
	"note_type" text DEFAULT 'GENERAL' NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_production_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"routing_operation_id" integer,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"planned_quantity" numeric(12, 4) NOT NULL,
	"actual_quantity" numeric(12, 4) DEFAULT '0' NOT NULL,
	"good_quantity" numeric(12, 4) DEFAULT '0' NOT NULL,
	"rejected_quantity" numeric(12, 4) DEFAULT '0' NOT NULL,
	"start_time" timestamp,
	"end_time" timestamp,
	"machine_id" integer,
	"operator_id" integer,
	"shift" text,
	"downtime_minutes" numeric(10, 2) DEFAULT '0' NOT NULL,
	"completion_percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_production_schedule_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"planned_start_date" timestamp,
	"planned_end_date" timestamp
);
--> statement-breakpoint
CREATE TABLE "manufacturing_production_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "manufacturing_routing_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"routing_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"operation_name" text NOT NULL,
	"work_center_id" integer NOT NULL,
	"default_machine_id" integer,
	"setup_time_minutes" numeric(10, 2) DEFAULT '0' NOT NULL,
	"cycle_time_minutes" numeric(10, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_routings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_work_centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"cost_per_hour" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"overhead_rate" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"capacity_hours_per_day" numeric(5, 2) DEFAULT '8.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_calculation_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_run_employee_id" integer NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_elements" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"country_code" text DEFAULT 'ZW' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"element_type" text DEFAULT 'EARNING' NOT NULL,
	"category" text DEFAULT 'ALLOWANCE' NOT NULL,
	"tax_treatment" text DEFAULT 'TAXABLE' NOT NULL,
	"taxable_percentage" numeric(5, 2) DEFAULT '100.00' NOT NULL,
	"is_pensionable" boolean DEFAULT false NOT NULL,
	"is_nssa_applicable" boolean DEFAULT false NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
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
CREATE TABLE "sales_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_order_id" integer NOT NULL,
	"product_id" integer,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"invoiced_quantity" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"tax_type_id" integer
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"branch_id" integer,
	"customer_id" integer NOT NULL,
	"quotation_id" integer,
	"order_number" text NOT NULL,
	"issue_date" timestamp DEFAULT now(),
	"due_date" timestamp,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax_amount" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'USD',
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "work_order_consumptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity_consumed" numeric(12, 4) NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"type" text DEFAULT 'STANDARD' NOT NULL,
	"parent_work_order_id" integer,
	"routing_id" integer,
	"bom_id" integer NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"planned_quantity" numeric(12, 4) NOT NULL,
	"completed_quantity" numeric(12, 4) DEFAULT '0' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "statutory_settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_brackets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_tables" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "statutory_settings" CASCADE;--> statement-breakpoint
DROP TABLE "tax_brackets" CASCADE;--> statement-breakpoint
DROP TABLE "tax_tables" CASCADE;--> statement-breakpoint
ALTER TABLE "layby_items" DROP CONSTRAINT "layby_items_serial_number_id_product_serial_numbers_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "due_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "nssa_employer_number" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "payroll_bank_export_format" jsonb;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "ap_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "ar_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "inventory_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "gl_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_delivery_notes" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "sales_order_item_id" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "sales_order_id" integer;--> statement-breakpoint
ALTER TABLE "layby_items" ADD COLUMN "serial_number" text;--> statement-breakpoint
ALTER TABLE "product_batches" ADD COLUMN "manufacturing_date" date;--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "base_unit_multiplier" numeric(10, 4) DEFAULT '1.0000';--> statement-breakpoint
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_tax_type_id_tax_types_id_fk" FOREIGN KEY ("tax_type_id") REFERENCES "public"."tax_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_bill_of_materials_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_products" ADD CONSTRAINT "customer_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock" ADD CONSTRAINT "customer_stock_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock" ADD CONSTRAINT "customer_stock_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock" ADD CONSTRAINT "customer_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock" ADD CONSTRAINT "customer_stock_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock" ADD CONSTRAINT "customer_stock_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock_transactions" ADD CONSTRAINT "customer_stock_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock_transactions" ADD CONSTRAINT "customer_stock_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock_transactions" ADD CONSTRAINT "customer_stock_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_stock_transactions" ADD CONSTRAINT "customer_stock_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_machines" ADD CONSTRAINT "manufacturing_machines_work_center_id_manufacturing_work_centers_id_fk" FOREIGN KEY ("work_center_id") REFERENCES "public"."manufacturing_work_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_material_reservations" ADD CONSTRAINT "manufacturing_material_reservations_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_material_reservations" ADD CONSTRAINT "manufacturing_material_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_material_shortages" ADD CONSTRAINT "manufacturing_material_shortages_mrp_run_id_manufacturing_mrp_runs_id_fk" FOREIGN KEY ("mrp_run_id") REFERENCES "public"."manufacturing_mrp_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_material_shortages" ADD CONSTRAINT "manufacturing_material_shortages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_material_transactions" ADD CONSTRAINT "manufacturing_material_transactions_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_material_transactions" ADD CONSTRAINT "manufacturing_material_transactions_production_run_id_manufacturing_production_runs_id_fk" FOREIGN KEY ("production_run_id") REFERENCES "public"."manufacturing_production_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_material_transactions" ADD CONSTRAINT "manufacturing_material_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_mrp_recommendations" ADD CONSTRAINT "manufacturing_mrp_recommendations_mrp_run_id_manufacturing_mrp_runs_id_fk" FOREIGN KEY ("mrp_run_id") REFERENCES "public"."manufacturing_mrp_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_mrp_recommendations" ADD CONSTRAINT "manufacturing_mrp_recommendations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_mrp_runs" ADD CONSTRAINT "manufacturing_mrp_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_attachments" ADD CONSTRAINT "manufacturing_production_attachments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_attachments" ADD CONSTRAINT "manufacturing_production_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_notes" ADD CONSTRAINT "manufacturing_production_notes_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_notes" ADD CONSTRAINT "manufacturing_production_notes_production_run_id_manufacturing_production_runs_id_fk" FOREIGN KEY ("production_run_id") REFERENCES "public"."manufacturing_production_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_notes" ADD CONSTRAINT "manufacturing_production_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_runs" ADD CONSTRAINT "manufacturing_production_runs_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_runs" ADD CONSTRAINT "manufacturing_production_runs_routing_operation_id_manufacturing_routing_operations_id_fk" FOREIGN KEY ("routing_operation_id") REFERENCES "public"."manufacturing_routing_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_runs" ADD CONSTRAINT "manufacturing_production_runs_machine_id_manufacturing_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."manufacturing_machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_runs" ADD CONSTRAINT "manufacturing_production_runs_operator_id_employees_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_schedule_lines" ADD CONSTRAINT "manufacturing_production_schedule_lines_schedule_id_manufacturing_production_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."manufacturing_production_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_schedule_lines" ADD CONSTRAINT "manufacturing_production_schedule_lines_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_production_schedules" ADD CONSTRAINT "manufacturing_production_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_routing_operations" ADD CONSTRAINT "manufacturing_routing_operations_routing_id_manufacturing_routings_id_fk" FOREIGN KEY ("routing_id") REFERENCES "public"."manufacturing_routings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_routing_operations" ADD CONSTRAINT "manufacturing_routing_operations_work_center_id_manufacturing_work_centers_id_fk" FOREIGN KEY ("work_center_id") REFERENCES "public"."manufacturing_work_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_routing_operations" ADD CONSTRAINT "manufacturing_routing_operations_default_machine_id_manufacturing_machines_id_fk" FOREIGN KEY ("default_machine_id") REFERENCES "public"."manufacturing_machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_routings" ADD CONSTRAINT "manufacturing_routings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_routings" ADD CONSTRAINT "manufacturing_routings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_work_centers" ADD CONSTRAINT "manufacturing_work_centers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_calculation_audits" ADD CONSTRAINT "payroll_calculation_audits_payroll_run_employee_id_payroll_run_employees_id_fk" FOREIGN KEY ("payroll_run_employee_id") REFERENCES "public"."payroll_run_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_elements" ADD CONSTRAINT "payroll_elements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_elements" ADD CONSTRAINT "payroll_elements_gl_account_id_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_tax_type_id_tax_types_id_fk" FOREIGN KEY ("tax_type_id") REFERENCES "public"."tax_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_consumptions" ADD CONSTRAINT "work_order_consumptions_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_consumptions" ADD CONSTRAINT "work_order_consumptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_routing_id_manufacturing_routings_id_fk" FOREIGN KEY ("routing_id") REFERENCES "public"."manufacturing_routings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_bom_id_bill_of_materials_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_stock_location_idx" ON "customer_stock" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "customer_stock_product_idx" ON "customer_stock" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "customer_stock_customer_idx" ON "customer_stock" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cst_trans_customer_idx" ON "customer_stock_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cst_trans_product_idx" ON "customer_stock_transactions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "job_logs_job_name_idx" ON "job_logs" USING btree ("job_name");--> statement-breakpoint
CREATE INDEX "job_logs_status_idx" ON "job_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_logs_started_at_idx" ON "job_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "job_logs_company_id_idx" ON "job_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payroll_elements_company_code_idx" ON "payroll_elements" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "payroll_elements_priority_idx" ON "payroll_elements" USING btree ("priority_order");--> statement-breakpoint
ALTER TABLE "goods_delivery_notes" ADD CONSTRAINT "goods_delivery_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_periods" DROP COLUMN "ar_closed";--> statement-breakpoint
ALTER TABLE "financial_periods" DROP COLUMN "ap_closed";--> statement-breakpoint
ALTER TABLE "financial_periods" DROP COLUMN "inventory_closed";--> statement-breakpoint
ALTER TABLE "financial_periods" DROP COLUMN "bank_closed";--> statement-breakpoint
ALTER TABLE "journal_entries" DROP COLUMN "base_currency";--> statement-breakpoint
ALTER TABLE "journal_entry_draft_lines" DROP COLUMN "base_amount";--> statement-breakpoint
ALTER TABLE "layby_items" DROP COLUMN "serial_number_id";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "base_amount";--> statement-breakpoint
ALTER TABLE "payroll_earning_types" DROP COLUMN "metadata";