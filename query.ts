import { db } from "./server/db.js";
import { sql } from "drizzle-orm";

async function run() {
  const rs = await db.execute(sql`
    SELECT * 
    FROM branches 
    WHERE id = 7;
  `);
  console.log(JSON.stringify(rs, null, 2));
  process.exit();
}

run();
