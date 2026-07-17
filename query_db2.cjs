const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const res = await client.query("SELECT id, name, current_fiscal_day_no FROM companies WHERE name ILIKE '%elimuz%'");
  console.log("Companies:", res.rows);

  if (res.rows.length > 0) {
    const cid = res.rows[0].id;
    const invs = await client.query(`SELECT id, invoice_number, receipt_counter, fiscal_day_no, is_fiscalized, fdms_status FROM invoices WHERE company_id = $1 AND fiscal_day_no = 2 ORDER BY receipt_counter ASC NULLS LAST`, [cid]);
    console.log("Invoices Day 2:", invs.rows);
  }
  
  await client.end();
}
main();
