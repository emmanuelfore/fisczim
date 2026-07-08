import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function main() {
  try {
    console.log("Creating manufacturing MRP tables...");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "manufacturing_mrp_runs" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "date" timestamp DEFAULT now() NOT NULL,
        "status" text DEFAULT 'COMPLETED' NOT NULL,
        "notes" text
      );
    `);
    console.log("Created manufacturing_mrp_runs");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "manufacturing_material_shortages" (
        "id" serial PRIMARY KEY NOT NULL,
        "mrp_run_id" integer REFERENCES "manufacturing_mrp_runs"("id"),
        "product_id" integer NOT NULL REFERENCES "products"("id"),
        "shortage_quantity" numeric(15,4) NOT NULL,
        "required_date" date,
        "status" text DEFAULT 'UNRESOLVED' NOT NULL
      );
    `);
    console.log("Created manufacturing_material_shortages");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "manufacturing_mrp_recommendations" (
        "id" serial PRIMARY KEY NOT NULL,
        "mrp_run_id" integer NOT NULL REFERENCES "manufacturing_mrp_runs"("id"),
        "product_id" integer NOT NULL REFERENCES "products"("id"),
        "type" text NOT NULL,
        "quantity" numeric(15,4) NOT NULL,
        "required_date" date,
        "status" text DEFAULT 'PENDING' NOT NULL,
        "reference_id" integer
      );
    `);
    console.log("Created manufacturing_mrp_recommendations");

    console.log("Done!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

main();
