-- Commercial partners for co-branded / revenue-sharing invoices

CREATE TABLE IF NOT EXISTS "company_partners" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "trading_name" text,
  "logo_url" text,
  "tin" text,
  "vat_number" text,
  "display_label" text DEFAULT 'In partnership with',
  "default_revenue_share_percent" numeric(5, 2) DEFAULT '0',
  "owner_group_match" text,
  "is_active" boolean DEFAULT true,
  "notes" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "company_partners_company_id_idx" ON "company_partners" ("company_id");

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "partnership_settings" jsonb;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "partner_id" integer REFERENCES "company_partners"("id");
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "partner_snapshot" jsonb;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "revenue_share_percent" numeric(5, 2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "partner_share_amount" numeric(10, 2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "issuer_share_amount" numeric(10, 2);
