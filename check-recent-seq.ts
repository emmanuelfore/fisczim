import { db } from "./server/db.js";
import { invoices } from "./shared/schema.js";
import { isNotNull, eq } from "drizzle-orm";

async function check() {
    const res = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        receiptGlobalNo: invoices.receiptGlobalNo,
        receiptCounter: invoices.receiptCounter,
        fiscalDayNo: invoices.fiscalDayNo,
        companyId: invoices.companyId,
        createdAt: invoices.createdAt
    }).from(invoices)
      .where(isNotNull(invoices.receiptGlobalNo))
      .orderBy(invoices.createdAt);
      
    const recent = res.slice(-30);
    console.table(recent);
    process.exit(0);
}

check();
