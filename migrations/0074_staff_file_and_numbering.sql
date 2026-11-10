-- 0074_staff_file_and_numbering.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0074_staff_file_and_numbering.sql
--
-- Adds the columns the staff file and payroll settings features need, ported from the
-- pondo payroll product: a scanned document is only half a record until it says when it
-- stops being valid and whether the signed original is in the cabinet, and every employer
-- numbers its own staff. Positions also gain a pay grade so an unfilled post can be costed.
--
-- Everything is additive with defaults, so existing rows and the running server keep
-- working before and after. Nothing here rewrites data.

BEGIN;

-- 1. Staff file: expiry and physical-copy tracking on the documents already uploaded.
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS expiry_date date;

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS hard_copy_on_file boolean NOT NULL DEFAULT false;

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS notes text;

-- The expiry radar scans a company's documents by date, not one employee at a time.
CREATE INDEX IF NOT EXISTS employee_documents_expiry_idx
  ON employee_documents (company_id, expiry_date);

-- 2. Per-company payroll settings: staff numbering and the required-file list.
CREATE TABLE IF NOT EXISTS payroll_company_settings (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  staff_number_prefix text NOT NULL DEFAULT '',
  staff_number_digits integer NOT NULL DEFAULT 4,
  staff_number_next integer NOT NULL DEFAULT 1,
  required_document_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  expiry_warning_days integer NOT NULL DEFAULT 30,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_company_settings_company_key
  ON payroll_company_settings (company_id);

-- 3. A position carrying a pay grade can be budgeted while vacant. Runs read employees,
--    so a vacancy never reaches a payslip, the journal or a statutory return.
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS pay_grade_id integer;

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS approved_headcount integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS positions_pay_grade_idx
  ON positions (pay_grade_id);

-- shared/schema.ts declares this reference, but PostgreSQL can only enforce a foreign
-- key against a unique key, and payroll_pay_grades has no primary key in this database
-- (0076_restoring_declared_primary_keys.sql fixes that). The column is still created
-- now, and the constraint is added the moment its target can support it - so this file
-- succeeds either way and never silently drops the intent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payroll_pay_grades'::regclass AND contype = 'p')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positions_pay_grade_id_payroll_pay_grades_id_fk')
  THEN
    ALTER TABLE positions
      ADD CONSTRAINT positions_pay_grade_id_payroll_pay_grades_id_fk
      FOREIGN KEY (pay_grade_id) REFERENCES payroll_pay_grades(id) ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;

-- Rollback:
--   ALTER TABLE employee_documents DROP COLUMN IF EXISTS expiry_date,
--                                  DROP COLUMN IF EXISTS hard_copy_on_file,
--                                  DROP COLUMN IF EXISTS notes;
--   DROP INDEX IF EXISTS employee_documents_expiry_idx;
--   DROP TABLE IF EXISTS payroll_company_settings;
--   ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_pay_grade_id_payroll_pay_grades_id_fk;
--   ALTER TABLE positions DROP COLUMN IF EXISTS pay_grade_id, DROP COLUMN IF EXISTS approved_headcount;
--   DROP INDEX IF EXISTS positions_pay_grade_idx;
