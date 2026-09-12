import { db } from "./server/db";
import { products } from "./shared/schema";
import { eq, like } from "drizzle-orm";

async function run() {
    try {
        const companyProducts = await db.select({
            id: products.id,
            hsCode: products.hsCode
        }).from(products)
          .where(eq(products.companyId, 91));
        
        let updatedCount = 0;
        
        for (const product of companyProducts) {
            if (product.hsCode && product.hsCode.includes('.')) {
                const newHsCode = product.hsCode.replace(/\./g, '');
                
                await db.update(products)
                    .set({ hsCode: newHsCode })
                    .where(eq(products.id, product.id));
                    
                updatedCount++;
            }
        }
        
        console.log(`Successfully removed dots from ${updatedCount} HS codes.`);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
