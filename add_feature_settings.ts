import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
    try {
        await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS feature_settings JSONB DEFAULT '{}'::jsonb;`);
        console.log("Added feature_settings column successfully.");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
