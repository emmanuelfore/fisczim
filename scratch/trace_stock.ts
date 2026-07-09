import { db } from '../server/db';
import { inventoryTransactions, stockTakes, stockTakeItems, goodsDeliveryNotes } from '../shared/schema';
import { eq, inArray } from 'drizzle-orm';

async function main() {
  const txs = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.productId, 6742));
  
  for (const tx of txs) {
    console.log(`[${tx.type}] Qty: ${tx.quantity} | Date: ${tx.createdAt} | Ref: ${tx.referenceId}`);
    
    // Check if it's a stock take adjustment
    if (tx.type === 'ADJUSTMENT' && tx.referenceId) {
      // Trying to find what referenceId 17 is
      console.log(`Checking reference 17 for adjustment...`);
    }
    // Check if it's a GRV
    if (tx.type === 'STOCK_IN' && tx.referenceId?.startsWith('GRV')) {
      console.log(`Checking GRV reference...`);
    }
  }
  process.exit(0);
}
main().catch(console.error);
