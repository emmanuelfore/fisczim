-- 0080_declared_primary_key_quotations.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0080_declared_primary_key_quotations.sql
--
-- WHY THIS EXISTS
-- Same drift 0076 was written for, one table later: shared/schema.ts declares
-- `serial("id").primaryKey()` on `quotations`, and the live table has no primary key and no
-- unique index on `id` at all. PostgreSQL only lets a foreign key point at a unique key, so
-- while that is true nothing may reference quotations - which is why 0078 had to add
-- `enquiries.quotation_id` without its constraint. Verified against production on 2026-11-05:
-- `quotations` has no `p` constraint, no unique single-column index, and no incoming
-- foreign keys, so this file adds the key and the one reference the CRM needs.
--
-- SCOPE: quotations and the CRM link only. `quotation_items.quotation_id` declares the same
-- reference and is now legal to constrain too, but that is the sales sweep's call, not this
-- file's - the remainder of the ~96 unkeyed tables is still a separate pass with its own
-- preflight, exactly as 0076 framed it.
--
-- Reversible: the rollback at the bottom drops the foreign key, then the primary key. Nothing
-- else references quotations yet, so the key comes away cleanly.

BEGIN;

SET LOCAL search_path TO public;

-- 1. Preflight, for the same reason 0076 does it: a primary key can only be built on a column
--    that is already one row per value and never null, and a duplicate id is a human decision
--    about which row to keep - not something to discover halfway through an index build.
DO $$
DECLARE
  offenders text;
  row record;
  n bigint;
  found_schema text;
BEGIN
  FOR row IN
    SELECT unnest(ARRAY['quotations']) AS table_name
  LOOP
    -- This database resolves unqualified names through the search_path and Supabase keeps its
    -- own tables in other schemas, so pin every target to the application schema before
    -- altering anything.
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
    RAISE EXCEPTION E'cannot declare the quotations primary key, the ids are not unique per row:\n  %', offenders;
  END IF;
END
$$;

-- 2. Declare the key.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'quotations'::regclass AND contype = 'p') THEN
    ALTER TABLE quotations ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);
  END IF;
END
$$;

-- 3. Attach the reference 0078 could not create. It depends on the `enquiries` table and its
--    quotation_id column existing, so this file runs after 0077 and 0078 - and says so loudly
--    rather than skipping the constraint and leaving the link unenforced.
DO $$
BEGIN
  IF to_regclass('public.enquiries') IS NULL THEN
    RAISE EXCEPTION 'public.enquiries is missing - apply 0077_crm_enquiries.sql before this file';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.enquiries'::regclass
       AND attname = 'quotation_id'
       AND attnum > 0
  ) THEN
    RAISE EXCEPTION 'enquiries.quotation_id is missing - apply 0078_crm_pipeline_and_activities.sql before this file';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.conrelid = 'public.enquiries'::regclass
       AND c.contype = 'f'
       AND a.attname = 'quotation_id'
  ) THEN
    ALTER TABLE enquiries
      ADD CONSTRAINT enquiries_quotation_id_fkey
      FOREIGN KEY (quotation_id) REFERENCES quotations(id);
  END IF;
END
$$;

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE "enquiries" DROP CONSTRAINT IF EXISTS "enquiries_quotation_id_fkey";
-- ALTER TABLE "quotations" DROP CONSTRAINT IF EXISTS "quotations_pkey";
-- COMMIT;
