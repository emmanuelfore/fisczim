import "dotenv/config";
import { db } from "./server/db";
import { invoices, zimraLogs } from "./shared/schema";
import { eq, and, inArray } from "drizzle-orm";

async function run() {
    const ids = [11456, 11457, 11458, 11464];
    const invs = await db.select().from(invoices).where(inArray(invoices.id, ids));
    const byId: Record<number, any> = {};
    for (const i of invs) byId[i.id] = i;
    const logs = await db.select().from(zimraLogs).where(and(inArray(zimraLogs.invoiceId, ids), eq(zimraLogs.endpoint, "Invoice Submission")));
    for (const l of logs) {
        const req: any = l.requestPayload;
        const sig = req?.receipt?.receiptDeviceSignature?.signature;
        const inv = byId[l.invoiceId];
        const stored = inv?.fiscalSignature;
        console.log(`inv=${l.invoiceId} ${l.createdAt?.toISOString()}`);
        console.log(`  submittedSig=${String(sig).slice(0,40)}...`);
        console.log(`  storedSig   =${String(stored).slice(0,40)}...`);
        console.log(`  MATCH=${sig === stored}  taxes=[${req?.receipt?.receiptTaxes?.map((t:any)=>`${t.taxCode}:${t.taxID}:${t.taxPercent}`).join("|")}]`);
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
