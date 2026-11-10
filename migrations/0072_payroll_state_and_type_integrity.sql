-- 0072_payroll_state_and_type_integrity.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0072_payroll_state_and_type_integrity.sql
--
-- This is the hand-written replacement for `npm run db:push`. Every statement is
-- idempotent and the whole file runs in one transaction, so a failure - including
-- a unique index meeting duplicate rows - rolls the entire migration back.
--
-- There is no new column or table: shared/schema.ts changed only the comment on
-- payroll_runs.status, and the live database already carries every column the
-- payroll routes read (payroll_runs.journal_entry_id, run_type, currency,
-- payroll_run_employees.snapshot_data, payroll_statutory_rules.is_system_locked).
-- What the database is still missing is the integrity the fixes now enforce in
-- code, so a direct write cannot put the payroll state machine in a position it
-- cannot transition from.
--
-- Deliberately NOT constrained here: payroll_runs.currency. Zimbabwe pays in
-- USD/ZiG/SPLIT and Lesotho in LSL/USD, so a CHECK would have to know the
-- tenant's country. That stays jurisdiction data in shared/statutory and is
-- enforced by the UNSUPPORTED_PAYROLL_CURRENCY guard on run creation.

BEGIN;

-- 1. The state machine is DRAFT -> PENDING_APPROVAL -> APPROVED -> LOCKED, with
--    REVERSED terminal. Older rows used the name REVIEW for the pending state,
--    which the routes treat as an unrecognised status: it can be neither approved
--    nor locked, so those runs sit unreachable.
UPDATE payroll_runs
   SET status = 'PENDING_APPROVAL',
       updated_at = now()
 WHERE status = 'REVIEW';

-- 2. Say which values are in the way rather than letting the CHECK below fail with
--    only a constraint name, because each one needs a human decision.
DO $$
DECLARE
  unexpected text;
BEGIN
  SELECT string_agg(DISTINCT status, ', ' ORDER BY status)
    INTO unexpected
    FROM payroll_runs
   WHERE status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED', 'REVERSED');

  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION
      'payroll_runs.status holds % - values the payroll state machine cannot transition from. Retire or reassign those runs, then re-run 0072.', unexpected;
  END IF;
END
$$;

ALTER TABLE payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_status_check;

ALTER TABLE payroll_runs
  ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED', 'REVERSED'));

COMMENT ON COLUMN payroll_runs.status IS
  'DRAFT, PENDING_APPROVAL, APPROVED, LOCKED, REVERSED - enforced by payroll_runs_status_check';

-- 3. One type code per owner, mirroring the DUPLICATE_CODE refusal in
--    server/api/v1/payroll.ts. The route checks a tenant's own rows plus the shared
--    system templates, and cross-tenant collisions are legal, so the database can
--    only guarantee each half: no tenant repeats a code, and no two templates carry
--    the same code. Both indexes ignore is_active, matching the route - a retired
--    code stays claimed.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(format('company %s code %s (%s rows)', company_id, code, n), '; ' ORDER BY company_id, code)
    INTO offenders
    FROM (
      SELECT company_id, code, count(*) AS n
        FROM payroll_earning_types
       WHERE company_id IS NOT NULL
       GROUP BY company_id, code
      HAVING count(*) > 1
    ) duplicates;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate earning type codes, cannot build the unique index: %', offenders;
  END IF;

  SELECT string_agg(format('company %s code %s (%s rows)', company_id, code, n), '; ' ORDER BY company_id, code)
    INTO offenders
    FROM (
      SELECT company_id, code, count(*) AS n
        FROM payroll_deduction_types
       WHERE company_id IS NOT NULL
       GROUP BY company_id, code
      HAVING count(*) > 1
    ) duplicates;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate deduction type codes, cannot build the unique index: %', offenders;
  END IF;

  SELECT string_agg(format('code %s (%s rows)', code, n), '; ' ORDER BY code)
    INTO offenders
    FROM (
      SELECT code, count(*) AS n
        FROM payroll_earning_types
       WHERE company_id IS NULL
       GROUP BY code
      HAVING count(*) > 1
      UNION ALL
      SELECT code, count(*) AS n
        FROM payroll_deduction_types
       WHERE company_id IS NULL
       GROUP BY code
      HAVING count(*) > 1
    ) duplicates;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate shared system template codes: %', offenders;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_earning_types_tenant_code_key
  ON payroll_earning_types (company_id, code)
 WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_earning_types_template_code_key
  ON payroll_earning_types (code)
 WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_deduction_types_tenant_code_key
  ON payroll_deduction_types (company_id, code)
 WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_deduction_types_template_code_key
  ON payroll_deduction_types (code)
 WHERE company_id IS NULL;

-- 4. Statutory rates published by the revenue authority are not a tenant setting.
--    The API already refuses to recode or unlock a locked rule; this marks the
--    shared templates as locked so the same rows cannot be rewritten by an UPDATE
--    that skips the route. Company-owned rows are left alone - a tenant may still
--    correct its own ceiling or sector overrides.
UPDATE payroll_statutory_rules
   SET is_system_locked = true
 WHERE company_id IS NULL
   AND rule_code IN ('PAYE', 'AIDS_LEVY', 'NSSA_POBS', 'NEC', 'ZIMDEF', 'STANDARDS_LEVY', 'APWCS', 'PENSION')
   AND is_system_locked = false;

COMMIT;

-- After applying, confirm the vocabulary took and see which closed runs still have
-- no journal (the payroll->GL fix posts at lock time, so LOCKED rows predating it
-- need a deliberate backfill, not a blind INSERT):
--
--   select status, count(*) from payroll_runs group by 1 order by 1;
--
--   select r.id, r.company_id, r.status, r.period_start, r.period_end, r.currency,
--          r.total_net
--     from payroll_runs r
--    where r.status = 'LOCKED'
--      and r.journal_entry_id is null
--    order by r.company_id, r.period_start;
