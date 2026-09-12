import "dotenv/config";
import { db } from "./server/db";
import { companies } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    const [c] = await db.select().from(companies).where(eq(companies.id, 91));
    console.log("lastFiscalHash =", c.lastFiscalHash ? String(c.lastFiscalHash).slice(0, 20) + "..." : "null");
    console.log("lastReceiptGlobalNo =", c.lastReceiptGlobalNo);
    console.log("dailyReceiptCount =", c.dailyReceiptCount);
    console.log("currentFiscalDayNo =", c.currentFiscalDayNo);
    console.log("fiscalDayOpen =", c.fiscalDayOpen);
    console.log("lastStatus =", c.lastFiscalDayStatus ?? c.lastStatus);
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
