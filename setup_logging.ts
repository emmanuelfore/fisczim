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

async function setupLogging() {
    try {
        console.log("Checking current API logging configuration...");
        
        // Check if there are any recent ZIMRA logs in the database
        const recentLogs = await db.execute(sql`
            SELECT COUNT(*) as count, 
                   MAX(created_at) as latest_log,
                   company_id
            FROM zimra_logs 
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY company_id
            ORDER BY latest_log DESC
            LIMIT 10
        `);
        
        console.log("\nRecent ZIMRA logs (last 24 hours):");
        console.log(recentLogs.rows);
        
        // Check recent API request logs if they exist
        try {
            const auditLogs = await db.execute(sql`
                SELECT COUNT(*) as count, 
                       MAX(created_at) as latest_log,
                       action_type
                FROM audit_logs 
                WHERE created_at > NOW() - INTERVAL '24 hours'
                GROUP BY action_type
                ORDER BY latest_log DESC
                LIMIT 10
            `);
            
            console.log("\nRecent audit logs (last 24 hours):");
            console.log(auditLogs.rows);
        } catch (e) {
            console.log("\nNo audit logs table found or error querying it");
        }
        
        console.log("\n=== Logging Configuration Instructions ===");
        console.log("To enable API logging, set these environment variables:");
        console.log("API_RESPONSE_LOGS=1  # Enables detailed API response logging");
        console.log("POS_VERBOSE_LOGS=1   # Enables verbose POS/fiscalization logs");
        console.log("\nCurrent environment variables:");
        console.log("API_RESPONSE_LOGS:", process.env.API_RESPONSE_LOGS || "NOT SET");
        console.log("POS_VERBOSE_LOGS:", process.env.POS_VERBOSE_LOGS || "NOT SET");
        console.log("NODE_ENV:", process.env.NODE_ENV || "NOT SET");
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}

setupLogging();