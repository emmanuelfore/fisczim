-- 0076_declared_primary_keys_payroll.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0076_declared_primary_keys_payroll.sql
--
-- WHY THIS EXISTS
-- shared/schema.ts declares `serial("id").primaryKey()` (or a uuid primary key) on every
-- one of these tables, and the live database has no primary key on them at all. That is
-- not cosmetic: PostgreSQL can only enforce a foreign key against a unique key, so while
-- these five tables have no primary key, NOTHING may reference them. 0074 and 0075 both
-- hit that wall - `positions.pay_grade_id`, `hr_sop_documents.published_by` and the two
-- `user_id` columns had to be created without their constraints. It also means a run, a
-- payslip line or a user row has no database-level guarantee that its id identifies
-- exactly one row, which every `WHERE id = ?` in the payroll code silently assumes.
--
-- SCOPE: deliberately the five tables the payroll product references, all verified
-- idempotent-safe below. 96 of the 189 tables in this database have no primary key, so
-- this is the first instalment, not the whole job - the remainder (accounting, stock,
-- manufacturing, POS, tax) is a separate sweep with its own preflight.
--
-- Reversible: each constraint is dropped by the rollback at the bottom.

BEGIN;

-- 1. Preflight. A primary key can only be built on a column that is already one row per
--    value and never null. Report the offenders by name instead of letting Postgres fail
--    halfway through with a raw index error, because the fix for a duplicate id is a
--    human decision about which row to keep.
DO $$
DECLARE
  offenders text;
  row record;
  n bigint;
  found_schema text;
BEGIN
  FOR row IN
    SELECT unnest(ARRAY[
      'users', 'payroll_runs', 'payroll_run_employees', 'positions', 'payroll_pay_grades'
    ]) AS table_name
  LOOP
    -- This database carries a second `users` in the `auth` schema (Supabase's own, already
    -- keyed), and unqualified names resolve through the search_path. Pin the target to the
    -- application's schema before altering anything, or this file would spend its lock on
    -- someone else's table.
    SELECT n.nspname INTO found_schema
      FROM pg_class k JOIN pg_namespace n ON n.oid = k.relnamespace
     WHERE k.oid = to_regclass(row.table_name);
    IF found_schema IS DISTINCT FROM 'public' THEN
      RAISE EXCEPTION 'the search_path resolves "%" into the "%" schema, not public',
        row.table_name, coalesce(found_schema, 'nothing');
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM (SELECT id FROM %I GROUP BY id HAVING count(*) > 1) d',
      row.table_name
    ) INTO n;
    IF n > 0 THEN
      offenders := coalesce(offenders || E'\n  ', '') || row.table_name || ': ' || n || ' duplicated id value(s)';
    END IF;

    EXECUTE format('SELECT count(*) FROM %I WHERE id IS NULL', row.table_name) INTO n;
    IF n > 0 THEN
      offenders := coalesce(offenders || E'\n  ', '') || row.table_name || ': ' || n || ' row(s) with a null id';
    END IF;
  END LOOP;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION E'cannot declare primary keys, the ids are not unique per row:\n  %', offenders;
  END IF;
END
$$;

-- 2. Declare the keys. `IF NOT EXISTS` on the constraint, so re-running this file is a
--    no-op, and NOT VALID is never used - a primary key is either enforced or it is not a
--    control at all.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'p') THEN
    ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payroll_runs'::regclass AND contype = 'p') THEN
    ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payroll_run_employees'::regclass AND contype = 'p') THEN
    ALTER TABLE payroll_run_employees ADD CONSTRAINT payroll_run_employees_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'positions'::regclass AND contype = 'p') THEN
    ALTER TABLE positions ADD CONSTRAINT positions_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payroll_pay_grades'::regclass AND contype = 'p') THEN
    ALTER TABLE payroll_pay_grades ADD CONSTRAINT payroll_pay_grades_pkey PRIMARY KEY (id);
  END IF;
END
$$;

-- 3. Attach the foreign keys that 0074 and 0075 could not create without these keys.
--    Same conditions as those files use, so whichever runs last completes the pair.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positions_pay_grade_id_payroll_pay_grades_id_fk') THEN
    ALTER TABLE positions
      ADD CONSTRAINT positions_pay_grade_id_payroll_pay_grades_id_fk
      FOREIGN KEY (pay_grade_id) REFERENCES payroll_pay_grades(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_sop_documents_published_by_fkey') THEN
    ALTER TABLE hr_sop_documents
      ADD CONSTRAINT hr_sop_documents_published_by_fkey
      FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_sop_readers_user_id_fkey') THEN
    ALTER TABLE hr_sop_readers
      ADD CONSTRAINT hr_sop_readers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_sop_acknowledgements_user_id_fkey') THEN
    ALTER TABLE hr_sop_acknowledgements
      ADD CONSTRAINT hr_sop_acknowledgements_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END
$$;

COMMENT ON CONSTRAINT payroll_runs_pkey ON payroll_runs IS
  'Restored from shared/schema.ts; without it no payslip line could reference a run and the database would check it.';

COMMIT;

-- Rollback (children first, then the keys):
--   ALTER TABLE hr_sop_acknowledgements DROP CONSTRAINT IF EXISTS hr_sop_acknowledgements_user_id_fkey;
--   ALTER TABLE hr_sop_readers DROP CONSTRAINT IF EXISTS hr_sop_readers_user_id_fkey;
--   ALTER TABLE hr_sop_documents DROP CONSTRAINT IF EXISTS hr_sop_documents_published_by_fkey;
--   ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_pay_grade_id_payroll_pay_grades_id_fk;
--   ALTER TABLE payroll_pay_grades DROP CONSTRAINT IF EXISTS payroll_pay_grades_pkey;
--   ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_pkey;
--   ALTER TABLE payroll_run_employees DROP CONSTRAINT IF EXISTS payroll_run_employees_pkey;
--   ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_pkey;
--   ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
