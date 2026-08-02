import "dotenv/config";
import { db } from "./server/db";
import { companies, invoices } from "./shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const COMPANY_ID = 91;
// ZIMRA recorded globals 1-13 on the current day (#11389=1, #11392=2, #11377=3,
// #11378=4, #11385=5, #11386=6, #11387=7, #11391=8, #11393=9, #11395=10,
// #11398=12, #11399=13). Device lastReceiptGlobalNo=13 -> next claim = 14.
const BASE_GLOBAL = 13;
const DAY_COUNT = 660; // max recorded counter on the current day (counter 650, 651-660)

const RECORDED: Record<number, [number, number]> = {
    11377: [3, 651], 11378: [4, 652], 11385: [5, 653], 11386: [6, 654],
    11387: [7, 655], 11391: [8, 656],
};

async function run() {
    try {
        for (const [invId, [g, c]] of Object.entries(RECORDED)) {
            const [r] = await db.update(invoices).set({ receiptGlobalNo: g, receiptCounter: c })
                .where(eq(invoices.id, Number(invId))).returning({ id: invoices.id, num: invoices.invoiceNumber });
            console.log(`restored #${r.id} ${r.num} -> global=${g} counter=${c}`);
        }

        await db.update(companies).set({
            lastReceiptGlobalNo: BASE_GLOBAL,
            dailyReceiptCount: DAY_COUNT,
            fiscalDayOpen: true,
            currentFiscalDayNo: 4,
            lastFiscalDayStatus: "FiscalDayCloseFailed",
        }).where(eq(companies.id, COMPANY_ID));
        console.log("companies(91):", { lastReceiptGlobalNo: BASE_GLOBAL, dailyReceiptCount: DAY_COUNT, nextClaim: `${BASE_GLOBAL + 1}/${DAY_COUNT + 1}` });
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
