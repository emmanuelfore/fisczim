const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE manufacturing_routings ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0' NOT NULL;
      ALTER TABLE manufacturing_routing_operations RENAME COLUMN name TO operation_name;
      ALTER TABLE manufacturing_routing_operations RENAME COLUMN operation_time_minutes TO cycle_time_minutes;
      ALTER TABLE manufacturing_routing_operations DROP COLUMN IF EXISTS basis_quantity;
    `);
    console.log('Routing tables altered properly.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}
run();
