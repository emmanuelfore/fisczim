ALTER TABLE "consignments" ADD COLUMN IF NOT EXISTS "tracking_url" text;
ALTER TABLE "consignments" ADD COLUMN IF NOT EXISTS "container_number" text;
ALTER TABLE "consignments" ADD COLUMN IF NOT EXISTS "flight_number" text;
ALTER TABLE "consignments" ADD COLUMN IF NOT EXISTS "insurance_cost" numeric(15, 2) DEFAULT '0.00';
ALTER TABLE "consignments" ADD COLUMN IF NOT EXISTS "customs_duty" numeric(15, 2) DEFAULT '0.00';
ALTER TABLE "consignments" ADD COLUMN IF NOT EXISTS "handling_charges" numeric(15, 2) DEFAULT '0.00';

ALTER TABLE "freight_forwarders" ADD COLUMN IF NOT EXISTS "supported_shipping_methods" text[];
ALTER TABLE "freight_forwarders" ADD COLUMN IF NOT EXISTS "default_currency" text DEFAULT 'USD';
ALTER TABLE "freight_forwarders" ADD COLUMN IF NOT EXISTS "notes" text;

CREATE TABLE IF NOT EXISTS "consignment_purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"consignment_id" integer NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);

DO $$ BEGIN
 ALTER TABLE "consignment_purchase_orders" ADD CONSTRAINT "cpo_consignment_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "consignment_purchase_orders" ADD CONSTRAINT "cpo_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
