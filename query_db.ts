import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
async function run() {
  const pRes = await db.execute(sql.raw(`
    SELECT id, amount, payment_date FROM payments WHERE invoice_id IS NULL ORDER BY id DESC LIMIT 5;
  `));
  console.log("Payments with NULL invoice_id:", pRes.rows);
  process.exit(0);
}
run();
