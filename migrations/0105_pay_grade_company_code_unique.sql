-- 0105_pay_grade_company_code_unique.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0105_pay_grade_company_code_unique.sql
--
-- WHY THIS EXISTS
-- shared/schema.ts and the pay-grade POST route both rely on a UNIQUE
-- (company_id, code) key on payroll_pay_grades: the route uses it as the
-- ON CONFLICT target when saving a grade. Some deployed databases predate
-- that constraint (they were created before 0027/0032 or through db:push on a
-- pre-existing table), so saving a grade fails with Postgres 42P10:
-- "There is no unique or exclusion constraint matching the ON CONFLICT
-- specification". This restores the declared constraint without touching
-- any grade data.

BEGIN;

DO $$
DECLARE
  duplicate_groups bigint;
BEGIN
  IF to_regclass('public.payroll_pay_grades') IS NULL THEN
    RAISE EXCEPTION 'public.payroll_pay_grades does not exist; nothing to repair';
  END IF;

  -- A UNIQUE constraint cannot be added while duplicate codes exist. Report
  -- the count instead of letting Postgres fail with a raw index error: the
  -- right fix is a human decision about which grades to keep.
  SELECT count(*) INTO duplicate_groups
  FROM (
    SELECT company_id, code
    FROM public.payroll_pay_grades
    GROUP BY company_id, code
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'cannot add payroll_pay_grades_company_code_unique: % (company_id, code) pairs are duplicated; resolve them first',
      duplicate_groups;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.payroll_pay_grades'::regclass
      AND conname = 'payroll_pay_grades_company_code_unique'
  ) THEN
    ALTER TABLE public.payroll_pay_grades
      ADD CONSTRAINT payroll_pay_grades_company_code_unique UNIQUE (company_id, code);
  END IF;
END
$$;

COMMIT;
