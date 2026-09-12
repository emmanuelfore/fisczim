-- 0066: Configurable payroll proration basis per run
-- Proration answers "how much of a full-period amount does an employee get for
-- a period they joined / left / changed terms inside?" The basis is a run-level
-- setting (CALENDAR_DAYS, WORKING_DAYS, PAYABLE_DAYS, HOURS_WORKED) so the same
-- payroll logic is not hardcoded to one method.

ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "proration_basis" text DEFAULT 'CALENDAR_DAYS' NOT NULL;
