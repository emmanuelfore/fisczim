import "dotenv/config";
import { db } from "./server/db";
import { companies, invoices } from "./shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const COMPANY_ID = 91;
const BASE_GLOBAL = 751; // ZIMRA recorded #11390 at 751; next claim = 752
const DAY_COUNT = 2;      // current day at ZIMRA has globals 1 (#11389), 2 (#11392)
const FAILED_IDS = [11377, 11378, 11385, 11386, 11387, 11391];

async function run() {
    try {
        const before = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
        console.log("BEFORE:", JSON.stringify({
            lastReceiptGlobalNo: before.lastReceiptGlobalNo,
            dailyReceiptCount: before.dailyReceiptCount,
            currentFiscalDayNo: before.currentFiscalDayNo,
            fiscalDayOpen: before.fiscalDayOpen,
            lastFiscalDayStatus: before.lastFiscalDayStatus,
            fiscalDayOpenedAt: before.fiscalDayOpenedAt?.toISOString(),
        }));

        await db.update(companies).set({
            lastReceiptGlobalNo: BASE_GLOBAL,
            dailyReceiptCount: DAY_COUNT,
            fiscalDayOpen: true,
            currentFiscalDayNo: 4,
            lastFiscalDayStatus: "FiscalDayCloseFailed",
            fiscalDayOpenedAt: new Date(), // stops auto-close races during resubmit
        }).where(eq(companies.id, COMPANY_ID));
        console.log("companies(91) counters set:", { lastReceiptGlobalNo: BASE_GLOBAL, dailyReceiptCount: DAY_COUNT });

        const cleared = await db.update(invoices).set({
            receiptGlobalNo: null,
            receiptCounter: null,
        }).where(and(
            eq(invoices.companyId, COMPANY_ID),
            inArray(invoices.id, FAILED_IDS)
        )).returning({ id: invoices.id, num: invoices.invoiceNumber });
        console.log("Phantom locks cleared on:", cleared.map(r => `#${r.id} ${r.num}`).join(", "));

        const after = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
        console.log("AFTER:", JSON.stringify({
            lastReceiptGlobalNo: after.lastReceiptGlobalNo,
            dailyReceiptCount: after.dailyReceiptCount,
            currentFiscalDayNo: after.currentFiscalDayNo,
            fiscalDayOpen: after.fiscalDayOpen,
            lastFiscalDayStatus: after.lastFiscalDayStatus,
        }));
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
