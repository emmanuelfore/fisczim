import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, auditLogs, apiLogs } from "./shared/schema";
import { eq, inArray, gte } from "drizzle-orm";

const COMPANY_ID = 91;
const TARGET = [11377, 11378, 11384];
const from = new Date(Date.now() - 24 * 3600 * 1000);

async function run() {
    try {
        console.log("=== ZIMRA LOGS ===");
        const zl = await db.select().from(zimraLogs).where(
            inArray(zimraLogs.invoiceId, TARGET)
        ).orderBy(zimraLogs.createdAt);
        for (const z of zl) {
            console.log(`#${z.invoiceId} ${z.endpoint} status=${z.statusCode} at=${z.createdAt?.toISOString()}`);
            console.log("  err:", z.errorMessage ?? "-");
            if (z.responsePayload) console.log("  resp:", JSON.stringify(z.responsePayload)?.slice(0, 600));
            if (z.requestPayload && z.invoiceId === 11377) console.log("  req:", JSON.stringify(z.requestPayload)?.slice(0, 300));
        }

        console.log("\n=== AUDIT LOGS (company 91, last 24h) ===");
        const al = await db.select().from(auditLogs).where(
            and(eq(auditLogs.companyId, COMPANY_ID), gte(auditLogs.createdAt, from))
        ).orderBy(auditLogs.createdAt).limit(40);
        for (const a of al) {
            console.log(`${a.createdAt?.toISOString()} action=${a.action} entity=${a.entityType}/${a.entityId} details=${JSON.stringify(a.details ?? {})?.slice(0, 400)}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

import { and } from "drizzle-orm";
run();
