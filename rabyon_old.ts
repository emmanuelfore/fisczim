import "dotenv/config";
import { db } from "./server/db";
import { validationErrors } from "./shared/schema";
import { inArray } from "drizzle-orm";

async function run() {
    const ids: number[] = [];
    for (let i = 11370; i <= 11399; i++) ids.push(i);
    const errs = await db.select().from(validationErrors)
        .where(inArray(validationErrors.invoiceId, ids))
        .orderBy(validationErrors.invoiceId);
    const byInv: Record<number, string[]> = {};
    for (const e of errs) {
        (byInv[e.invoiceId] ??= []).push(`${e.errorCode}:${e.errorColor}`);
    }
    for (const [id, codes] of Object.entries(byInv)) {
        console.log(`#${id} ${codes.join(", ")}`);
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
