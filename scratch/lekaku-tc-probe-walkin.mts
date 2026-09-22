import "dotenv/config";
import pg from "pg";
import { processInvoiceFiscalizationLEKAKU } from "../server/lib/fiscalization.js";

// Probe: walk-in (no TIN) FiscalInvoice with names-only buyerData.
async function main() {
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  const ex = await sql.query("SELECT id FROM invoices WHERE company_id=126 AND invoice_number='LS-TC22'");
  let id: number;
  if (ex.rowCount) {
    id = ex.rows[0].id;
  } else {
    const p = await sql.query("SELECT id FROM products WHERE company_id=126 AND sku='SUP-TC-MILK'");
    const inv = await sql.query(
      `INSERT INTO invoices (company_id, customer_id, invoice_number, due_date, subtotal, tax_amount, total,
        status, currency, payment_method, transaction_type, tax_inclusive, is_pos, is_fiscalized)
       VALUES (126, 767, 'LS-TC22', NOW() + INTERVAL '7 days', '50.00','7.50','57.50',
        'issued','LSL','CASH','FiscalInvoice',false,false,true) RETURNING id`,
    );
    id = inv.rows[0].id;
    await sql.query(
      "INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, tax_rate, line_total, tax_type_id) VALUES ($1,$2,'TC Fresh Milk 2L','1','50.00','15','50.00',334)",
      [id, p.rows[0].id],
    );
    console.log("created LS-TC22", id);
  }
  try {
    const inv: any = await processInvoiceFiscalizationLEKAKU(id, 126, undefined, true);
    const verr = await sql.query("SELECT error_code, error_color, error_message FROM validation_errors WHERE invoice_id=$1", [inv.id]);
    console.log(JSON.stringify({ ok: true, globalNo: inv.receiptGlobalNo, counter: inv.receiptCounter, operationID: inv.submissionId, validationStatus: inv.validationStatus, validationErrors: verr.rows }));
  } catch (e: any) {
    console.log(JSON.stringify({ ok: false, error: e.message, details: e.details || null }));
  }
  await sql.end();
}
main().catch((e) => { console.error("PROBE-ERR:", e.message); process.exit(1); });
