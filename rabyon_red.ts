import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, invoices } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    try {
        for (const id of [10288, 10296]) {
            const inv = (await db.select().from(invoices).where(eq(invoices.id, id)))[0];
            if (!inv) { console.log(`#${id} not found`); continue; }
            console.log(`=== #${id} ${inv.invoiceNumber} status=${inv.status} fiscal=${inv.fiscalCode ?? "NONE"} fdms=${inv.fdmsStatus} val=${inv.validationStatus} submissionId=${inv.submissionId ?? "-"} globalNo=${inv.receiptGlobalNo ?? "-"} ===`);
            const logs = await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, id)).orderBy(zimraLogs.createdAt);
            for (const l of logs) {
                console.log(`  ${l.createdAt?.toISOString()} ${l.endpoint} status=${l.statusCode}`);
                if (l.responsePayload) console.log("    resp:", JSON.stringify(l.responsePayload)?.slice(0, 700));
            }
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
