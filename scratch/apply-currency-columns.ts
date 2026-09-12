import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function applyChanges() {
  const runSQL = async (query: string) => {
    try {
      console.log(`Executing: ${query}`);
      await db.execute(sql.raw(query));
      console.log("Success");
    } catch (e: any) {
      console.log(`Failed/Skipped: ${e.message}`);
    }
  };

  // Add currency to purchase_orders
  await runSQL(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD'`);

  // Add currency to goods_delivery_notes
  await runSQL(`ALTER TABLE goods_delivery_notes ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD'`);

  console.log("Migration check completed!");
  process.exit(0);
}

applyChanges();
