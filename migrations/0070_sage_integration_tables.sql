CREATE TABLE IF NOT EXISTS "sage_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"sage_business_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sage_connections" DROP CONSTRAINT IF EXISTS "sage_connections_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "sage_connections" ADD CONSTRAINT "sage_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sage_connections_company_id_idx" ON "sage_connections" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sage_connections_sage_business_id_idx" ON "sage_connections" USING btree ("sage_business_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sage_fiscal_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"origin_id" text NOT NULL,
	"company_id" integer NOT NULL,
	"status" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sage_fiscal_events" DROP CONSTRAINT IF EXISTS "sage_fiscal_events_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "sage_fiscal_events" ADD CONSTRAINT "sage_fiscal_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sage_fiscal_events_origin_company_idx" ON "sage_fiscal_events" USING btree ("origin_id","company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sage_fiscal_events_status_idx" ON "sage_fiscal_events" USING btree ("status");