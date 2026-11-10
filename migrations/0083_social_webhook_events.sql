-- 0083_social_webhook_events.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0083_social_webhook_events.sql
--   (after 0081_social_connections.sql and 0082_social_inbound.sql)
--
-- WHY THIS EXISTS
-- Facebook and TikTok both retry a delivery they are not sure we took, and a
-- delivery that fails its signature check is dropped in silence. When a client
-- says "our lead form is not reaching your CRM" there is currently nothing to
-- point at: the console lines are gone and the inbox is empty either way.
--
-- This table keeps one row per delivery per connection it was routed to, with
-- the signature outcome, what the payload claimed, what was actually stored and
-- a short reason when nothing was. A tenant reads their own rows only, so a
-- page id never appears in another company's CRM.
--
-- Nothing here is authoritative - the leads and comments tables stay the source
-- of truth - so a row is written for a delivery we can attribute to a company,
-- and a payload naming no linked account is rejected before it reaches this
-- table. That keeps an unauthenticated caller from growing it.
--
-- Requires 0081: connection_id references social_connections(id).
--
-- Reversible: the rollback at the bottom drops the table and its indexes.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.social_connections') IS NULL THEN
    RAISE EXCEPTION 'public.social_connections is missing - apply 0081_social_connections.sql before this file';
  END IF;
  IF to_regclass('public.social_leads') IS NULL THEN
    RAISE EXCEPTION 'public.social_leads is missing - apply 0082_social_inbound.sql before this file';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "social_webhook_events" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "connection_id" integer REFERENCES "social_connections"("id") ON DELETE SET NULL,
  "platform" text NOT NULL,
  "external_account_id" text,
  "signed" boolean NOT NULL,
  "leads_seen" integer NOT NULL DEFAULT 0,
  "comments_seen" integer NOT NULL DEFAULT 0,
  "leads_stored" integer NOT NULL DEFAULT 0,
  "comments_stored" integer NOT NULL DEFAULT 0,
  "reason" text,
  "received_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "social_webhook_events_company_idx" ON "social_webhook_events" ("company_id", "received_at");
CREATE INDEX IF NOT EXISTS "social_webhook_events_connection_idx" ON "social_webhook_events" ("connection_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TABLE IF EXISTS "social_webhook_events";
-- COMMIT;
