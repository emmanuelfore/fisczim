import { db } from "./server/db";
import { taxTypes } from "./shared/schema";
import { eq, or, isNull } from "drizzle-orm";

async function run() {
    try {
        const taxes = await db.select().from(taxTypes).where(or(eq(taxTypes.companyId, 91), isNull(taxTypes.companyId)));
        console.log("Tax Types for Rabyon:", JSON.stringify(taxes, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
