-- Zoho Books automation: connection credentials + fiscal event audit log
CREATE TABLE IF NOT EXISTS "zoho_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"org_id" text NOT NULL,
	"region" text DEFAULT 'com' NOT NULL,
	"api_root" text DEFAULT 'https://www.zohoapis.com/books/v3' NOT NULL,
	"accounts_server" text DEFAULT 'https://accounts.zoho.com' NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"token_expires_at" timestamp,
	"webhook_token" text NOT NULL,
	"webhook_secret" text,
	"settings" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "zoho_connections_webhook_token_unique" UNIQUE("webhook_token")
);
--> statement-breakpoint
ALTER TABLE "zoho_connections" DROP CONSTRAINT IF EXISTS "zoho_connections_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "zoho_connections" ADD CONSTRAINT "zoho_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "zoho_connections_company_org_idx" ON "zoho_connections" USING btree ("company_id","org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zoho_connections_company_id_idx" ON "zoho_connections" USING btree ("company_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "zoho_fiscal_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"org_id" text NOT NULL,
	"zoho_invoice_id" text NOT NULL,
	"invoice_number" text,
	"status" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zoho_fiscal_events" DROP CONSTRAINT IF EXISTS "zoho_fiscal_events_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "zoho_fiscal_events" ADD CONSTRAINT "zoho_fiscal_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zoho_fiscal_events_invoice_idx" ON "zoho_fiscal_events" USING btree ("zoho_invoice_id","company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zoho_fiscal_events_status_idx" ON "zoho_fiscal_events" USING btree ("status");
