const { Client } = require('pg');
require('dotenv').config();

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const res = await client.query("SELECT invoice_number FROM invoices WHERE company_id = 84 ORDER BY id DESC LIMIT 5");
    console.log("Recent invoice numbers:", res.rows);

    await client.end();
}
main();
