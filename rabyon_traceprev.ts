import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs } from "./shared/schema";
import { eq, lt, asc, and } from "drizzle-orm";

async function run() {
    const target = "ixEQXFI9vg8hQAxM";
    const prior = await db.select().from(zimraLogs)
        .where(and(eq(zimraLogs.companyId, 91), lt(zimraLogs.createdAt, new Date("2026-08-01T14:31:01Z"))))
        .orderBy(asc(zimraLogs.createdAt));
    for (const l of prior) {
        const r: any = l.requestPayload;
        const h = r?.receipt?.receiptDeviceSignature?.hash;
        if (h && h.startsWith(target)) {
            console.log(`MATCH: inv=${l.invoiceId} at=${l.createdAt?.toISOString()} g=${r?.receipt?.receiptGlobalNo} c=${r?.receipt?.receiptCounter} hash=${h}`);
        }
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
