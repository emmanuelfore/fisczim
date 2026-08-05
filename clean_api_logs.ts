import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function run() {
  console.log("Cleaning non-fiscalisation logs...");
  
  const res = await db.execute(sql`
    DELETE FROM api_logs 
    WHERE endpoint NOT LIKE '%/zimra/device-details%'
      AND endpoint NOT LIKE '%/zimra/device-status%'
      AND endpoint NOT LIKE '%/zimra/transact%'
      AND endpoint NOT LIKE '%/zimra/transact-ext%'
      AND endpoint NOT LIKE '%/zimra/z-report%'
      AND endpoint NOT LIKE '%/zimra/transactions%'
      AND endpoint NOT LIKE '%/zimra/config/reset%'
      AND endpoint NOT LIKE '%/v1/fiscalize%'
  `);
  
  console.log("Deleted old logs:", res.rowCount);
  process.exit(0);
}
run();
