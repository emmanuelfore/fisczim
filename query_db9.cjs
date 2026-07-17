const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const invs = await client.query(`SELECT receipt_counter, receipt_global_no, invoice_number FROM invoices WHERE company_id = 84 AND receipt_global_no >= 18`);
  console.log("Invoices >= 18:", invs.rows);
  await client.end();
}
main();
