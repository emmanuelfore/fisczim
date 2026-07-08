import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function check() {
    const res = await db.execute(sql`
        SELECT endpoint, created_at 
        FROM zimra_logs 
        WHERE company_id = 80 
        ORDER BY created_at ASC 
    `);
    
    for (const row of res.rows || res) {
        console.log(`Endpoint: ${row.endpoint} at ${row.created_at}`);
    }
    process.exit(0);
}

check();
