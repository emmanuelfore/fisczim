import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    try {
        for (const id of [11377, 11378, 11385, 11386, 11387, 11391, 11393, 11395, 11398, 11399]) {
            const logs = await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, id)).orderBy(zimraLogs.createdAt);
            const sub = logs.filter(l => (l.endpoint || "").includes("Invoice Submission") && l.statusCode === 200);
            for (const l of sub) {
                const req: any = l.requestPayload;
                const resp: any = l.responsePayload;
                const errors = resp?.validationErrors?.map((e: any) => `${e.validationErrorCode}:${e.validationErrorColor}`).join(",") || "-";
                console.log(`#${id} ${l.createdAt?.toISOString()} global=${req?.receipt?.receiptGlobalNo} counter=${req?.receipt?.receiptCounter} day=${req?.receipt?.fiscalDayNo} valErrors=[${errors}] receiptID=${resp?.receiptID}`);
            }
            if (sub.length === 0) console.log(`#${id} NO successful submission log`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
