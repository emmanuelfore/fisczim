import { db } from "./server/db";
import { sql } from "drizzle-orm";
async function run() {
    try {
        const res = await db.execute(sql`SELECT id, name FROM companies WHERE name ILIKE '%Talpact%'`);
        console.log(res);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
