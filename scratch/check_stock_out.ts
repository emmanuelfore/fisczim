import "dotenv/config";
import { db } from "../server/db.js";
import { inventoryTransactions } from "../shared/schema.js";
import { eq, isNotNull } from "drizzle-orm";

async function main() {
  const txns = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.type, "STOCK_OUT")).limit(5);
  console.log(txns.map(t => t.quantity));
  process.exit(0);
}
main().catch(console.error);
