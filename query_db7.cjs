const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const invs = await client.query(`SELECT receipt_counter, receipt_global_no FROM invoices WHERE company_id = 84 AND fiscal_day_no = 2`);
  console.log("Day 2 Receipts Global No:", invs.rows);
  await client.end();
}
main();
