import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();
  
  console.log('Adding missing segment_id columns...');
  
  const queries = [
    `ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS segment_id integer REFERENCES accounting_segments(id)`,
    `ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS segment_id integer REFERENCES accounting_segments(id)`,
    `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS segment_id integer REFERENCES accounting_segments(id)`
  ];

  for (const q of queries) {
    try {
      await client.query(q);
      console.log('SUCCESS:', q);
    } catch (err) {
      console.error('FAILED:', q, err.message);
    }
  }

  await client.end();
  console.log('Done.');
}

fix();
