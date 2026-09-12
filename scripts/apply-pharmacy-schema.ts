import { db } from "../server/db.js";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Applying pharmacy schema changes...");
  await db.execute(sql`ALTER TABLE "product_variations" ADD COLUMN IF NOT EXISTS "base_unit_multiplier" numeric DEFAULT '1'`);
  await db.execute(sql`ALTER TABLE "product_batches" ADD COLUMN IF NOT EXISTS "manufacturing_date" timestamp`);
  console.log("Done.");
  process.exit(0);
}

run();
