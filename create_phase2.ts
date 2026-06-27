import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Running Phase 2 raw SQL...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "manufacturing_production_schedules" (
      "id" serial PRIMARY KEY NOT NULL,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "start_date" date NOT NULL,
      "end_date" date NOT NULL,
      "status" text DEFAULT 'DRAFT' NOT NULL,
      "created_at" timestamp DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "manufacturing_production_schedule_lines" (
      "id" serial PRIMARY KEY NOT NULL,
      "schedule_id" integer NOT NULL REFERENCES "manufacturing_production_schedules"("id"),
      "work_order_id" integer NOT NULL REFERENCES "work_orders"("id"),
      "planned_start_date" timestamp,
      "planned_end_date" timestamp
    );

    CREATE TABLE IF NOT EXISTS "manufacturing_material_reservations" (
      "id" serial PRIMARY KEY NOT NULL,
      "work_order_id" integer NOT NULL REFERENCES "work_orders"("id"),
      "product_id" integer NOT NULL REFERENCES "products"("id"),
      "quantity_reserved" numeric(15, 4) NOT NULL,
      "status" text DEFAULT 'RESERVED' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "manufacturing_mrp_runs" (
      "id" serial PRIMARY KEY NOT NULL,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "date" timestamp DEFAULT now() NOT NULL,
      "status" text DEFAULT 'COMPLETED' NOT NULL,
      "notes" text
    );

    CREATE TABLE IF NOT EXISTS "manufacturing_material_shortages" (
      "id" serial PRIMARY KEY NOT NULL,
      "mrp_run_id" integer REFERENCES "manufacturing_mrp_runs"("id"),
      "product_id" integer NOT NULL REFERENCES "products"("id"),
      "shortage_quantity" numeric(15, 4) NOT NULL,
      "required_date" date,
      "status" text DEFAULT 'UNRESOLVED' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "manufacturing_mrp_recommendations" (
      "id" serial PRIMARY KEY NOT NULL,
      "mrp_run_id" integer NOT NULL REFERENCES "manufacturing_mrp_runs"("id"),
      "product_id" integer NOT NULL REFERENCES "products"("id"),
      "type" text NOT NULL,
      "quantity" numeric(15, 4) NOT NULL,
      "required_date" date,
      "status" text DEFAULT 'PENDING' NOT NULL,
      "reference_id" integer
    );
  `);
  console.log("Phase 2 SQL executed successfully!");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
