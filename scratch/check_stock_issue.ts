import { db } from '../server/db';
import { products, inventoryTransactions, branchStocks, inventoryLocationStocks } from '../shared/schema';
import { eq, or, sql } from 'drizzle-orm';

async function main() {
  const codes = ['344317', '688634'];
  const targetProducts = await db.select().from(products).where(
    or(
      ...codes.map(c => sql`CAST(${products.id} AS TEXT) = ${c}`),
      ...codes.map(c => sql`${products.sku} ILIKE ${'%' + c + '%'}`),
      ...codes.map(c => sql`${products.name} ILIKE ${'%' + c + '%'}`),
      ...codes.map(c => sql`${products.barcode} ILIKE ${'%' + c + '%'}`),
      ...codes.map(c => sql`${products.description} ILIKE ${'%' + c + '%'}`)
    )
  );

  console.log('Found Products:', targetProducts.map(p => ({ id: p.id, code: p.code, sku: p.sku, name: p.name })));

  for (const product of targetProducts) {
    console.log(`\n--- Product ${product.id} (${product.name} | SKU: ${product.sku} | Code: ${product.code}) ---`);
    const branchStock = await db.select().from(branchStocks).where(eq(branchStocks.productId, product.id));
    console.log('Branch Stocks:', branchStock);

    const locStock = await db.select().from(inventoryLocationStocks).where(eq(inventoryLocationStocks.productId, product.id));
    console.log('Location Stocks:', locStock);

    const txs = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.productId, product.id));
    console.log(`Inventory Transactions (${txs.length}):`);
    let calcStock = 0;
    for (const tx of txs) {
      console.log(`  [${tx.type}] qty: ${tx.quantity} date: ${tx.createdAt} id: ${tx.id} reference: ${tx.referenceId}`);
      // Since tx.quantity is already signed in some systems or unsigned in others, let's just add it.
      calcStock += Number(tx.quantity);
    }
    console.log(`Calculated Stock from TX: ${calcStock}`);
  }
  process.exit(0);
}
main().catch(console.error);
