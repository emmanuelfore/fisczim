import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function applyChanges() {
  const runSQL = async (query: string) => {
    try {
      console.log(`Executing: ${query}`);
      await db.execute(sql.raw(query));
      console.log("Success");
    } catch (e: any) {
      console.log(`Failed/Skipped: ${e.message}`);
    }
  };

  // Add columns to supplier_invoices
  await runSQL(`ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS transaction_type text NOT NULL DEFAULT 'Invoice'`);
  await runSQL(`ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS reference_invoice_id integer`);

  // Add journal_entry_id to payments
  await runSQL(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS journal_entry_id integer`);

  // Add branch_id to journal_entries
  await runSQL(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id)`);
  await runSQL(`CREATE INDEX IF NOT EXISTS journal_entries_branch_idx ON journal_entries(branch_id)`);

  // Add branch_id to ledger_entries
  await runSQL(`ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id)`);
  await runSQL(`CREATE INDEX IF NOT EXISTS ledger_entries_branch_idx ON ledger_entries(branch_id)`);

  // Add branch_id to journal_entry_drafts
  await runSQL(`ALTER TABLE journal_entry_drafts ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id)`);
  await runSQL(`CREATE INDEX IF NOT EXISTS journal_entry_drafts_company_branch_idx ON journal_entry_drafts(company_id, branch_id)`);

  // Add branch_id to journal_entry_draft_lines
  await runSQL(`ALTER TABLE journal_entry_draft_lines ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id)`);
  await runSQL(`CREATE INDEX IF NOT EXISTS journal_entry_draft_lines_branch_idx ON journal_entry_draft_lines(branch_id)`);

  // Add company_access_roles constraint/index
  // drizzle-kit is trying to add constraint:
  // "company_access_roles_company_name_idx" unique constraint
  // We can add it using ALTER TABLE ... ADD CONSTRAINT
  await runSQL(`ALTER TABLE company_access_roles ADD CONSTRAINT company_access_roles_company_name_idx UNIQUE (company_id, role)`);

  console.log("Migration check completed!");
  process.exit(0);
}

applyChanges();
