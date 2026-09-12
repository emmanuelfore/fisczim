const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const invs = await client.query(`SELECT id, invoice_number, receipt_counter, fiscal_day_no, is_fiscalized, fdms_status, created_at, issue_date FROM invoices WHERE company_id = 84 AND receipt_counter IS NOT NULL ORDER BY id DESC LIMIT 10`);
  console.log("Recent Invoices:", invs.rows);
  await client.end();
}
main();
