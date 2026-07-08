import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function check() {
    const res = await db.execute(sql`
        SELECT id, endpoint, request_payload, response_payload, created_at 
        FROM zimra_logs 
        WHERE company_id = 80 
        ORDER BY created_at DESC 
        LIMIT 5
    `);
    
    for (const row of res.rows || res) {
        console.log(`\n--- Log ${row.id} at ${row.created_at} ---`);
        console.log(`Endpoint: ${row.endpoint}`);
        console.log(`Req: ${JSON.stringify(row.request_payload).substring(0, 300)}...`);
        console.log(`Res: ${JSON.stringify(row.response_payload).substring(0, 300)}...`);
    }
    process.exit(0);
}

check();
