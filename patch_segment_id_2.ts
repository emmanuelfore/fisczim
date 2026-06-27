import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();
  
  console.log('Adding missing segment_id columns to accounting tables...');
  
  const queries = [
    `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS default_segment_id integer REFERENCES accounting_segments(id)`,
    `ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS segment_id integer REFERENCES accounting_segments(id)`,
    `ALTER TABLE journal_entry_draft_lines ADD COLUMN IF NOT EXISTS segment_id integer REFERENCES accounting_segments(id)`
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
