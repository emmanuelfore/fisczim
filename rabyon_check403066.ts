import "dotenv/config";
import { db } from "./server/db";
import { invoices, zimraLogs } from "./shared/schema";
import { eq, and, inArray } from "drizzle-orm";

async function run() {
    try {
        const nums = ["INV-403066", "INV-403067", "INV-403068", "INV-403069"];
        const invs = await db.select().from(invoices)
            .where(and(eq(invoices.companyId, 91), inArray(invoices.invoiceNumber, nums)))
            .orderBy(invoices.id);

        for (const i of invs) {
            console.log(`#${i.id} ${i.invoiceNumber} status=${i.status} fdms=${i.fdmsStatus} val=${i.validationStatus}`);
            console.log(`   fiscalCode=${i.fiscalCode ? "Y" : "N"} fiscalSig=${i.fiscalSignature ? "Y" : "N"} global=${i.receiptGlobalNo} counter=${i.receiptCounter}`);
            console.log(`   issueDate=${i.issueDate?.toISOString()} offlineDate=${i.offlineDate ?? "null"} createdAt=${i.createdAt?.toISOString()}`);
            console.log(`   lastFiscalHash=${i.lastFiscalHash?.slice(0, 16) ?? "null"}`);
        }

        console.log("\n=== ZIMRA LOGS ===");
        const ids = invs.map(i => i.id);
        const logs = await db.select().from(zimraLogs)
            .where(and(inArray(zimraLogs.invoiceId, ids), eq(zimraLogs.companyId, 91)))
            .orderBy(zimraLogs.createdAt);
        for (const l of logs) {
            const req: any = l.requestPayload;
            const sig = req?.receipt?.receiptDeviceSignature?.signature;
            console.log(`${l.createdAt?.toISOString()} inv=${l.invoiceId} ${l.endpoint} ${l.statusCode} sig=${sig ? String(sig).slice(0, 20) + "..." : "NONE"} err=${l.errorMessage ?? ""}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}
run();
