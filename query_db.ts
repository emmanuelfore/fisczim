import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const companies = await db.execute(sql`SELECT id, name, current_fiscal_day_no FROM companies WHERE name ILIKE '%elimuz%'`);
  console.log("Companies:", companies);

  if (companies.length > 0) {
    const cid = companies[0].id;
    const invoices = await db.execute(sql`SELECT id, receipt_counter, fiscal_day_no, is_fiscalized FROM invoices WHERE company_id = ${cid} AND fiscal_day_no = 2 ORDER BY receipt_counter ASC`);
    console.log("Invoices Day 2:", invoices);
  }

  process.exit(0);
}
main();
