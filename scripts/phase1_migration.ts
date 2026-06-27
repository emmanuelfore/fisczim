import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

import fs from 'fs';

async function runMigration() {
  console.log("Starting Phase 1 Multi-Currency Data Migration...");

  try {
    console.log("Applying schema migration...");
    const sql = `
      ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "base_currency" text DEFAULT 'USD' NOT NULL;
      ALTER TABLE "journal_entry_draft_lines" ADD COLUMN IF NOT EXISTS "base_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL;
      ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "base_amount" numeric(15, 2) DEFAULT '0.00' NOT NULL;
    `;
    await pool.query(sql);
    console.log("Schema migration applied successfully.");
    // 1. Backfill journalEntries baseCurrency
    console.log("Backfilling journalEntries.base_currency...");
    const res1 = await pool.query(`
      UPDATE journal_entries 
      SET base_currency = 'USD' 
      WHERE base_currency IS NULL OR base_currency = '';
    `);
    console.log(`Updated ${res1.rowCount} journal_entries.`);

    // 2. Backfill ledgerEntries baseAmount
    // Wait, ledgerEntries has exchangeRate, so we can calculate it
    console.log("Backfilling ledgerEntries.base_amount...");
    const res2 = await pool.query(`
      UPDATE ledger_entries 
      SET base_amount = amount * COALESCE(exchange_rate, 1.0)
      WHERE base_amount = 0.00;
    `);
    console.log(`Updated ${res2.rowCount} ledger_entries.`);

    // 3. Backfill journalEntryDraftLines baseAmount
    console.log("Backfilling journal_entry_draft_lines.base_amount...");
    const res3 = await pool.query(`
      UPDATE journal_entry_draft_lines 
      SET base_amount = amount
      WHERE base_amount = 0.00;
    `);
    console.log(`Updated ${res3.rowCount} journal_entry_draft_lines.`);

    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

runMigration();
