-- Roles, permissions, and approval workflow tables

CREATE TABLE IF NOT EXISTS "company_roles" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "description" text,
  "is_system" boolean DEFAULT false,
  "legacy_role" text,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "company_roles_company_name_unique" UNIQUE("company_id", "name")
);

CREATE INDEX IF NOT EXISTS "company_roles_company_id_idx" ON "company_roles" ("company_id");

CREATE TABLE IF NOT EXISTS "company_role_permissions" (
  "role_id" integer NOT NULL REFERENCES "company_roles"("id") ON DELETE CASCADE,
  "permission" text NOT NULL,
  CONSTRAINT "company_role_permissions_role_id_permission_pk" PRIMARY KEY("role_id", "permission")
);

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "payload" jsonb NOT NULL,
  "reference_type" text,
  "reference_id" text,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "review_notes" text,
  "result_data" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "approval_requests_company_status_idx" ON "approval_requests" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "approval_requests_type_idx" ON "approval_requests" ("type");

ALTER TABLE "company_users" ADD COLUMN IF NOT EXISTS "company_role_id" integer REFERENCES "company_roles"("id");
