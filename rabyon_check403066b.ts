import "dotenv/config";
import { db } from "./server/db";
import { validationErrors, invoices } from "./shared/schema";
import { eq, and, inArray } from "drizzle-orm";

async function run() {
    const invs = await db.select().from(invoices)
        .where(and(eq(invoices.companyId, 91), inArray(invoices.invoiceNumber, ["INV-403066","INV-403067","INV-403068","INV-403069"])));
    const ids = invs.map(i => i.id);
    const errs = await db.select().from(validationErrors)
        .where(inArray(validationErrors.invoiceId, ids))
        .orderBy(validationErrors.invoiceId);
    for (const e of errs) {
        console.log(`#${e.invoiceId} ${e.errorCode} [${e.errorColor}] ${e.errorMessage}`);
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
