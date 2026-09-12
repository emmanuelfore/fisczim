import "dotenv/config";
import { db } from "./server/db";
import { companies, invoices } from "./shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

const COMPANY_ID = 91;

async function run() {
    try {
        const c = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
        console.log("LOCAL: fiscalDayOpen:", c.fiscalDayOpen, "dayNo:", c.currentFiscalDayNo, "openedAt:", c.fiscalDayOpenedAt?.toISOString(), "lastStatus:", c.lastFiscalDayStatus, "lastGlobal:", c.lastReceiptGlobalNo, "daily:", c.dailyReceiptCount);

        const device = new ZimraDevice({
            deviceId: c.fdmsDeviceId!,
            deviceSerialNo: c.fdmsDeviceSerialNo || "UNKNOWN",
            activationKey: c.fdmsApiKey || "",
            privateKey: c.zimraPrivateKey || undefined,
            certificate: c.zimraCertificate || undefined,
            baseUrl: getZimraBaseUrl((c.zimraEnvironment as "test" | "production") || "test"),
        });
        console.log("\nDEVICE STATUS FULL:");
        console.log(JSON.stringify(await device.getStatus(), null, 2));

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayAll = await db.select({
            id: invoices.id, num: invoices.invoiceNumber, status: invoices.status,
            fiscal: invoices.fiscalCode, fdms: invoices.fdmsStatus, val: invoices.validationStatus,
            globalNo: invoices.receiptGlobalNo, counter: invoices.receiptCounter, dayNo: invoices.fiscalDayNo,
            created: invoices.issueDate,
        }).from(invoices).where(and(eq(invoices.companyId, COMPANY_ID), gte(invoices.issueDate, todayStart))).orderBy(invoices.id);
        console.log(`\nTODAY'S INVOICES: ${todayAll.length}`);
        for (const i of todayAll) {
            console.log(`#${i.id} ${i.num} status=${i.status} fiscal=${i.fiscal ? "YES" : "NONE"} fdms=${i.fdms} val=${i.val ?? "-"} globalNo=${i.globalNo ?? "-"} counter=${i.counter ?? "-"} day=${i.dayNo ?? "-"} at=${i.created?.toISOString()}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
