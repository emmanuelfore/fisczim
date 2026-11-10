-- 0081_social_connections.sql
--
-- Apply with:
--   node scripts/run-single-migration.mjs migrations/0081_social_connections.sql
--
-- WHY THIS EXISTS
-- Inbound social capture needs to know which page, Instagram account or TikTok
-- advertiser belongs to which tenant, because a platform delivery carries no
-- session - only the platform's own account id. That lookup is this table: the
-- webhook resolves the tenant from it, and a payload for an account nobody has
-- linked is dropped rather than guessed at.
--
-- access_token, app_secret and webhook_token are written through
-- server/lib/vault.ts (AES-256-GCM, COMPANY_VAULT_KEY) so they are not readable
-- in a database dump, and decryptField() tolerates a plain value for any row an
-- operator had to insert by hand. NULL is legal for all three: a connection can
-- exist as a routing entry before anyone has pasted credentials, but a delivery
-- that cannot be authenticated against an app_secret is not ingested.
--
-- Reversible: the rollback at the bottom drops the table and its indexes.

BEGIN;

CREATE TABLE IF NOT EXISTS "social_connections" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "platform" text NOT NULL,
  "external_account_id" text NOT NULL,
  "account_name" text,
  "access_token" text,
  "token_expires_at" timestamp,
  "app_id" text,
  "app_secret" text,
  "webhook_token" text,
  "last_sync_at" timestamp,
  "last_error" text,
  "active" boolean NOT NULL DEFAULT true,
  "connected_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "social_connections_company_platform_account_idx"
    UNIQUE ("company_id", "platform", "external_account_id")
);

CREATE INDEX IF NOT EXISTS "social_connections_company_idx" ON "social_connections" ("company_id");

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TABLE IF EXISTS "social_connections";
-- COMMIT;
