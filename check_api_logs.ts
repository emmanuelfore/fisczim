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

async function checkApiLogs() {
    try {
        console.log("Checking API logs table and data...");
        
        // Check if api_logs table exists
        const tableCheck = await db.execute(sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'api_logs'
            );
        `);
        
        console.log("\nAPI logs table exists:", tableCheck.rows[0].exists);
        
        if (tableCheck.rows[0].exists) {
            // Check table structure
            const columns = await db.execute(sql`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'api_logs'
                ORDER BY ordinal_position;
            `);
            
            console.log("\nAPI logs table structure:");
            console.log(columns.rows);
            
            // Check for recent data
            const recentLogs = await db.execute(sql`
                SELECT COUNT(*) as count, 
                       MAX(created_at) as latest_log,
                       company_id
                FROM api_logs 
                WHERE created_at > NOW() - INTERVAL '24 hours'
                GROUP BY company_id
                ORDER BY latest_log DESC
                LIMIT 10
            `);
            
            console.log("\nRecent API logs (last 24 hours):");
            console.log(recentLogs.rows);
            
            // Check total count
            const totalCount = await db.execute(sql`
                SELECT COUNT(*) as total_count FROM api_logs;
            `);
            
            console.log("\nTotal API logs in database:", totalCount.rows[0].total_count);
            
            // Get some sample data if available
            if (parseInt(totalCount.rows[0].total_count) > 0) {
                const sampleLogs = await db.execute(sql`
                    SELECT * FROM api_logs 
                    ORDER BY created_at DESC 
                    LIMIT 5
                `);
                
                console.log("\nSample API logs:");
                console.log(JSON.stringify(sampleLogs.rows, null, 2));
            }
        } else {
            console.log("\n❌ API logs table does not exist!");
            console.log("This is why you're not seeing any logs in the API Logs menu.");
        }
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}

checkApiLogs();