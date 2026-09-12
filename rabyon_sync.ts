import "dotenv/config";
import { db } from "./server/db";
import { companies, branches, invoices } from "./shared/schema";
import { eq, and, gte, not } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

const COMPANY_ID = 91;

async function run() {
    try {
        const c = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
        console.log("COMPANY: fiscalDayOpen:", c.fiscalDayOpen, "dayNo:", c.currentFiscalDayNo, "openedAt:", c.fiscalDayOpenedAt?.toISOString(), "status:", c.lastFiscalDayStatus, "lastGlobal:", c.lastReceiptGlobalNo, "daily:", c.dailyReceiptCount);

        const br = await db.select({ id: branches.id, name: branches.name, lastReceiptGlobalNo: branches.lastReceiptGlobalNo, dailyReceiptCount: branches.dailyReceiptCount, fiscalDayOpen: branches.fiscalDayOpen }).from(branches).where(eq(branches.companyId, COMPANY_ID));
        console.log("BRANCHES:", JSON.stringify(br));

        const device = new ZimraDevice({
            deviceId: c.fdmsDeviceId!,
            deviceSerialNo: c.fdmsDeviceSerialNo || "UNKNOWN",
            activationKey: c.fdmsApiKey || "",
            privateKey: c.zimraPrivateKey || undefined,
            certificate: c.zimraCertificate || undefined,
            baseUrl: getZimraBaseUrl((c.zimraEnvironment as "test" | "production") || "test"),
        });
        const st = await device.getStatus();
        console.log("DEVICE:", JSON.stringify(st));

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const failed = await db.select({
            id: invoices.id, num: invoices.invoiceNumber, status: invoices.status,
            fdms: invoices.fdmsStatus, val: invoices.validationStatus,
            globalNo: invoices.receiptGlobalNo, counter: invoices.receiptCounter, dayNo: invoices.fiscalDayNo,
            total: invoices.total, created: invoices.issueDate,
        }).from(invoices).where(and(eq(invoices.companyId, COMPANY_ID), gte(invoices.issueDate, todayStart), not(eq(invoices.fdmsStatus, "Fiscalized")))).orderBy(invoices.id);
        console.log(`\nTODAY'S NON-FISCALIZED: ${failed.length}`);
        for (const i of failed) {
            console.log(`#${i.id} ${i.num} status=${i.status} fdms=${i.fdms} val=${i.val ?? "-"} globalNo=${i.globalNo ?? "-"} counter=${i.counter ?? "-"} day=${i.dayNo ?? "-"} total=${i.total} at=${i.created?.toISOString()}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
