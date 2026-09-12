import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres",
  ssl: {
    rejectUnauthorized: false
  }
});

const db = drizzle(pool);

async function runMigration() {
    try {
        console.log("Running migration 0048_add_correction_period_settings.sql...");
        
        // Add correction period and fiscal day staleness settings to companies table
        await db.execute(sql`
            ALTER TABLE companies 
            ADD COLUMN IF NOT EXISTS correction_period_months INTEGER DEFAULT 12,
            ADD COLUMN IF NOT EXISTS fiscal_day_staleness_hours INTEGER DEFAULT 24
        `);
        console.log("✅ Added correction_period_months and fiscal_day_staleness_hours to companies table");
        
        // Add same settings to branches table for override capability
        await db.execute(sql`
            ALTER TABLE branches 
            ADD COLUMN IF NOT EXISTS correction_period_months INTEGER,
            ADD COLUMN IF NOT EXISTS fiscal_day_staleness_hours INTEGER
        `);
        console.log("✅ Added correction_period_months and fiscal_day_staleness_hours to branches table");
        
        // Add comments for documentation
        await db.execute(sql`
            COMMENT ON COLUMN companies.correction_period_months IS 'Number of months allowed for credit/debit note corrections (default 12)'
        `);
        await db.execute(sql`
            COMMENT ON COLUMN companies.fiscal_day_staleness_hours IS 'Hours before a fiscal day is considered stale (default 24)'
        `);
        await db.execute(sql`
            COMMENT ON COLUMN branches.correction_period_months IS 'Override company correction period at branch level'
        `);
        await db.execute(sql`
            COMMENT ON COLUMN branches.fiscal_day_staleness_hours IS 'Override company fiscal day staleness threshold at branch level'
        `);
        console.log("✅ Added column comments");
        
        // Verify the changes
        const companyColumns = await db.execute(sql`
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_name = 'companies' 
            AND column_name IN ('correction_period_months', 'fiscal_day_staleness_hours')
            ORDER BY ordinal_position
        `);
        
        console.log("\n📋 Companies table new columns:");
        console.log(companyColumns.rows);
        
        const branchColumns = await db.execute(sql`
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_name = 'branches' 
            AND column_name IN ('correction_period_months', 'fiscal_day_staleness_hours')
            ORDER BY ordinal_position
        `);
        
        console.log("\n📋 Branches table new columns:");
        console.log(branchColumns.rows);
        
        console.log("\n✅ Migration 0048 completed successfully!");
        
    } catch (e) {
        console.error("❌ Migration failed:", e);
    } finally {
        process.exit(0);
    }
}

runMigration();