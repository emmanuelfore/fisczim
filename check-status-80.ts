import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function check() {
    const res = await db.execute(sql`
        SELECT id, endpoint, response_payload, created_at 
        FROM zimra_logs 
        WHERE company_id = 80 AND endpoint IN ('Status', 'GetStatus', 'Sync Config')
        ORDER BY created_at DESC 
        LIMIT 5
    `);
    
    for (const row of res.rows || res) {
        let payload: any = {};
        try { payload = typeof row.response_payload === 'string' ? JSON.parse(row.response_payload) : row.response_payload; } catch(e){}
        console.log(`Log ${row.id}: GlobalNo=${payload?.lastReceiptGlobalNo}, DayNo=${payload?.lastFiscalDayNo}, Status=${payload?.fiscalDayStatus}`);
    }
    process.exit(0);
}

check();
