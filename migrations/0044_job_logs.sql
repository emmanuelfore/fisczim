CREATE TABLE IF NOT EXISTS "job_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration" integer,
	"result_data" jsonb,
	"error_data" jsonb,
	"company_id" integer,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_logs_job_name_idx" ON "job_logs" USING btree ("job_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_logs_status_idx" ON "job_logs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_logs_started_at_idx" ON "job_logs" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_logs_company_id_idx" ON "job_logs" USING btree ("company_id");
