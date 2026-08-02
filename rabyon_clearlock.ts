import "dotenv/config";
import { db } from "./server/db";
import { invoices } from "./shared/schema";
import { eq, inArray } from "drizzle-orm";

async function run() {
    try {
        await db.update(invoices).set({ receiptGlobalNo: null, receiptCounter: null }).where(eq(invoices.id, 11377));
        await db.update(invoices).set({ receiptGlobalNo: null, receiptCounter: null }).where(eq(invoices.id, 11378));
        const rows = await db.select({
            id: invoices.id, num: invoices.invoiceNumber, globalNo: invoices.receiptGlobalNo, counter: invoices.receiptCounter,
        }).from(invoices).where(inArray(invoices.id, [11377, 11378]));
        for (const r of rows) console.log(`#${r.id} ${r.num} globalNo=${r.globalNo} counter=${r.counter}`);
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
