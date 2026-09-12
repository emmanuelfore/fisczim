import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function checkColumns() {
  try {
    const res = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'supplier_invoices'
    `);
    console.log("Columns of supplier_invoices:", res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

checkColumns();
