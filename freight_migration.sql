CREATE TABLE IF NOT EXISTS "freight_forwarders" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "consignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"forwarder_id" integer NOT NULL,
	"supplier_id" integer,
	"reference_number" text NOT NULL,
	"shipping_method" text NOT NULL,
	"status" text DEFAULT 'PENDING',
	"dispatch_date" timestamp,
	"expected_arrival_date" timestamp,
	"actual_arrival_date" timestamp,
	"destination_location_id" integer,
	"shipping_cost" numeric(15, 2) DEFAULT '0.00',
	"currency" text DEFAULT 'USD',
	"delay_notes" text,
	"created_at" timestamp DEFAULT now()
);

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "original_language_name" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "original_language_code" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "translation_verified" boolean DEFAULT false;

DO $$ BEGIN
 ALTER TABLE "freight_forwarders" ADD CONSTRAINT "freight_forwarders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "consignments" ADD CONSTRAINT "consignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "consignments" ADD CONSTRAINT "consignments_forwarder_id_freight_forwarders_id_fk" FOREIGN KEY ("forwarder_id") REFERENCES "public"."freight_forwarders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "consignments" ADD CONSTRAINT "consignments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "consignments" ADD CONSTRAINT "consignments_destination_location_id_inventory_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
