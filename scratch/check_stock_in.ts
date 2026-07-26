import "dotenv/config";
import { db } from "../server/db.js";
import { inventoryTransactions } from "../shared/schema.js";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const txns = await db.select().from(inventoryTransactions).where(inArray(inventoryTransactions.type, ["STOCK_IN", "ADJUSTMENT"])).limit(5);
  console.log(txns.map(t => ({ type: t.type, qty: t.quantity })));
  process.exit(0);
}
main().catch(console.error);
