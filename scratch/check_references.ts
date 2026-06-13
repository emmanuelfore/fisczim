import "dotenv/config";
import { db } from "../server/db.js";
import { inventoryLocations, inventoryLocationStocks, inventoryTransactions, stockTransfers } from "../shared/schema.js";
import { eq, or } from "drizzle-orm";

async function run() {
  try {
    const ids = [5, 6, 7, 8, 9, 10];
    
    for (const id of ids) {
      console.log(`Checking ID ${id}...`);
      
      const stocks = await db
        .select()
        .from(inventoryLocationStocks)
        .where(eq(inventoryLocationStocks.locationId, id));
      if (stocks.length > 0) {
        console.log(`  Stocks:`, JSON.stringify(stocks, null, 2));
      }
      
      const txs = await db
        .select()
        .from(inventoryTransactions)
        .where(eq(inventoryTransactions.locationId, id));
      if (txs.length > 0) {
        console.log(`  Transactions count:`, txs.length);
      }
      
      const transfersFrom = await db
        .select()
        .from(stockTransfers)
        .where(eq(stockTransfers.fromLocationId, id));
      if (transfersFrom.length > 0) {
        console.log(`  Stock Transfers From count:`, transfersFrom.length);
      }
      
      const transfersTo = await db
        .select()
        .from(stockTransfers)
        .where(eq(stockTransfers.toLocationId, id));
      if (transfersTo.length > 0) {
        console.log(`  Stock Transfers To count:`, transfersTo.length);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

run();
