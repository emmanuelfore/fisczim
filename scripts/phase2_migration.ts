import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  console.log("Starting Phase 2 Granular Sub-Ledger Period Controls Migration...");

  try {
    const sqlPath = path.resolve(__dirname, '../migrations/0033_tired_stellaris.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log("Executing SQL:\n", sql);

    // The SQL might contain '--> statement-breakpoint' which pg driver won't parse correctly.
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s.length > 0);

    for (const statement of statements) {
       console.log(`Running: ${statement}`);
       await pool.query(statement);
    }

    console.log("Schema migration applied successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

runMigration();
