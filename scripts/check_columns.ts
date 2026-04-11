import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Checking columns for inventory_transactions...");
  const result = await db.execute(sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions';
  `);
  console.log("Columns in inventory_transactions:", JSON.stringify(result.rows.map(r => r.column_name), null, 2));
  process.exit(0);
}

main();
