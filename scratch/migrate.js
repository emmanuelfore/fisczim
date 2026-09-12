import 'dotenv/config';
import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected.");
  const sql = fs.readFileSync('migrations/0056_add_loan_type.sql', 'utf8');
  await client.query(sql);
  console.log("Migration executed.");
  await client.end();
}
run().catch(err => {
  console.error(err);
  process.exit(1);
});
