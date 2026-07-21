import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
async function run() {
  const result = await db.execute(sql`SELECT p.* FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.customer_id = 365`);
  console.log(result.rows);
  const result2 = await db.execute(sql`SELECT p.*, pa.amount as allocated_amount FROM payments p JOIN payment_allocations pa ON p.id = pa.payment_id JOIN invoices i ON i.id = pa.invoice_id WHERE i.customer_id = 365`);
  console.log('Allocated payments:', result2.rows);
  process.exit(0);
}
run();
