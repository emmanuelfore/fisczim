import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "bank_rules" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "name" text NOT NULL,
        "priority" integer DEFAULT 0 NOT NULL,
        "apply_to" text DEFAULT 'ALL' NOT NULL,
        "conditions" jsonb NOT NULL,
        "action_type" text NOT NULL,
        "target_account_id" integer REFERENCES "accounts"("id"),
        "tax_type_id" integer REFERENCES "tax_types"("id"),
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("Table created successfully");
  } catch (err) {
    console.error("Failed:", err);
  }
  process.exit(0);
}
run();
