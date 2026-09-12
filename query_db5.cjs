const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  // check pos_orders if they exist
  try {
    const pos = await client.query(`SELECT id, receipt_number, receipt_counter, fiscal_day_no, is_fiscalized FROM pos_orders WHERE company_id = 84 AND fiscal_day_no = 2 ORDER BY receipt_counter ASC`);
    console.log("POS Orders Day 2:", pos.rows);
  } catch (e) {
    console.log("No pos_orders table or error:", e.message);
  }
  await client.end();
}
main();
