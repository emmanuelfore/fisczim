const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const invs = await client.query(`SELECT id, invoice_number, receipt_counter, fiscal_day_no, is_fiscalized FROM invoices WHERE company_id = 84 AND receipt_counter IS NOT NULL ORDER BY fiscal_day_no ASC, receipt_counter ASC`);
  console.log("All Fiscalized Invoices:", invs.rows);
  await client.end();
}
main();
