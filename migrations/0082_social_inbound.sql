-- 0082_social_inbound.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0082_social_inbound.sql
--   (after 0077_crm_enquiries.sql and 0081_social_connections.sql)
--
-- WHY THIS EXISTS
-- A Meta lead-form submission and a comment on a page post are not enquiries yet.
-- They are third-party rows that a person reading the CRM decides to capture, so
-- they land here first and only grow an enquiry_id once someone clicks. That also
-- keeps junk - a duplicate submission, a troll comment, a lead for a page another
-- tenant owns - out of the pipeline.
--
-- Both tables are unique per company on the platform's own id (external_lead_id,
-- external_comment_id). That is what makes a replayed or retried webhook - both
-- platforms retry aggressively - land exactly once, while still letting an agency
-- and its client each keep a copy of a submission from a page they both linked.
--
-- Requires 0077: enquiry_id references enquiries(id), which 0077 creates with its
-- primary key. Refusing to run without it beats a confusing foreign-key error.
--
-- Reversible: the rollback at the bottom drops both tables and their indexes.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.enquiries') IS NULL THEN
    RAISE EXCEPTION 'public.enquiries is missing - apply 0077_crm_enquiries.sql before this file';
  END IF;
  IF to_regclass('public.social_connections') IS NULL THEN
    RAISE EXCEPTION 'public.social_connections is missing - apply 0081_social_connections.sql before this file';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "social_leads" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "platform" text NOT NULL,
  "external_lead_id" text NOT NULL,
  "external_account_id" text,
  "form_id" text,
  "form_name" text,
  "ad_id" text,
  "campaign_name" text,
  "full_name" text,
  "phone" text,
  "email" text,
  "answers" jsonb,
  "enquiry_id" integer REFERENCES "enquiries"("id") ON DELETE SET NULL,
  "ignored_at" timestamp,
  "created_on_platform_at" timestamp,
  "received_at" timestamp DEFAULT now(),
  CONSTRAINT "social_leads_company_lead_id_idx" UNIQUE ("company_id", "platform", "external_lead_id")
);

CREATE INDEX IF NOT EXISTS "social_leads_company_idx" ON "social_leads" ("company_id");
CREATE INDEX IF NOT EXISTS "social_leads_enquiry_idx" ON "social_leads" ("enquiry_id");

CREATE TABLE IF NOT EXISTS "social_comments" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "platform" text NOT NULL,
  "external_account_id" text,
  "post_id" text NOT NULL,
  "post_permalink" text,
  "external_comment_id" text NOT NULL,
  "parent_comment_id" text,
  "from_name" text,
  "from_external_id" text,
  "message" text,
  "likes" integer DEFAULT 0,
  "enquiry_id" integer REFERENCES "enquiries"("id") ON DELETE SET NULL,
  "ignored_at" timestamp,
  "created_on_platform_at" timestamp,
  "received_at" timestamp DEFAULT now(),
  CONSTRAINT "social_comments_company_comment_id_idx" UNIQUE ("company_id", "platform", "external_comment_id")
);

CREATE INDEX IF NOT EXISTS "social_comments_company_idx" ON "social_comments" ("company_id");
CREATE INDEX IF NOT EXISTS "social_comments_enquiry_idx" ON "social_comments" ("enquiry_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TABLE IF EXISTS "social_comments";
-- DROP TABLE IF EXISTS "social_leads";
-- COMMIT;
