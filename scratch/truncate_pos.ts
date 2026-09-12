import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  try {
    console.log("Truncating purchase_order_items and purchase_orders...");
    await db.execute(sql`TRUNCATE TABLE purchase_order_items, purchase_orders CASCADE;`);
    console.log("Truncation successful.");
  } catch (err: any) {
    console.error("Error truncating:", err.message);
  }
  process.exit(0);
}

main();
