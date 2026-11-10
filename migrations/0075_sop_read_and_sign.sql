-- 0075_sop_read_and_sign.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0075_sop_read_and_sign.sql
--
-- Standard operating procedures that a named person signs. Ported from the pondo
-- payroll product: the control is not "the file exists on a drive", it is "every person
-- this version applies to has read this version and signed it", which is what an
-- auditor or a disciplinary hearing asks. Three additive tables, nothing rewritten.
--
-- Rollback is at the bottom. Everything is created IF NOT EXISTS, so this file can be
-- re-run safely.

BEGIN;

CREATE TABLE IF NOT EXISTS hr_sop_documents (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'GENERAL',
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT',
  body text NOT NULL DEFAULT '',
  effective_date date,
  requires_exam boolean NOT NULL DEFAULT false,
  acknowledgement_days integer NOT NULL DEFAULT 14,
  department_id integer REFERENCES departments(id),
  branch_id integer REFERENCES branches(id),
  author_note text,
  published_by uuid,
  published_at timestamp,
  superseded_by_id integer,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- One version of a code per company. Reissuing is a new version, never an edit of a
-- signed one: a signature can only point at the text it was given against.
CREATE UNIQUE INDEX IF NOT EXISTS hr_sop_documents_company_code_version_key
  ON hr_sop_documents (company_id, code, version);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_sop_documents_status_check'
  ) THEN
    ALTER TABLE hr_sop_documents
      ADD CONSTRAINT hr_sop_documents_status_check
      CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED','ARCHIVED'));
  END IF;
END
$$;

COMMENT ON COLUMN hr_sop_documents.status IS
  'DRAFT is editable and invisible to readers; PUBLISHED is the only state that asks for signatures; SUPERSEDED is retired by a newer version; ARCHIVED is withdrawn without a replacement.';

CREATE INDEX IF NOT EXISTS hr_sop_documents_company_status_idx
  ON hr_sop_documents (company_id, status);
CREATE INDEX IF NOT EXISTS hr_sop_documents_category_idx
  ON hr_sop_documents (company_id, category);

-- The link to the newer version is added after the table exists, because a version can
-- supersede a row that was created after it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_sop_documents_superseded_by_id_fkey'
  ) THEN
    ALTER TABLE hr_sop_documents
      ADD CONSTRAINT hr_sop_documents_superseded_by_id_fkey
      FOREIGN KEY (superseded_by_id) REFERENCES hr_sop_documents(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS hr_sop_questions (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  sop_id integer NOT NULL REFERENCES hr_sop_documents(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_index integer NOT NULL,
  explanation text,
  question_order integer NOT NULL DEFAULT 1,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_sop_questions_sop_idx
  ON hr_sop_questions (sop_id, question_order);

CREATE TABLE IF NOT EXISTS hr_sop_readers (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  sop_id integer NOT NULL REFERENCES hr_sop_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_at timestamp NOT NULL DEFAULT now()
);

-- The set of people a version was issued to. Coverage is measured against this list,
-- never against "everyone employed", because accounts are not linked to staff records.
CREATE UNIQUE INDEX IF NOT EXISTS hr_sop_readers_sop_user_key
  ON hr_sop_readers (sop_id, user_id);
CREATE INDEX IF NOT EXISTS hr_sop_readers_sop_idx
  ON hr_sop_readers (sop_id);

CREATE TABLE IF NOT EXISTS hr_sop_acknowledgements (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  sop_id integer NOT NULL REFERENCES hr_sop_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  signature_name text NOT NULL,
  exam_score numeric(5,2),
  exam_passed boolean,
  acknowledged_at timestamp NOT NULL DEFAULT now()
);

-- One signature per person per version. Re-signing must not silently move the date.
CREATE UNIQUE INDEX IF NOT EXISTS hr_sop_acknowledgements_sop_user_key
  ON hr_sop_acknowledgements (sop_id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_sop_acknowledgements_score_check'
  ) THEN
    ALTER TABLE hr_sop_acknowledgements
      ADD CONSTRAINT hr_sop_acknowledgements_score_check
      CHECK (exam_score IS NULL OR (exam_score >= 0 AND exam_score <= 100));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS hr_sop_acknowledgements_company_idx
  ON hr_sop_acknowledgements (company_id, user_id);

-- Two of these columns point at users(id), and PostgreSQL can only build a foreign key
-- against a unique key - users has no primary key in this database (see 0076). The
-- columns and their unique indexes are real now; these constraints attach themselves as
-- soon as the primary key exists, so re-running this file after 0076 completes the
-- intent instead of leaving a permanent hole in it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'p') THEN
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
  END IF;
END
$$;

COMMIT;

-- Rollback:
--   DROP TABLE IF EXISTS hr_sop_acknowledgements;
--   DROP TABLE IF EXISTS hr_sop_readers;
--   DROP TABLE IF EXISTS hr_sop_questions;
--   DROP TABLE IF EXISTS hr_sop_documents;
