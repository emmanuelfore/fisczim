import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
    try {
        // FAST DIRECT SQL
        // 1. Remove dots from hs_code
        await db.execute(sql`UPDATE products SET hs_code = REPLACE(hs_code, '.', '') WHERE company_id = 91 AND hs_code LIKE '%.%';`);
        
        // 2. Ensure productType is "good"
        await db.execute(sql`UPDATE products SET product_type = 'good' WHERE company_id = 91 AND product_type != 'good';`);
        
        // 3. Update tax rates using regex in SQL
        // Zero Rated Commodities
        await db.execute(sql`
            UPDATE products 
            SET tax_rate = '0.00', tax_type_id = 175
            WHERE company_id = 91 AND (
                name ILIKE '%sugar%' OR name ILIKE '%oil%' OR name ILIKE '%mealie%' OR 
                name ILIKE '%flour%' OR name ILIKE '%rice%' OR name ILIKE '%maize%' OR 
                name ILIKE '%salt%' OR name ILIKE '%meat%' OR name ILIKE '%beef%' OR 
                name ILIKE '%chicken%' OR name ILIKE '%fish%' OR name ILIKE '%matemba%' OR 
                name ILIKE '%kapenta%' OR name ILIKE '%chunks%' OR name ILIKE '%eggs%' OR 
                name ILIKE '%apple%' OR name ILIKE '%banana%' OR name ILIKE '%tomato%' OR 
                name ILIKE '%onion%' OR name ILIKE '%lemon%' OR name ILIKE '%potato%' OR 
                name ILIKE '%cabbage%' OR name ILIKE '%milk%' OR name ILIKE '%chimombe%'
            );
        `);
        
        // Standard VAT for the rest
        await db.execute(sql`
            UPDATE products 
            SET tax_rate = '15.50', tax_type_id = 194
            WHERE company_id = 91 AND tax_type_id != 175 AND name NOT ILIKE 'TEST%';
        `);
        
        console.log("Direct SQL updates completed instantly.");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
