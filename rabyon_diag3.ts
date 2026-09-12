import "dotenv/config";
import { db } from "./server/db";
import { invoices, invoiceItems, companies, branches } from "./shared/schema";
import { eq, inArray, and } from "drizzle-orm";

const COMPANY_ID = 91;
const TARGET = [11377, 11378];

async function run() {
    try {
        const c = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
        console.log("=== COMPANY COUNTERS ===");
        console.log("lastReceiptGlobalNo:", c.lastReceiptGlobalNo, "dailyReceiptCount:", c.dailyReceiptCount, "fiscalDayOpen:", c.fiscalDayOpen, "currentFiscalDayNo:", c.currentFiscalDayNo, "lastFiscalDayStatus:", c.lastFiscalDayStatus);

        const br = await db.select().from(branches).where(eq(branches.companyId, COMPANY_ID));
        for (const b of br) {
            console.log(`branch #${b.id} ${b.name}: lastGlobal=${b.lastReceiptGlobalNo} daily=${b.dailyReceiptCount} dayOpen=${b.fiscalDayOpen} dayNo=${b.currentFiscalDayNo}`);
        }

        const invRows = await db.select().from(invoices).where(inArray(invoices.id, TARGET));
        for (const inv of invRows) {
            console.log(`\n=== #${inv.id} ${inv.invoiceNumber} ===`);
            console.log("branchId:", inv.branchId, "created:", inv.createdAt?.toISOString(), "issueDate:", inv.issueDate?.toISOString(), "status:", inv.status);
            console.log("receiptGlobalNo:", inv.receiptGlobalNo, "receiptCounter:", inv.receiptCounter, "fiscalDayNo:", inv.fiscalDayNo, "fdmsStatus:", inv.fdmsStatus, "validationStatus:", inv.validationStatus, "lastValidationAttempt:", inv.lastValidationAttempt?.toISOString(), "submissionId:", inv.submissionId, "syncedWithFdms:", inv.syncedWithFdms, "isFiscalized:", inv.isFiscalized);
            console.log("items:");
            const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
            for (const it of items) {
                console.log(`  qty=${it.quantity} price=${it.unitPrice} lineTotal=${it.lineTotal} rate=${it.taxRate} taxTypeId=${it.taxTypeId} desc="${it.description?.slice(0, 45)}"`);
            }
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
