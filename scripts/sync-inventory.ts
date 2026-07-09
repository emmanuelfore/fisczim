import { db } from "../server/db";
import {
  inventoryTransactions,
  inventoryLocationStocks,
  branchStocks,
  products,
  inventoryLocations
} from "../shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

async function main() {
  console.log("Starting inventory synchronization...");

  await db.transaction(async (tx) => {
    // 1. Fix missing locationIds in historical transactions
    console.log("Fixing missing locationIds in inventoryTransactions...");
    await tx.execute(sql`
      UPDATE inventory_transactions it
      SET location_id = COALESCE(
        (SELECT id FROM inventory_locations il WHERE il.company_id = it.company_id AND il.branch_id = it.branch_id LIMIT 1),
        (SELECT id FROM inventory_locations il WHERE il.company_id = it.company_id AND il.is_default_receiving = true LIMIT 1),
        (SELECT id FROM inventory_locations il WHERE il.company_id = it.company_id AND il.type = 'WAREHOUSE' LIMIT 1),
        (SELECT id FROM inventory_locations il WHERE il.company_id = it.company_id LIMIT 1)
      )
      WHERE location_id IS NULL;
    `);
    console.log("Fixed missing locationIds.");

    // 2. Clear out current cached totals
    console.log("Clearing cached inventory totals...");
    await tx.delete(inventoryLocationStocks);
    await tx.delete(branchStocks);
    await tx.update(products).set({ stockLevel: "0" });

    // 3. Aggregate all transactions by locationId and productId
    console.log("Aggregating true stock levels from transaction ledger...");
    const stockAggregates = await tx
      .select({
        locationId: inventoryTransactions.locationId,
        productId: inventoryTransactions.productId,
        totalQuantity: sql<string>`coalesce(sum(${inventoryTransactions.quantity}::numeric), 0)`,
      })
      .from(inventoryTransactions)
      .groupBy(inventoryTransactions.locationId, inventoryTransactions.productId);

    console.log(`Found ${stockAggregates.length} unique location-product combinations.`);

    // 4. Repopulate inventoryLocationStocks
    const locInserts = [];
    for (const agg of stockAggregates) {
      if (!agg.locationId || !agg.productId) continue;
      locInserts.push({
        locationId: agg.locationId,
        productId: agg.productId,
        stockLevel: agg.totalQuantity,
        availableQuantity: agg.totalQuantity,
        reservedQuantity: "0",
      });
    }

    if (locInserts.length > 0) {
      console.log("Inserting recalculated inventoryLocationStocks...");
      const chunkSize = 1000;
      for (let i = 0; i < locInserts.length; i += chunkSize) {
        await tx.insert(inventoryLocationStocks).values(locInserts.slice(i, i + chunkSize));
      }
    }

    // 5. Repopulate branchStocks based on locations
    console.log("Repopulating branchStocks...");
    await tx.execute(sql`
      INSERT INTO branch_stocks (branch_id, product_id, stock_level)
      SELECT il.branch_id, ils.product_id, SUM(ils.stock_level::numeric)
      FROM inventory_location_stocks ils
      JOIN inventory_locations il ON il.id = ils.location_id
      WHERE il.branch_id IS NOT NULL
      GROUP BY il.branch_id, ils.product_id
    `);

    // 6. Repopulate products.stockLevel globally
    console.log("Repopulating products.stockLevel globally...");
    await tx.execute(sql`
      UPDATE products p
      SET stock_level = agg.total
      FROM (
        SELECT product_id, SUM(stock_level::numeric) as total
        FROM inventory_location_stocks
        GROUP BY product_id
      ) agg
      WHERE p.id = agg.product_id;
    `);

    console.log("Inventory synchronization completed successfully.");
  });
  
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed to synchronize inventory:", error);
  process.exit(1);
});
