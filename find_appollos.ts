import 'dotenv/config';
import { db } from "./server/db";
import { companies } from "./shared/schema";
import { ilike } from "drizzle-orm";

async function main() {
    try {
        const result = await db.select().from(companies).where(ilike(companies.name, "%appollo%"));
        console.log("Found companies:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        process.exit(0);
    }
}
main();
