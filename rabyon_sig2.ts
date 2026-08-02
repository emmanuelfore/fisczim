import "dotenv/config";
import { db } from "./server/db";
import { validationErrors, zimraLogs } from "./shared/schema";
import { eq, and, inArray, gte } from "drizzle-orm";

async function run() {
    try {
        const ids = [11455, 11456, 11457, 11458, 11459, 11460, 11461, 11462, 11463, 11464];
        console.log("=== VALIDATION ERRORS ===");
        const errs = await db.select().from(validationErrors)
            .where(inArray(validationErrors.invoiceId, ids))
            .orderBy(validationErrors.invoiceId);
        for (const e of errs) {
            console.log(`#${e.invoiceId} ${e.errorCode} [${e.errorColor}] ${e.errorMessage}`);
        }

        console.log("\n=== SUBMISSION LOGS ===");
        const logs = await db.select().from(zimraLogs)
            .where(and(inArray(zimraLogs.invoiceId, ids), gte(zimraLogs.createdAt, new Date("2026-08-01T12:00:00.000Z"))))
            .orderBy(zimraLogs.createdAt);
        for (const l of logs) {
            const req: any = l.requestPayload;
            const g = req?.receipt?.receiptGlobalNo ?? "-";
            const c = req?.receipt?.receiptCounter ?? "-";
            const day = req?.receipt?.fiscalDayNo ?? "-";
            const resp: any = l.responsePayload;
            const ve = resp?.validationErrors ? resp.validationErrors.map((e: any) => `${e.validationErrorCode}:${e.validationErrorColor}`).join(", ") : "";
            console.log(`${l.createdAt?.toISOString()} inv=${l.invoiceId ?? "-"} ${l.endpoint} ${l.statusCode} day=${day} g=${g} c=${c} [${ve}] ${l.errorMessage ?? ""}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
