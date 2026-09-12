import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    const logs = await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, 11478));
    for (const l of logs) {
        console.log("ENDPOINT:", l.endpoint, l.statusCode, l.createdAt?.toISOString());
        console.log(JSON.stringify(l.requestPayload, null, 1));
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
