-- 0078_crm_pipeline_and_activities.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0078_crm_pipeline_and_activities.sql
--
-- WHY THIS EXISTS
-- 0077 gave the CRM two tables (enquiries, enquiry_follow_ups). This extends it
-- towards Odoo-CRM parity with the pieces that genuinely need storage:
--
--   crm_stages         configurable per-company pipeline (name, order, probability,
--                      won/lost flags) - replaces the hardcoded status list and
--                      drives the weighted forecast
--   enquiries          + stage, expected revenue/close date, lost reason, tags,
--                      UTM attribution, quotation link, last-activity stamp
--   enquiry_activities the "Chatter" trail: notes, calls, stage and assignment
--                      changes, quotation creation, merges - one row per event
--
-- Deliberately NOT stored: reporting is derived at read time, and the sale loop
-- reuses the existing `quotations` table rather than duplicating it.
--
-- Reversible: the rollback at the bottom drops both new tables, their indexes and
-- the added columns.

BEGIN;

-- 1. Configurable pipeline stages.
CREATE TABLE IF NOT EXISTS "crm_stages" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "sequence" integer NOT NULL DEFAULT 0,
  "probability" integer NOT NULL DEFAULT 0,
  "is_won" boolean NOT NULL DEFAULT false,
  "is_lost" boolean NOT NULL DEFAULT false,
  "color" text DEFAULT 'slate',
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "crm_stages_company_idx" ON "crm_stages" ("company_id");

-- 2. Seed a sensible default pipeline for every existing company exactly once.
INSERT INTO "crm_stages" ("company_id", "name", "sequence", "probability", "is_won", "is_lost", "color")
SELECT c."id", s."name", s."sequence", s."probability", s."is_won", s."is_lost", s."color"
FROM "companies" c
CROSS JOIN (VALUES
  ('New',       0,  10, false, false, 'slate'),
  ('Contacted', 1,  30, false, false, 'blue'),
  ('Qualified', 2,  50, false, false, 'amber'),
  ('Proposal',  3,  70, false, false, 'violet'),
  ('Won',       4, 100, true,  false, 'emerald'),
  ('Lost',      5,   0, false, true,  'rose')
) AS s("name", "sequence", "probability", "is_won", "is_lost", "color")
WHERE NOT EXISTS (SELECT 1 FROM "crm_stages" cs WHERE cs."company_id" = c."id");

-- 3. Extend enquiries.
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "stage_id" integer REFERENCES "crm_stages"("id");
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "lost_reason" text;
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "expected_revenue" numeric(15,2) DEFAULT '0.00';
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "expected_close_date" date;
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "utm_source" text;
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "utm_medium" text;
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "utm_campaign" text;
-- The quotation link ships without its REFERENCES clause: shared/schema.ts declares
-- `serial("id").primaryKey()` on quotations, but the live table has no primary key, and
-- Postgres only lets a foreign key point at a unique key. 0080 declares that key and
-- attaches enquiries_quotation_id_fkey, the same way 0074 and 0075 shipped columns and
-- left 0076 to add their constraints afterwards.
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "quotation_id" integer;
ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp DEFAULT now();

ALTER TABLE "enquiries" ALTER COLUMN "status" SET DEFAULT 'open';

CREATE INDEX IF NOT EXISTS "enquiries_stage_idx" ON "enquiries" ("stage_id");

-- 4. Backfill: map the old status values onto the new default stages.
UPDATE "enquiries" e
SET "stage_id" = st."id",
    "status" = CASE WHEN st."is_won" THEN 'won' WHEN st."is_lost" THEN 'lost' ELSE 'open' END
FROM "crm_stages" st
WHERE st."company_id" = e."company_id"
  AND e."stage_id" IS NULL
  AND st."name" = CASE e."status"
      WHEN 'won' THEN 'Won'
      WHEN 'lost' THEN 'Lost'
      WHEN 'contacted' THEN 'Contacted'
      WHEN 'qualified' THEN 'Qualified'
      ELSE 'New' END;

-- Anything still unplaced lands on the opening stage.
UPDATE "enquiries" e
SET "stage_id" = st."id"
FROM "crm_stages" st
WHERE st."company_id" = e."company_id"
  AND st."name" = 'New'
  AND e."stage_id" IS NULL;

UPDATE "enquiries" SET "last_activity_at" = COALESCE("updated_at", "created_at", now())
WHERE "last_activity_at" IS NULL;

-- 5. Chatter trail.
CREATE TABLE IF NOT EXISTS "enquiry_activities" (
  "id" serial PRIMARY KEY,
  "enquiry_id" integer NOT NULL REFERENCES "enquiries"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "body" text,
  "metadata" jsonb,
  "user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "enquiry_activities_enquiry_idx" ON "enquiry_activities" ("enquiry_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TABLE IF EXISTS "enquiry_activities";
-- The constraint belongs to 0080, but it hangs off this column, so it goes first.
-- ALTER TABLE "enquiries" DROP CONSTRAINT IF EXISTS "enquiries_quotation_id_fkey";
-- ALTER TABLE "enquiries"
--   DROP COLUMN IF EXISTS "stage_id",
--   DROP COLUMN IF EXISTS "lost_reason",
--   DROP COLUMN IF EXISTS "tags",
--   DROP COLUMN IF EXISTS "expected_revenue",
--   DROP COLUMN IF EXISTS "expected_close_date",
--   DROP COLUMN IF EXISTS "utm_source",
--   DROP COLUMN IF EXISTS "utm_medium",
--   DROP COLUMN IF EXISTS "utm_campaign",
--   DROP COLUMN IF EXISTS "quotation_id",
--   DROP COLUMN IF EXISTS "last_activity_at";
-- DROP TABLE IF EXISTS "crm_stages";
-- COMMIT;
