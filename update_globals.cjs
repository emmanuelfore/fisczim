const { Client } = require('pg');
require('dotenv').config();

async function main() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    // we will update receipt_global_no for the dummy invoices.
    // if receipt 1 is global 3, then receipt N is global N + 2
    // wait, I will just prompt the user.
    await client.end();
}
main();
