import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'company_id' AND table_schema = 'public'
  `);
  console.log(result.rows.map(r => r.table_name));
  process.exit(0);
}

main().catch(console.error);
