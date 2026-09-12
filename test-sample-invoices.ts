import { storage } from "./server/storage.js";
import { db } from "./server/db.js";
import { companies } from "./shared/schema.js";
import { eq } from "drizzle-orm";

async function testCounters() {
    const companyId = 8;
    console.log("Processing next receipt numbers...");
    const res = await storage.claimNextReceiptNumbers(companyId);
    console.log("Claimed numbers:", res);
    
    const [c2] = await db.select().from(companies).where(eq(companies.id, companyId));
    console.log("DB counters after claim:", c2?.lastReceiptGlobalNo, c2?.dailyReceiptCount);
    
    process.exit(0);
}

testCounters();
