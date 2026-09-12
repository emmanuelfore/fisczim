-- Add system lock field to statutory rules to prevent accidental deletion
ALTER TABLE "payroll_statutory_rules" ADD COLUMN "is_system_locked" boolean DEFAULT false NOT NULL;
