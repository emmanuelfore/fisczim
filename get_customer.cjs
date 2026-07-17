const { Client } = require('pg');
require('dotenv').config();

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const res = await client.query("SELECT id FROM customers WHERE company_id = 84 LIMIT 1");
    console.log("Customer:", res.rows[0]);
    
    const branchRes = await client.query("SELECT id FROM branches WHERE company_id = 84 LIMIT 1");
    console.log("Branch:", branchRes.rows[0]);

    await client.end();
}
main();
