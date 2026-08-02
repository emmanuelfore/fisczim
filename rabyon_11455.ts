import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, invoices } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    try {
        const inv = (await db.select().from(invoices).where(eq(invoices.id, 11455)))[0];
        console.log("INVOICE #11455:", JSON.stringify({
            num: inv.invoiceNumber, status: inv.status, createdAt: inv.createdAt?.toISOString(),
            issueDate: inv.issueDate?.toISOString(), fiscalDayNo: inv.fiscalDayNo,
            globalNo: inv.receiptGlobalNo, counter: inv.receiptCounter, val: inv.validationStatus,
            fdms: inv.fdmsStatus, fiscalSig: !!inv.fiscalSignature, offlineDate: inv.offlineDate?.toISOString(),
            synced: inv.syncedWithFdms, submissionId: inv.submissionId,
        }, null, 2));

        const logs = await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, 11455)).orderBy(zimraLogs.createdAt);
        console.log(`\nLOGS (${logs.length}):`);
        for (const l of logs) {
            console.log(`--- ${l.createdAt?.toISOString()} ${l.endpoint} status=${l.statusCode} err=${l.errorMessage ?? "-"}`);
            if (l.endpoint === "Invoice Submission" || l.endpoint === "SubmitReceipt") {
                const req: any = l.requestPayload;
                console.log("  global=", req?.receipt?.receiptGlobalNo, "counter=", req?.receipt?.receiptCounter, "day=", req?.receipt?.fiscalDayNo, "date=", req?.receipt?.receiptDate);
                const resp: any = l.responsePayload;
                console.log("  resp:", resp?.validationErrors ? resp.validationErrors.map((e: any) => `${e.validationErrorCode}:${e.validationErrorColor}`).join(",") : JSON.stringify(resp)?.slice(0, 150));
            }
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
