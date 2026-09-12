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

async function findJollyJongwe() {
    try {
        // Find companies with "jolly" in the name
        const jollyCompanies = await db.execute(sql`
            SELECT id, name, vat_number 
            FROM companies 
            WHERE name ILIKE '%jolly%'
        `);
        
        console.log("Companies with 'jolly' in name:");
        console.log(jollyCompanies.rows);
        
        // Find companies with "jongwe" in the name
        const jongweCompanies = await db.execute(sql`
            SELECT id, name, vat_number 
            FROM companies 
            WHERE name ILIKE '%jongwe%'
        `);
        
        console.log("\nCompanies with 'jongwe' in name:");
        console.log(jongweCompanies.rows);
        
        // Find companies with "meat" in the name
        const meatCompanies = await db.execute(sql`
            SELECT id, name, vat_number 
            FROM companies 
            WHERE name ILIKE '%meat%'
        `);
        
        console.log("\nCompanies with 'meat' in name:");
        console.log(meatCompanies.rows);
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}

findJollyJongwe();