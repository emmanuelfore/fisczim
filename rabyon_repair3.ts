import "dotenv/config";
import { db } from "./server/db";
import { companies } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    try {
        const before = (await db.select().from(companies).where(eq(companies.id, 91)))[0];
        console.log("BEFORE:", { global: before.lastReceiptGlobalNo, daily: before.dailyReceiptCount });
        await db.update(companies).set({ lastReceiptGlobalNo: 751, dailyReceiptCount: 660 }).where(eq(companies.id, 91));
        const after = (await db.select().from(companies).where(eq(companies.id, 91)))[0];
        console.log("AFTER:", { global: after.lastReceiptGlobalNo, daily: after.dailyReceiptCount, nextClaim: `${(after.lastReceiptGlobalNo ?? 0) + 1}/${(after.dailyReceiptCount ?? 0) + 1}` });
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
