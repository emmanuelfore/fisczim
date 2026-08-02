import "dotenv/config";
import { db } from "./server/db";
import { invoices, zimraLogs } from "./shared/schema";
import { eq, inArray } from "drizzle-orm";

async function run() {
    const ids = [11478, 11479, 11480, 11481];
    const invs = await db.select().from(invoices).where(inArray(invoices.id, ids));
    const logs = await db.select().from(zimraLogs).where(inArray(zimraLogs.invoiceId, ids));
    const byId: Record<number, any> = {};
    for (const i of invs) byId[i.id] = i;
    for (const l of logs) {
        if (l.endpoint !== "Invoice Submission") continue;
        const req: any = l.requestPayload;
        const submitted = req?.receipt?.receiptDeviceSignature?.signature;
        const stored = byId[l.invoiceId]?.fiscalSignature;
        const hash = req?.receipt?.receiptDeviceSignature?.hash;
        const storedHash = byId[l.invoiceId]?.receiptDeviceSignature || byId[l.invoiceId]?.fiscalCode;
        console.log(`inv=${l.invoiceId} submittedSig==storedSig: ${submitted === stored} | payloadHash vs stored: ${String(hash).slice(0,12)} / ${String(byId[l.invoiceId]?.receiptDeviceSignature).slice(0,12)}`);
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
