import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function main() {
  const res = await db.execute(sql`
    SELECT company_id, conductor_id, start_time, count(*) 
    FROM bus_shifts 
    GROUP BY company_id, conductor_id, start_time 
    HAVING count(*) > 1;
  `);
  console.log("Duplicates:", res.rows);
  process.exit(0);
}
main().catch(console.error);
