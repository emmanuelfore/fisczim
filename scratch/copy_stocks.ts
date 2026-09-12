import { eq, and, sql } from "drizzle-orm";
import { db } from "../server/db";
import { products, inventoryTransactions } from "../shared/schema";
import "dotenv/config";

async function main() {
    const oldCompanyId = 87;
    const newCompanyId = 94; // Platchem

    console.log(`Copying stock from company ${oldCompanyId} to ${newCompanyId}...`);

    // 1. Get products in new company
    const newProducts = await db.select().from(products).where(eq(products.companyId, newCompanyId));
    console.log(`Found ${newProducts.length} products in new company.`);

    for (const newProd of newProducts) {
        // Find matching product in old company
        const [oldProd] = await db.select().from(products).where(
            and(
                eq(products.companyId, oldCompanyId),
                eq(products.name, newProd.name)
            )
        );

        if (!oldProd) {
            console.log(`Could not find old product match for: ${newProd.name}`);
            continue;
        }

        // Calculate old stock level
        let stockToCopy = "0.00";
        if (oldProd.isTracked) {
            const result = await db.select({
                stock: sql<string>`COALESCE(SUM(${inventoryTransactions.quantity}), '0')`
            })
            .from(inventoryTransactions)
            .where(eq(inventoryTransactions.productId, oldProd.id));
            
            stockToCopy = result[0]?.stock || "0.00";
        } else {
            stockToCopy = oldProd.stockLevel || "0.00";
        }

        const stockNum = Number(stockToCopy);
        
        if (stockNum > 0 || stockNum < 0) {
            console.log(`Copying stock ${stockToCopy} for ${newProd.name}...`);
            
            // 1. Update product stock level cache
            await db.update(products)
                .set({ stockLevel: stockToCopy })
                .where(eq(products.id, newProd.id));
                
            // 2. Insert transaction if tracked
            if (newProd.isTracked) {
                await db.insert(inventoryTransactions).values({
                    companyId: newCompanyId,
                    productId: newProd.id,
                    type: "ADJUSTMENT",
                    quantity: stockToCopy,
                    referenceType: "MANUAL",
                    notes: "Initial balance transferred from parent company"
                } as any);
            }
        } else {
            console.log(`Stock is 0 for ${newProd.name}, skipping.`);
        }
    }

    console.log("Stock copy complete.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
