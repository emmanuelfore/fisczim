import "dotenv/config";
import { db } from "./server/db";
import { invoices, validationErrors, zimraLogs } from "./shared/schema";
import { eq, and, gte, desc, inArray } from "drizzle-orm";

async function run() {
    try {
        const todayStart = new Date("2026-08-01T12:00:00.000Z");
        const recent = await db.select().from(invoices)
            .where(and(eq(invoices.companyId, 91), gte(invoices.id, 11455)))
            .orderBy(desc(invoices.id)).limit(15);

        console.log("=== LATEST INVOICES ===");
        for (const i of recent) {
            console.log(`#${i.id} ${i.invoiceNumber} fdms=${i.fdmsStatus} val=${i.validationStatus} global=${i.receiptGlobalNo ?? "-"} counter=${i.receiptCounter ?? "-"} fiscal=${i.fiscalCode ? "Y" : "N"} sig=${i.fiscalSignature ? "Y" : "N"} at=${i.issueDate?.toISOString()}`);
        }

        console.log("\n=== VALIDATION ERRORS (latest) ===");
        const errs = await db.select().from(validationErrors)
            .where(and(eq(validationErrors.companyId, 91), gte(validationErrors.invoiceId, 11455)))
            .orderBy(desc(validationErrors.invoiceId));
        for (const e of errs) {
            console.log(`#${e.invoiceId} ${e.errorCode} [${e.errorColor}] ${e.errorMessage}`);
        }

        console.log("\n=== RECENT SUBMISSIONS ===");
        const logs = await db.select().from(zimraLogs)
            .where(and(eq(zimraLogs.companyId, 91), gte(zimraLogs.createdAt, new Date("2026-08-01T12:00:00.000Z"))))
            .orderBy(zimraLogs.createdAt);
        for (const l of logs) {
            const req: any = l.requestPayload;
            const g = req?.receipt?.receiptGlobalNo ?? req?.receiptGlobalNo ?? "-";
            const c = req?.receipt?.receiptCounter ?? req?.receiptCounter ?? "-";
            const resp: any = l.responsePayload;
            const errs2 = resp?.validationErrors ? resp.validationErrors.map((e: any) => `${e.validationErrorCode}${e.validationErrorColor ? ":" + e.validationErrorColor : ""}`).join(",") : "";
            console.log(`${l.createdAt?.toISOString()} inv=${l.invoiceId ?? "-"} ${l.endpoint} ${l.statusCode} g=${g} c=${c} ${errs2} ${l.errorMessage ?? ""}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
