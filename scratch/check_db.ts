import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  try {
    const res = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'stock_transfers' AND column_name IN ('transit_cost', 'transit_cost_currency');
    `);
    console.log("Columns found:", res.rows);
  } catch (err: any) {
    console.error("Error checking columns:", err.message);
  }
  process.exit(0);
}

main();
