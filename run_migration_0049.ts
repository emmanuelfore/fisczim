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
        console.log("Running migration 0049_add_api_log_details.sql...");
        
        // Add response time, IP address, and user agent columns to api_logs table
        await db.execute(sql`
            ALTER TABLE api_logs 
            ADD COLUMN IF NOT EXISTS response_time_ms INTEGER,
            ADD COLUMN IF NOT EXISTS ip_address TEXT,
            ADD COLUMN IF NOT EXISTS user_agent TEXT
        `);
        console.log("✅ Added response_time_ms, ip_address, and user_agent columns");
        
        // Make JSON fields nullable to handle cases where they might not be available
        await db.execute(sql`
            ALTER TABLE api_logs 
            ALTER COLUMN request_payload DROP NOT NULL,
            ALTER COLUMN response_payload DROP NOT NULL
        `);
        console.log("✅ Made request_payload and response_payload nullable");
        
        // Add comments for documentation
        await db.execute(sql`
            COMMENT ON COLUMN api_logs.response_time_ms IS 'Response time in milliseconds'
        `);
        await db.execute(sql`
            COMMENT ON COLUMN api_logs.ip_address IS 'Client IP address'
        `);
        await db.execute(sql`
            COMMENT ON COLUMN api_logs.user_agent IS 'Client user agent string'
        `);
        console.log("✅ Added column comments");
        
        // Verify the changes
        const columns = await db.execute(sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'api_logs'
            ORDER BY ordinal_position
        `);
        
        console.log("\n📋 Updated api_logs table structure:");
        console.log(columns.rows);
        
        console.log("\n✅ Migration 0049 completed successfully!");
        
    } catch (e) {
        console.error("❌ Migration failed:", e);
    } finally {
        process.exit(0);
    }
}

runMigration();