import "dotenv/config";
import { db } from "./server/db";
import { invoices } from "./shared/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";

async function run() {
    try {
        const rows = await db.select({
            id: invoices.id, num: invoices.invoiceNumber, fiscal: invoices.fiscalCode,
            val: invoices.validationStatus, fdms: invoices.fdmsStatus, globalNo: invoices.receiptGlobalNo,
            dayNo: invoices.fiscalDayNo, date: invoices.issueDate, total: invoices.total, submissionId: invoices.submissionId,
        }).from(invoices).where(
            and(eq(invoices.companyId, 91), isNotNull(invoices.fiscalCode), inArray(invoices.validationStatus, ["invalid", "red"]))
        ).orderBy(invoices.id);

        console.log(`Fiscalized with red/invalid validation: ${rows.length}`);
        for (const r of rows) {
            console.log(`#${r.id} ${r.num} day=${r.dayNo} globalNo=${r.globalNo} val=${r.val} fdms=${r.fdms} total=${r.total} sub=${r.submissionId ?? "-"} date=${r.date?.toISOString()}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
