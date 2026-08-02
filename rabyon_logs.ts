import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    try {
        for (const id of [11389, 11390, 11392]) {
            console.log(`\n=== INVOICE #${id} ===`);
            const logs = await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, id)).orderBy(zimraLogs.createdAt);
            for (const l of logs) {
                console.log(`--- ${l.createdAt?.toISOString()} ${l.endpoint} status=${l.statusCode} err=${l.errorMessage ?? "-"}`);
                if (l.requestPayload) console.log("REQ:", JSON.stringify(l.requestPayload)?.slice(0, 900));
                if (l.responsePayload) console.log("RESP:", JSON.stringify(l.responsePayload)?.slice(0, 900));
            }
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
