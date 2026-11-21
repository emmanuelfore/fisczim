-- Manual migration: CRM commission + late-task penalty tables.
-- These tables exist in shared/schema.ts but were never given a .sql migration
-- (they relied on drizzle-kit push). This DDL mirrors the schema definitions
-- so the commission dashboard and task-SLA penalty engine can run.
--
-- Idempotent (IF NOT EXISTS); safe to re-run. Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/crm_commission_tables.sql

BEGIN;

-- ── crm_commission_settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "crm_commission_settings" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "default_basis" text NOT NULL DEFAULT 'gross_profit',
  "default_rate_percent" numeric(7,3) NOT NULL DEFAULT '5.000',
  "default_fixed_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "response_window_hours" integer NOT NULL DEFAULT 2,
  "penalty_per_late_task" numeric(15,2) NOT NULL DEFAULT '25.00',
  "penalty_cap_percent" integer NOT NULL DEFAULT 100,
  "working_days" text NOT NULL DEFAULT '1,2,3,4,5',
  "workday_start" text NOT NULL DEFAULT '08:00',
  "workday_end" text NOT NULL DEFAULT '17:00',
  "utc_offset_minutes" integer NOT NULL DEFAULT 120,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "crm_commission_settings_company_unique" UNIQUE ("company_id")
);

-- ── crm_commission_rules (per-salesperson overrides) ─────────────────────────
CREATE TABLE IF NOT EXISTS "crm_commission_rules" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "salesperson_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "basis" text NOT NULL DEFAULT 'gross_profit',
  "rate_percent" numeric(7,3) NOT NULL DEFAULT '5.000',
  "fixed_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "crm_commission_rules_company_salesperson_unique" UNIQUE ("company_id", "salesperson_id")
);
CREATE INDEX IF NOT EXISTS "crm_commission_rules_company_idx" ON "crm_commission_rules" ("company_id");

-- ── crm_commissions (the statements) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "crm_commissions" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "salesperson_id" uuid NOT NULL REFERENCES "users"("id"),
  "enquiry_id" integer REFERENCES "enquiries"("id") ON DELETE SET NULL,
  "vehicle_id" integer REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "invoice_id" integer REFERENCES "invoices"("id") ON DELETE SET NULL,
  "reference" text,
  "basis" text NOT NULL,
  "sale_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "cost_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "basis_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "rate_percent" numeric(7,3) NOT NULL DEFAULT '0.000',
  "fixed_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "gross_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "penalty_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "net_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "status" text NOT NULL DEFAULT 'draft',
  "period_month" text,
  "notes" text,
  "approval_request_id" integer REFERENCES "approval_requests"("id") ON DELETE SET NULL,
  "requested_by" uuid REFERENCES "users"("id"),
  "requested_at" timestamp,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "review_notes" text,
  "paid_at" timestamp,
  "paid_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crm_commissions_company_idx" ON "crm_commissions" ("company_id");
CREATE INDEX IF NOT EXISTS "crm_commissions_salesperson_idx" ON "crm_commissions" ("company_id", "salesperson_id");
CREATE INDEX IF NOT EXISTS "crm_commissions_status_idx" ON "crm_commissions" ("company_id", "status");
-- One commission statement per vehicle (partial unique — only when a vehicle is linked).
CREATE UNIQUE INDEX IF NOT EXISTS "crm_commissions_company_vehicle_unique"
  ON "crm_commissions" ("company_id", "vehicle_id")
  WHERE "vehicle_id" IS NOT NULL;

-- ── crm_tasks (team tasks with a response SLA) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "crm_tasks" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "enquiry_id" integer REFERENCES "enquiries"("id") ON DELETE CASCADE,
  "assigned_to" uuid NOT NULL REFERENCES "users"("id"),
  "created_by" uuid REFERENCES "users"("id"),
  "title" text NOT NULL,
  "body" text,
  "priority" text NOT NULL DEFAULT 'normal',
  "status" text NOT NULL DEFAULT 'pending',
  "due_at" timestamp NOT NULL,
  "responded_at" timestamp,
  "response_note" text,
  "penalty_applied" boolean NOT NULL DEFAULT false,
  "penalty_amount" numeric(15,2) NOT NULL DEFAULT '0.00',
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crm_tasks_company_idx" ON "crm_tasks" ("company_id");
CREATE INDEX IF NOT EXISTS "crm_tasks_assignee_idx" ON "crm_tasks" ("company_id", "assigned_to");
CREATE INDEX IF NOT EXISTS "crm_tasks_status_idx" ON "crm_tasks" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "crm_tasks_due_idx" ON "crm_tasks" ("company_id", "due_at");

-- ── crm_task_penalties (immutable deduction ledger; created last, references the two above) ──
CREATE TABLE IF NOT EXISTS "crm_task_penalties" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "task_id" integer REFERENCES "crm_tasks"("id") ON DELETE CASCADE,
  "salesperson_id" uuid NOT NULL REFERENCES "users"("id"),
  "commission_id" integer REFERENCES "crm_commissions"("id") ON DELETE SET NULL,
  "amount" numeric(15,2) NOT NULL,
  "late_hours" numeric(8,2) NOT NULL DEFAULT '0.00',
  "reason" text,
  "applied_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crm_task_penalties_company_idx" ON "crm_task_penalties" ("company_id");
CREATE INDEX IF NOT EXISTS "crm_task_penalties_task_idx" ON "crm_task_penalties" ("task_id");
CREATE INDEX IF NOT EXISTS "crm_task_penalties_pending_idx" ON "crm_task_penalties" ("company_id", "salesperson_id", "commission_id");

COMMIT;
