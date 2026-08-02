import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    for (const invId of [11389, 11392]) {
        const logs = await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, invId)).orderBy(zimraLogs.createdAt);
        for (const l of logs) {
            if (l.statusCode !== 200) continue;
            const r: any = l.requestPayload;
            console.log(`[${l.createdAt?.toISOString()}] inv=${invId} ${l.endpoint} ${l.statusCode}`);
            console.log(JSON.stringify(r, null, 1));
        }
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
