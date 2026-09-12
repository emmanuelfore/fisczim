const { Client } = require('pg');
require('dotenv').config();

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const res = await client.query("SELECT invoice_number, fiscal_day_no, receipt_counter, receipt_global_no FROM invoices WHERE company_id = 84 AND is_fiscalized = true");
    console.log("All fiscalized:", res.rows);

    await client.end();
}
main();
