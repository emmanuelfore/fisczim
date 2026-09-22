import "dotenv/config";
import pg from "pg";

// Clone LS-TC15..TC20 -> LS-TCxxB with the VAT buyer attached (FiscalInvoice
// requires buyerData per RCPT046). Same lines/totals, customer 768.
const SRC = ["LS-TC15", "LS-TC16", "LS-TC17", "LS-TC18", "LS-TC19", "LS-TC20"];

async function main() {
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  for (const no of SRC) {
    const dst = no + "B";
    const ex = await sql.query("SELECT id FROM invoices WHERE company_id=126 AND invoice_number=$1", [dst]);
    if (ex.rowCount) { console.log(dst, "exists"); continue; }
    const base = await sql.query("SELECT * FROM invoices WHERE company_id=126 AND invoice_number=$1", [no]);
    const b = base.rows[0];
    const items = await sql.query(
      "SELECT product_id, description, quantity, unit_price, tax_rate, line_total, tax_type_id FROM invoice_items WHERE invoice_id=$1 ORDER BY id",
      [b.id],
    );
    const inv = await sql.query(
      `INSERT INTO invoices (company_id, customer_id, invoice_number, due_date, subtotal, tax_amount, total,
        status, currency, payment_method, transaction_type, tax_inclusive, is_pos, is_fiscalized)
       VALUES (126, 768, $1, NOW() + INTERVAL '7 days', $2, $3, $4,
        'issued','LSL','CASH','FiscalInvoice',false,false,true) RETURNING id`,
      [dst, b.subtotal, b.tax_amount, b.total],
    );
    for (const it of items.rows) {
      await sql.query(
        "INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, tax_rate, line_total, tax_type_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [inv.rows[0].id, it.product_id, it.description, it.quantity, it.unit_price, it.tax_rate, it.line_total, it.tax_type_id],
      );
    }
    console.log("cloned", dst, inv.rows[0].id);
  }
  await sql.query("UPDATE invoices SET validation_status='grey' WHERE company_id=126 AND invoice_number='LS-TC10'");
  await sql.end();
}
main().catch((e) => { console.error("CLONE-ERR:", e.message); process.exit(1); });
