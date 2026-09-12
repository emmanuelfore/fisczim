import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, validationErrors } from "./shared/schema";
import { eq, inArray, gte, lt, asc, and } from "drizzle-orm";

async function run() {
    // 1. ALL submissions for the anchor candidate invoices 11389 (g=1) and 11392 (g=2)
    const logs = await db.select().from(zimraLogs)
        .where(and(eq(zimraLogs.companyId, 91), inArray(zimraLogs.invoiceId, [11389, 11392])))
        .orderBy(asc(zimraLogs.createdAt));
    for (const l of logs) {
        const r: any = l.requestPayload;
        const resp: any = l.responsePayload;
        const ve = resp?.validationErrors ? resp.validationErrors.map((e: any) => `${e.validationErrorCode || e.errorCode}:${e.validationErrorColor}`).join(", ") : "(none)";
        console.log(`[${l.createdAt?.toISOString()}] inv=${l.invoiceId} ${l.endpoint} ${l.statusCode} g=${r?.receipt?.receiptGlobalNo} c=${r?.receipt?.receiptCounter} hash=${String(r?.receipt?.receiptDeviceSignature?.hash).slice(0,16)} err=${l.errorMessage ?? ""} VE=[${ve}]`);
    }

    // 2. Validation errors for 11389, 11392, 11478
    console.log("\n--- validation_errors ---");
    const ves = await db.select().from(validationErrors).where(inArray(validationErrors.invoiceId, [11389, 11392, 11478]));
    for (const v of ves) console.log(`#${v.invoiceId} ${v.errorCode} [${v.errorColor}] ${v.errorMessage}`);

    // 3. GetStatus / OpenDay / CloseDay logs around the rollover
    console.log("\n--- day lifecycle logs 08:45-09:10Z ---");
    const dayLogs = await db.select().from(zimraLogs)
        .where(and(eq(zimraLogs.companyId, 91), gte(zimraLogs.createdAt, new Date("2026-08-01T08:45:00Z")), lt(zimraLogs.createdAt, new Date("2026-08-01T09:10:00Z"))))
        .orderBy(asc(zimraLogs.createdAt));
    for (const l of dayLogs) {
        if (l.endpoint === "Invoice Submission") continue;
        const resp: any = l.responsePayload;
        const keys = resp ? Object.keys(resp).join(",") : "";
        console.log(`[${l.createdAt?.toISOString()}] ${l.endpoint} ${l.statusCode} err=${l.errorMessage ?? ""} respKeys=[${keys}]`);
        if (resp) console.log("   ", JSON.stringify(resp).slice(0, 400));
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
