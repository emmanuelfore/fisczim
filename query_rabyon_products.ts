import { db } from "./server/db";
import { products } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    try {
        const companyProducts = await db.select({
            id: products.id,
            name: products.name,
            category: products.category,
            productType: products.productType,
            hsCode: products.hsCode
        }).from(products).where(eq(products.companyId, 91));
        
        console.log("Rabyon Products:", JSON.stringify(companyProducts, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
