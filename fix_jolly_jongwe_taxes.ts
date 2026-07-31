import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const db = drizzle(pool);

async function fixJollyJongweTaxes() {
    try {
        const companyId = 28; // JOLLY JONGWE MEATS (PVT) LTD
        
        console.log(`Fixing tax classification for JOLLY JONGWE MEATS (PVT) LTD (Company ID: ${companyId})...`);
        
        // First, check current tax types for this company
        const taxTypes = await db.execute(sql`
            SELECT id, name, rate, zimra_tax_id 
            FROM tax_types 
            WHERE company_id = ${companyId} OR company_id IS NULL
            ORDER BY id
        `);
        
        console.log("\nAvailable Tax Types:");
        console.log(taxTypes.rows);
        
        // Check current product tax classifications
        const currentProducts = await db.execute(sql`
            SELECT id, name, tax_rate, tax_type_id, category 
            FROM products 
            WHERE company_id = ${companyId}
            ORDER BY name
            LIMIT 20
        `);
        
        console.log("\nCurrent Product Tax Classifications (sample):");
        console.log(currentProducts.rows);
        
        // Get tax type IDs for standard-rated (usually 15.5%)
        const standardTax = await db.execute(sql`
            SELECT id, name, rate 
            FROM tax_types 
            WHERE (company_id = ${companyId} OR company_id IS NULL)
            AND (rate = '15.50' OR rate = '15.5' OR rate = '15')
            ORDER BY company_id DESC NULLS LAST
            LIMIT 1
        `);
        
        if (standardTax.rows.length === 0) {
            console.error("Standard VAT tax type not found for this company!");
            process.exit(1);
        }
        
        const standardTaxId = standardTax.rows[0].id;
        const standardTaxRate = standardTax.rows[0].rate;
        console.log(`\nUsing Standard VAT Tax Type: ID ${standardTaxId}, Rate ${standardTaxRate}`);
        
        // Update ALL products for this company to use standard-rated tax
        const result = await db.execute(sql`
            UPDATE products 
            SET tax_rate = ${standardTaxRate}, tax_type_id = ${standardTaxId}
            WHERE company_id = ${companyId}
        `);
        
        console.log(`\nUpdated ${result.rowCount} products to standard-rated tax (${standardTaxRate}%)`);
        
        // Verify the changes
        const updatedProducts = await db.execute(sql`
            SELECT id, name, tax_rate, tax_type_id, category 
            FROM products 
            WHERE company_id = ${companyId}
            ORDER BY name
            LIMIT 20
        `);
        
        console.log("\nUpdated Product Tax Classifications (sample):");
        console.log(updatedProducts.rows);
        
        console.log("\n✅ Successfully updated all JOLLY JONGWE MEATS products to standard-rated tax");
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}

fixJollyJongweTaxes();