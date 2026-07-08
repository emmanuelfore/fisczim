import { db } from "./server/db.js";
import { invoices } from "./shared/schema.js";

async function check() {
    const res = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        receiptGlobalNo: invoices.receiptGlobalNo,
        receiptCounter: invoices.receiptCounter,
        fiscalDayNo: invoices.fiscalDayNo,
        fiscalCode: invoices.fiscalCode
    }).from(invoices).limit(20);
    console.log(res);
    process.exit(0);
}

check();
