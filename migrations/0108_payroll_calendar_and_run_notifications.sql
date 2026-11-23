-- 0108: Payroll calendar settings + pending-run notifications
-- The calendar drives the dates and frequency prefilled on a new payroll run and
-- the reminder window used by the HR dashboard/header alerts. Notifications are
-- generated on run state changes and cleared once a run is locked or reversed.

ALTER TABLE "payroll_company_settings"
  ADD COLUMN IF NOT EXISTS "default_pay_frequency" text DEFAULT 'MONTHLY' NOT NULL,
  ADD COLUMN IF NOT EXISTS "pay_day" integer DEFAULT 25 NOT NULL,
  ADD COLUMN IF NOT EXISTS "period_cutoff_day" integer DEFAULT 20 NOT NULL,
  ADD COLUMN IF NOT EXISTS "reminder_days_before" integer DEFAULT 7 NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payroll_run_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "user_id" uuid NOT NULL,
  "run_id" integer NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "href" text DEFAULT '/hr/payroll' NOT NULL,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "read_at" timestamp
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "payroll_run_notifications" ADD CONSTRAINT "payroll_run_notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_run_notifications" ADD CONSTRAINT "payroll_run_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_run_notifications" ADD CONSTRAINT "payroll_run_notifications_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_run_notifications_unique" ON "payroll_run_notifications" ("company_id", "user_id", "run_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_run_notifications_user_idx" ON "payroll_run_notifications" ("company_id", "user_id", "is_read");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_run_notifications_run_idx" ON "payroll_run_notifications" ("run_id");
