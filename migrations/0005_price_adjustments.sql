CREATE TABLE IF NOT EXISTS "price_adjustments" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "variation_id" integer,
  "old_price" numeric(10, 2) NOT NULL,
  "new_price" numeric(10, 2) NOT NULL,
  "reason" text,
  "effective_from" timestamp DEFAULT now(),
  "created_by" uuid,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_variation_id_product_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."product_variations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_adj_company_id_idx" ON "price_adjustments" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_adj_product_id_idx" ON "price_adjustments" USING btree ("product_id");
