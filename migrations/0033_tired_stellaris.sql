ALTER TABLE "financial_periods" ADD COLUMN "ar_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "ap_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "inventory_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD COLUMN "bank_closed" boolean DEFAULT false NOT NULL;