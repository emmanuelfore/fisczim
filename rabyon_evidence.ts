import "dotenv/config";
import { db } from "./server/db";
import { companies, invoices, zimraLogs } from "./shared/schema";
import { eq, gte, and, isNull } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

async function run() {
    const c = (await db.select().from(companies).where(eq(companies.id, 91)))[0];
    console.log("COMPANY:", JSON.stringify({
        dayNo: c.currentFiscalDayNo, open: c.fiscalDayOpen, status: c.lastFiscalDayStatus,
        openedAt: c.fiscalDayOpenedAt?.toISOString(), lastGlobal: c.lastReceiptGlobalNo,
        daily: c.dailyReceiptCount, hash: (c.lastFiscalHash || "").slice(0, 20),
    }));

    const device = new ZimraDevice({
        deviceId: c.fdmsDeviceId!,
        deviceSerialNo: c.fdmsDeviceSerialNo || "UNKNOWN",
        activationKey: c.fdmsApiKey || "",
        privateKey: c.zimraPrivateKey || undefined,
        certificate: c.zimraCertificate || undefined,
        baseUrl: getZimraBaseUrl((c.zimraEnvironment as "test" | "production") || "test"),
    });
    const st = await device.getStatus() as any;
    console.log("DEVICE:", JSON.stringify(st));

    const red = await db.select({ id: invoices.id }).from(invoices)
        .where(and(eq(invoices.companyId, 91), eq(invoices.fiscalDayNo, 4), eq(invoices.validationStatus, "red")));
    console.log("Invoices day4 val=red:", red.length);

    const allDay4 = await db.select({ id: invoices.id, num: invoices.invoiceNumber, fdms: invoices.fdmsStatus, val: invoices.validationStatus, g: invoices.receiptGlobalNo })
        .from(invoices).where(and(eq(invoices.companyId, 91), eq(invoices.fiscalDayNo, 4)));
    const byFdms: Record<string, number> = {};
    for (const i of allDay4) byFdms[`${i.fdms}|${i.val ?? "-"}`] = (byFdms[`${i.fdms}|${i.val ?? "-"}`] || 0) + 1;
    console.log("Day4 invoices by (fdms|val):", JSON.stringify(byFdms));

    const ok = allDay4.filter(i => i.val && i.val !== "red").slice(0, 20);
    console.log("Day4 invoices NOT red (sample):", ok.map(i => `#${i.id} g=${i.g} ${i.val}`).join(", "));

    const after = await db.select().from(zimraLogs)
        .where(and(eq(zimraLogs.companyId, 91), gte(zimraLogs.createdAt, new Date("2026-08-01T16:12:20Z")), eq(zimraLogs.endpoint, "Invoice Submission")));
    console.log("Submissions after probes:", after.length, "| codes:", after.map(l => `${l.statusCode}:${(l.responsePayload as any)?.validationErrors ? (l.responsePayload as any).validationErrors.map((e: any) => e.validationErrorCode).join(",") || "clean" : "clean"}`).join("; "));
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
