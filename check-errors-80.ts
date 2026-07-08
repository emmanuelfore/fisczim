import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function check() {
    const res = await db.execute(sql`
        SELECT id, invoice_id, error_code, error_message, created_at
        FROM validation_errors
        WHERE invoice_id IN (8898, 8899, 8900, 8901)
        ORDER BY created_at DESC 
    `);
    
    for (const row of res.rows || res) {
        console.log(`Log ${row.id}: Invoice ${row.invoice_id} | Code: ${row.error_code} | Msg: ${row.error_message}`);
    }
    process.exit(0);
}

check();
