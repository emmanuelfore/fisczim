import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, invoices } from "./shared/schema";
import { inArray } from "drizzle-orm";

async function run() {
    const invs = await db.select().from(invoices).where(inArray(invoices.id, [11478, 11479, 11480, 11481]));
    const logs = await db.select().from(zimraLogs).where(inArray(zimraLogs.invoiceId, [11478, 11479]));
    const invById: Record<number, any> = {};
    for (const i of invs) invById[i.id] = i;

    for (const l of logs) {
        const req: any = l.requestPayload;
        const receipt = req?.receipt;
        const inv = invById[l.invoiceId];
        console.log(`inv=${l.invoiceId}`);
        console.log(`  issueDate(DB)      = ${inv.issueDate?.toISOString()}`);
        console.log(`  offlineDate(DB)    = ${inv.offlineDate ?? "null"}`);
        console.log(`  payload receiptDate= ${receipt?.receiptDate}`);
        console.log(`  payload fiscalDay  = ${receipt?.fiscalDayNo}  global=${receipt?.receiptGlobalNo} counter=${receipt?.receiptCounter}`);
        console.log(`  payload taxes      = ${JSON.stringify(receipt?.receiptTaxes)}`);
        console.log(`  payload total      = ${receipt?.receiptTotal}`);
        console.log(`  payload prevHash?  = ${JSON.stringify(req?.receipt?.receiptDeviceSignature?.hash ?? "none")}`);
        console.log(`  stored fiscalSig   = ${String(inv.fiscalSignature).slice(0, 30)}...`);
        console.log(`  company lastFiscalHash = ${String((inv as any).lastFiscalHash)?.slice(0, 30)}`);
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
