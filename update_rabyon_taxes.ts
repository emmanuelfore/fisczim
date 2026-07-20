import { db } from "./server/db";
import { products, taxTypes } from "./shared/schema";
import { eq, and } from "drizzle-orm";

async function run() {
    try {
        // Find the standard VAT tax type for company 91
        const standardVat = await db.select().from(taxTypes).where(
            and(
                eq(taxTypes.companyId, 91),
                eq(taxTypes.code, "VAT-515")
            )
        ).limit(1);

        if (standardVat.length === 0) {
            console.error("Standard VAT tax type not found for Rabyon!");
            process.exit(1);
        }

        const taxTypeId = standardVat[0].id;
        const taxRate = standardVat[0].rate;

        // Update all products for company 91
        await db.update(products)
            .set({
                productType: "good",
                taxTypeId: taxTypeId,
                taxRate: taxRate
            })
            .where(eq(products.companyId, 91));

        console.log(`Successfully updated products to 'good' and set tax to Standard VAT (Rate: ${taxRate}, ID: ${taxTypeId}).`);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
