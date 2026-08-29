import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function main() {
  try {
    await db.execute(sql`
      WITH duplicates AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id, conductor_id, start_time ORDER BY id) as rn
        FROM bus_shifts
      )
      UPDATE bus_shifts
      SET start_time = start_time + (duplicates.rn || ' seconds')::interval
      FROM duplicates
      WHERE bus_shifts.id = duplicates.id AND duplicates.rn > 1;
    `);
    console.log("Update succeeded.");
    
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "bus_shifts_company_conductor_start_unique"
        ON "bus_shifts" ("company_id", "conductor_id", "start_time");
    `);
    console.log("Index created.");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
main();
