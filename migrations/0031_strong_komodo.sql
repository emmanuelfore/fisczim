ALTER TABLE "goods_delivery_note_items" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_delivery_notes" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE "stock_transfers" ALTER COLUMN "dispatched_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "goods_delivery_note_items" ADD COLUMN "account_code" text;--> statement-breakpoint
ALTER TABLE "goods_delivery_note_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "goods_delivery_note_items" ADD COLUMN "unit_cost" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "goods_delivery_note_items" ADD COLUMN "tax_type_id" integer;--> statement-breakpoint
ALTER TABLE "goods_delivery_note_items" ADD COLUMN "tax_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_delivery_note_items" ADD COLUMN "tax_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_delivery_note_items" ADD COLUMN "is_recoverable" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "goods_delivery_notes" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "goods_delivery_notes" ADD COLUMN "tax_inclusive" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "tax_type_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "tax_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "tax_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "is_recoverable" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "tax_inclusive" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "quantity_damaged" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "quantity_lost" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "batch_number" text;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "expiry_date" timestamp;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "transit_cost" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "transit_cost_currency" text DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "freight_carrier" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "vehicle_reg" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "variance_reason" text;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "supplier_invoice_items" ADD COLUMN "account_code" text;--> statement-breakpoint
ALTER TABLE "supplier_invoice_items" ADD COLUMN "tax_type_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoice_items" ADD COLUMN "is_recoverable" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "goods_delivery_note_items" ADD CONSTRAINT "goods_delivery_note_items_tax_type_id_tax_types_id_fk" FOREIGN KEY ("tax_type_id") REFERENCES "public"."tax_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tax_type_id_tax_types_id_fk" FOREIGN KEY ("tax_type_id") REFERENCES "public"."tax_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_tax_type_id_tax_types_id_fk" FOREIGN KEY ("tax_type_id") REFERENCES "public"."tax_types"("id") ON DELETE no action ON UPDATE no action;