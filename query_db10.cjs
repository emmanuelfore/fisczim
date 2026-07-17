const { Client } = require('pg');
require('dotenv').config();

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const res = await client.query("SELECT receipt_counter FROM invoices WHERE company_id = 84 AND fiscal_day_no = 2 ORDER BY receipt_counter ASC");
    console.log("All Day 2 Counters:", res.rows.map(r => parseInt(r.receipt_counter)));
    await client.end();
}
main();
