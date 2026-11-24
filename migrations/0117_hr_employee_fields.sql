-- HR fields the payroll API already accepts but the schema could not store,
-- so they were silently dropped on insert/update. Plain text and date columns:
-- the API defines no enum for these values and no statutory rate is inferred.
-- Probation is kept on the contract (where the HR form edits it) and mirrored
-- on the employee row for directory-level reminders.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "termination_type" text;
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "termination_reason" text;
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "probation_end_date" date;
--> statement-breakpoint
ALTER TABLE "employee_contracts" ADD COLUMN IF NOT EXISTS "probation_end_date" date;
