import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs } from "./shared/schema";
import { eq, gte, asc, and } from "drizzle-orm";

async function run() {
    const logs = await db.select().from(zimraLogs)
        .where(and(eq(zimraLogs.companyId, 91), eq(zimraLogs.endpoint, "Invoice Submission"), gte(zimraLogs.createdAt, new Date("2026-08-01T16:12:20Z"))))
        .orderBy(asc(zimraLogs.createdAt));
    console.log(`Submissions after 16:12:20Z: ${logs.length}`);
    for (const l of logs) {
        const r: any = l.requestPayload;
        const resp: any = l.responsePayload;
        const ve = resp?.validationErrors ? resp.validationErrors.map((e: any) => `${e.validationErrorCode || e.errorCode}:${e.validationErrorColor}`).join(", ") : "(none)";
        console.log(`[${l.createdAt?.toISOString()}] inv=${l.invoiceId} ${l.statusCode} g=${r?.receipt?.receiptGlobalNo} c=${r?.receipt?.receiptCounter} total=${r?.receipt?.receiptTotal} VE=[${ve}]`);
        if (r?.receipt?.receiptTaxes) console.log("  taxes:", JSON.stringify(r.receipt.receiptTaxes));
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
