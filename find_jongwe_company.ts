import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function findJongweCompany() {
    try {
        // Find all companies
        const companies = await db.execute(sql`
            SELECT id, name, vat_number 
            FROM companies 
            ORDER BY name
        `);
        
        console.log("All Companies:");
        console.log(companies.rows);
        
        // Search for "jongwe" specifically
        const jongweCompanies = await db.execute(sql`
            SELECT id, name, vat_number 
            FROM companies 
            WHERE name ILIKE '%jongwe%'
        `);
        
        console.log("\nCompanies with 'jongwe' in name:");
        console.log(jongweCompanies.rows);
        
        // Get tax types for company 91 (Rabyon) to understand tax type IDs
        const taxTypes = await db.execute(sql`
            SELECT id, name, rate, zimra_tax_id 
            FROM tax_types 
            WHERE company_id = 91 OR company_id IS NULL
            ORDER BY id
        `);
        
        console.log("\nTax Types for company 91:");
        console.log(taxTypes.rows);
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}

findJongweCompany();