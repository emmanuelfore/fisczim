import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function run() {
  const pRes = await db.execute(sql.raw(`
    SELECT p.id, p.amount, p.payment_date 
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE i.customer_id = 365
  `));
  console.log("ALL payments for customer 365:", pRes.rows);
  process.exit(0);
}
run();
