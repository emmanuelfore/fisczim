import { db } from "./server/db";
import { sql } from "drizzle-orm";
async function run() {
    try {
        const companyId = 125;
        await db.execute(sql`INSERT INTO branches (company_id, name) VALUES (${companyId}, 'Automotive, Tools and hardware'), (${companyId}, 'Groceries, packaging and General supplies')`);
        console.log("Branches added successfully.");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
