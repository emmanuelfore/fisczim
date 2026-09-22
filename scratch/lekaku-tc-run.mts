import "dotenv/config";
import pg from "pg";
import { processInvoiceFiscalizationLEKAKU } from "../server/lib/fiscalization.js";

// Usage: npx tsx scratch/lekaku-tc-run.mts LS-TC10 [LS-TC11 ...]
// Submits in argument order, one by one, printing gateway results.
async function main() {
  const numbers = process.argv.slice(2);
  if (!numbers.length) throw new Error("pass invoice numbers");
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  for (const no of numbers) {
    const r = await sql.query("SELECT id, fiscal_code, submission_id FROM invoices WHERE company_id=126 AND invoice_number=$1", [no]);
    if (!r.rowCount) { console.log(`${no}: NOT-FOUND`); continue; }
    if (r.rows[0].fiscal_code || r.rows[0].submission_id) { console.log(`${no}: SKIP already submitted`); continue; }
    try {
      const inv: any = await processInvoiceFiscalizationLEKAKU(r.rows[0].id, 126, undefined, true);
      const verr = await sql.query("SELECT error_code, error_color, error_message FROM validation_errors WHERE invoice_id=$1", [inv.id]);
      console.log(JSON.stringify({
        invoice: no, ok: true,
        globalNo: inv.receiptGlobalNo, counter: inv.receiptCounter, day: inv.fiscalDayNo,
        operationID: inv.submissionId, validationStatus: inv.validationStatus,
        validationErrors: verr.rows,
      }));
    } catch (e: any) {
      console.log(JSON.stringify({ invoice: no, ok: false, error: e.message, details: e.details || null }));
    }
  }
  const co = await sql.query("SELECT last_receipt_global_no, daily_receipt_count, last_fiscal_hash FROM companies WHERE id=126");
  console.log("COMPANY:", JSON.stringify(co.rows[0]));
  await sql.end();
}
main().catch((e) => { console.error("RUN-ERR:", e.message); process.exit(1); });
