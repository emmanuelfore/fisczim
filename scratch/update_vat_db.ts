import { db } from "../server/db";
import { products, taxTypes } from "../shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    try {
        console.log("Updating tax_types with rate 15.00 to 15.50...");
        await db.update(taxTypes)
            .set({ rate: "15.50" })
            .where(eq(taxTypes.rate, "15.00"));
        
        console.log("Updating products with taxRate 15.00 to 15.50...");
        await db.update(products)
            .set({ taxRate: "15.50" })
            .where(eq(products.taxRate, "15.00"));

        console.log("Database updated successfully.");
    } catch (e) {
        console.error("Error updating database:", e);
    } finally {
        process.exit(0);
    }
}

run();
