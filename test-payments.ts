import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function run() {
  const r = await db.execute(sql`SELECT p.id, p.payment_date, p.amount, p.invoice_id FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.customer_id = 365`);
  console.log("Joined by invoice_id:", r.rows);
  const r2 = await db.execute(sql`SELECT p.id, p.payment_date, p.amount FROM payments p JOIN payment_allocations pa ON p.id = pa.payment_id JOIN invoices i ON i.id = pa.invoice_id WHERE i.customer_id = 365`);
  console.log("Joined by allocations:", r2.rows);
  process.exit(0);
}
run();
