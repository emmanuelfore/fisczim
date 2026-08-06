import { readFileSync } from 'fs';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  await client.connect();
  const sql = readFileSync('consignments_v2_migration.sql', 'utf8');
  await client.query(sql);
  console.log('Migration executed successfully');
  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
