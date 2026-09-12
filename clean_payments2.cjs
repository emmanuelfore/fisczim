const { Client } = require("pg");
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  await client.connect();
  
  console.log("Checking all payment tables...");
  
  const tables = ['payments', 'supplier_payments', 'layby_payments'];
  
  for (const table of tables) {
    console.log(`Truncating ${table}...`);
    try {
      await client.query(`TRUNCATE TABLE ${table} CASCADE;`);
      console.log(`Truncated ${table} successfully.`);
    } catch (e) {
      console.error(`Error truncating ${table}:`, e.message);
    }
  }

  await client.end();
}

run().catch(console.error);
