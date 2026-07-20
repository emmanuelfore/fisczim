import { db } from "./server/db";
import { products } from "./shared/schema";
import { eq } from "drizzle-orm";

const zeroRatedKeywords = [
    // Staples & Basics
    /sugar/i, /oil/i, /mealie/i, /flour/i, /rice/i, /maize/i, /salt/i,
    // Proteins
    /meat/i, /beef/i, /chicken/i, /fish/i, /matemba/i, /kapenta/i, /chunks/i, /eggs/i,
    // Fruits & Veggies
    /apple/i, /banana/i, /tomato/i, /onion/i, /lemon/i, /potato/i, /cabbage/i,
    // Dairy
    /milk/i, /chimombe/i
];

async function run() {
    try {
        const companyProducts = await db.select({
            id: products.id,
            name: products.name,
            hsCode: products.hsCode
        }).from(products).where(eq(products.companyId, 91));
        
        let updatedCount = 0;
        
        for (const product of companyProducts) {
            // Test products skipping
            if (product.name.startsWith("TEST")) continue;

            let isZeroRated = false;
            for (const regex of zeroRatedKeywords) {
                if (regex.test(product.name)) {
                    isZeroRated = true;
                    break;
                }
            }

            // Standard VAT = ID 194 (15.5%), Zero Rated = ID 175 (0%)
            const taxTypeId = isZeroRated ? 175 : 194;
            const taxRate = isZeroRated ? "0.00" : "15.50";

            // Strip dots from HS code
            const cleanHsCode = product.hsCode ? product.hsCode.replace(/\./g, '') : null;

            await db.update(products)
                .set({
                    productType: "good",
                    taxTypeId: taxTypeId,
                    taxRate: taxRate,
                    hsCode: cleanHsCode
                })
                .where(eq(products.id, product.id));
                
            updatedCount++;
        }
        
        console.log(`Successfully processed ${updatedCount} products. Assigned Zero-Rate to basic commodities and Standard VAT to others.`);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
