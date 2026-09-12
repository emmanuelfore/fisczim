import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, auditLogs } from "./shared/schema";
import { eq, and, gte, lt } from "drizzle-orm";

async function run() {
    try {
        const from = new Date("2026-08-01T08:52:00.000Z");
        const to = new Date("2026-08-01T08:58:00.000Z");
        console.log("=== ZIMRA LOGS 08:52-08:58 (company 91) ===");
        const zlogs = await db.select().from(zimraLogs).where(and(
            eq(zimraLogs.companyId, 91), gte(zimraLogs.createdAt, from), lt(zimraLogs.createdAt, to)
        )).orderBy(zimraLogs.createdAt);
        for (const l of zlogs) {
            console.log(`${l.createdAt?.toISOString()} inv=${l.invoiceId ?? "-"} ${l.endpoint} ${l.statusCode} ${l.errorMessage ?? ""}`);
            if (l.endpoint && l.endpoint.toLowerCase().includes("reset")) console.log("  REQ:", JSON.stringify(l.requestPayload));
        }
        console.log("\n=== AUDIT LOGS 08:52-08:58 (company 91) ===");
        const alogs = await db.select().from(auditLogs).where(and(
            eq(auditLogs.companyId, 91), gte(auditLogs.createdAt, from), lt(auditLogs.createdAt, to)
        )).orderBy(auditLogs.createdAt);
        for (const a of alogs) {
            console.log(`${a.createdAt?.toISOString()} action=${a.action} details=${JSON.stringify(a.details)?.slice(0, 300)}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
