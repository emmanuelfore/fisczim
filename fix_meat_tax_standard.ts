import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function fixMeatTaxStandard() {
    try {
        console.log("Fixing meat products to use standard-rated tax instead of zero-rated/exempt...");
        
        // Update meat products to use standard VAT rate
        // This removes meat from the zero-rated category and sets it to standard-rated
        const result = await db.execute(sql`
            UPDATE products 
            SET tax_rate = '15.50', tax_type_id = 194
            WHERE company_id = 91 AND (
                name ILIKE '%meat%' OR name ILIKE '%beef%' OR 
                name ILIKE '%chicken%' OR name ILIKE '%fish%' OR 
                name ILIKE '%matemba%' OR name ILIKE '%kapenta%' OR 
                name ILIKE '%chunks%'
            );
        `);
        
        console.log(`Updated ${result.rowCount} meat products to standard-rated tax (15.50%)`);
        
        // Verify the changes
        const meatProducts = await db.execute(sql`
            SELECT id, name, tax_rate, tax_type_id, category 
            FROM products 
            WHERE company_id = 91 AND (
                name ILIKE '%meat%' OR name ILIKE '%beef%' OR 
                name ILIKE '%chicken%' OR name ILIKE '%fish%' OR 
                name ILIKE '%matemba%' OR name ILIKE '%kapenta%' OR 
                name ILIKE '%chunks%'
            )
            ORDER BY name
            LIMIT 20
        `);
        
        console.log("\nSample of updated meat products:");
        console.log(meatProducts.rows);
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}

fixMeatTaxStandard();