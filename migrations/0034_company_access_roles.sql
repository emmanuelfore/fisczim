CREATE TABLE IF NOT EXISTS "company_access_roles" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "description" text,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_access_roles_company_name_idx"
  ON "company_access_roles" ("company_id", "name");
CREATE INDEX IF NOT EXISTS "company_access_roles_company_idx"
  ON "company_access_roles" ("company_id");

ALTER TABLE "company_users"
  ADD COLUMN IF NOT EXISTS "access_role_id" integer REFERENCES "company_access_roles"("id");

CREATE INDEX IF NOT EXISTS "company_users_access_role_idx"
  ON "company_users" ("access_role_id");
