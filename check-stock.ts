import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function run() {
  const pId = 8120;
  const prod = await db.execute(sql`SELECT stock_level FROM products WHERE id = ${pId}`);
  console.log("products stock_level:", prod.rows);
  process.exit(0);
}
run().catch(console.error);
