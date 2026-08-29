import { db } from "./server/db.js";
import { sql } from "drizzle-orm";
async function main() {
  const res = await db.execute(sql`
    SELECT indexname 
    FROM pg_indexes 
    WHERE tablename = 'bus_shifts' AND indexname = 'bus_shifts_company_conductor_start_unique';
  `);
  console.log('Index exists:', res.rows.length > 0);
  process.exit(0);
}
main().catch(console.error);
