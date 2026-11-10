-- 0073_payroll_run_uniqueness.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0073_payroll_run_uniqueness.sql
--
-- Backs the app-level DUPLICATE_PAYROLL_RUN guard in server/api/v1/payroll.ts with a
-- database constraint, so two concurrent "create run" clicks - or a direct INSERT -
-- cannot produce two live runs paying the same staff for the same period. Pondo's
-- Django payroll has had this for years; fisczim only checks in the request path, and
-- findOverlappingRun runs before the insert without any lock, so the race is real.
--
-- The route rejects *overlapping* periods, which no unique index can express. This
-- covers the exact-period case, which is what actually double-submits. Overlap stays
-- app-enforced.
--
-- Reversed runs are excluded: reversing a run marks the original REVERSED and raises a
-- replacement over the same period, so live rows only ever conflict with live rows.
-- Branch is folded with COALESCE(branch_id, 0) because a company-wide run has a NULL
-- branch, and NULLs do not conflict with each other in a unique index.

BEGIN;

-- 1. Report any live exact-period duplicates before trying to index them. Listed by
--    company so the fix is a human decision about which run to reverse, not a delete.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(
           format('company %s branch %s %s..%s %s %s -> runs (%s)',
                  company_id, coalesce(branch_id::text, 'all'), period_start, period_end,
                  currency, run_type, run_ids),
           E'\n  '
         )
    INTO offenders
    FROM (
      SELECT company_id, branch_id, period_start, period_end, currency, run_type,
             string_agg(id::text, ',' ORDER BY id) AS run_ids
        FROM payroll_runs
       WHERE status <> 'REVERSED'
       GROUP BY company_id, branch_id, period_start, period_end, currency, run_type
      HAVING count(*) > 1
    ) duplicates;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION E'live payroll runs share a period, cannot build the unique index:\n  %', offenders;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_live_period_key
  ON payroll_runs (company_id, COALESCE(branch_id, 0), period_start, period_end, currency, run_type)
 WHERE status <> 'REVERSED';

-- 2. One payslip line per employee per run. Run population already builds a line per
--    eligible employee, so a second line would double-pay that person in the journal,
--    the bank export and every statutory return derived from the run.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(format('run %s employee %s (%s lines)', payroll_run_id, employee_id, n), ', ')
    INTO offenders
    FROM (
      SELECT payroll_run_id, employee_id, count(*) AS n
        FROM payroll_run_employees
       GROUP BY payroll_run_id, employee_id
      HAVING count(*) > 1
    ) duplicates;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate payslip lines, cannot build the unique index: %', offenders;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_run_employees_run_employee_key
  ON payroll_run_employees (payroll_run_id, employee_id);

COMMIT;

-- Rollback:
--   DROP INDEX IF EXISTS payroll_runs_live_period_key;
--   DROP INDEX IF EXISTS payroll_run_employees_run_employee_key;
