import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs } from "./shared/schema";
import { eq, gte, asc, and } from "drizzle-orm";

async function run() {
    const logs = await db.select().from(zimraLogs)
        .where(and(eq(zimraLogs.companyId, 91), gte(zimraLogs.createdAt, new Date("2026-08-01T09:03:00Z"))))
        .orderBy(asc(zimraLogs.createdAt));
    for (const l of logs) {
        const r: any = l.requestPayload;
        const label = l.endpoint === "Invoice Submission" ? "Submit" : l.endpoint;
        if (l.endpoint === "SubmitReceipt" || l.endpoint === "Invoice Submission") continue;
        console.log(`[${l.createdAt?.toISOString()}] ${label} ${l.statusCode} err=${l.errorMessage ?? ""}`);
        if (l.endpoint.includes("Close") || l.endpoint.includes("Open")) {
            console.log("   ", JSON.stringify(r).slice(0, 500));
            console.log("   resp:", JSON.stringify(l.responsePayload).slice(0, 300));
        }
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
