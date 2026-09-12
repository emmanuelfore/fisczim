import "dotenv/config";
import { db } from "./server/db";
import { invoices } from "./shared/schema";
import { eq, and, gte, lt, desc } from "drizzle-orm";

async function run() {
    const invs = await db.select().from(invoices)
        .where(and(eq(invoices.companyId, 91), gte(invoices.id, 11455)))
        .orderBy(invoices.id);

    for (const i of invs) {
        const prevHash = (i as any).offlinePreviousHash;
        console.log(`#${i.id} ${i.invoiceNumber} g=${i.receiptGlobalNo} offlineDate=${i.offlineDate ?? "-"} offlinePrevHash=${prevHash ? String(prevHash).slice(0, 16) : "-"} sig=${i.fiscalSignature ? "Y" : "N"} at=${i.createdAt?.toISOString()}`);
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
