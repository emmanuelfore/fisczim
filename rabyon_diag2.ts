import "dotenv/config";
import { db } from "./server/db";
import { invoices, invoiceItems } from "./shared/schema";
import { eq, and, gte, isNull, or } from "drizzle-orm";

const COMPANY_ID = 91;

async function run() {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayAll = await db.select({
            id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status,
            fiscalCode: invoices.fiscalCode, fdmsStatus: invoices.fdmsStatus,
            validationStatus: invoices.validationStatus, total: invoices.total,
            issueDate: invoices.issueDate, receiptGlobalNo: invoices.receiptGlobalNo,
            receiptCounter: invoices.receiptCounter, fiscalDayNo: invoices.fiscalDayNo,
            customerName: invoices.customerName,
        }).from(invoices).where(
            and(eq(invoices.companyId, COMPANY_ID), gte(invoices.issueDate, todayStart))
        ).orderBy(invoices.id);

        console.log(`Today's invoices (company ${COMPANY_ID}): ${todayAll.length}`);
        for (const inv of todayAll) {
            const ok = inv.fiscalCode ? "FISCALIZED" : "NO-FISCAL";
            console.log(`#${inv.id} ${inv.invoiceNumber} status=${inv.status} fiscal=${ok} fdms=${inv.fdmsStatus} val=${inv.validationStatus ?? "-"} total=${inv.total} globalNo=${inv.receiptGlobalNo ?? "-"} cust=${inv.customerName ?? "-"}`);
        }

        const failed = todayAll.filter((i) => !i.fiscalCode);
        console.log(`\nUnfiscalized today: ${failed.length}`);

        if (failed.length > 0) {
            console.log("\n=== ITEMS OF FAILED INVOICES ===");
            const ids = failed.map((f) => f.id);
            const items = await db.select({
                invoiceId: invoiceItems.invoiceId, description: invoiceItems.description,
                quantity: invoiceItems.quantity, unitPrice: invoiceItems.unitPrice,
                taxRate: invoiceItems.taxRate, taxTypeId: invoiceItems.taxTypeId,
                hsCode: invoiceItems.hsCode, productType: invoiceItems.productType,
            }).from(invoiceItems).where(inArray(ids));
            for (const it of items) {
                console.log(`#${it.invoiceId} qty=${it.quantity} price=${it.unitPrice} rate=${it.taxRate} taxTypeId=${it.taxTypeId} hs=${it.hsCode ?? "-"} type=${it.productType ?? "-"} desc="${it.description?.slice(0, 40)}"`);
            }
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

import { inArray } from "drizzle-orm";
run();
