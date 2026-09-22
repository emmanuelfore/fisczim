import "dotenv/config";
import pg from "pg";

// Clone LS-TC13 -> LS-TC13B with the VAT buyer attached (discount lines
// require buyer data per RCPT046).
async function main() {
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  const ex = await sql.query("SELECT id FROM invoices WHERE company_id=126 AND invoice_number='LS-TC13B'");
  if (ex.rowCount) { console.log("LS-TC13B exists:", ex.rows[0].id); await sql.end(); return; }
  const base = await sql.query("SELECT id FROM invoices WHERE company_id=126 AND invoice_number='LS-TC13'");
  const items = await sql.query(
    "SELECT product_id, description, quantity, unit_price, tax_rate, line_total, tax_type_id FROM invoice_items WHERE invoice_id=$1 ORDER BY id",
    [base.rows[0].id],
  );
  const inv = await sql.query(
    `INSERT INTO invoices (company_id, customer_id, invoice_number, due_date, subtotal, tax_amount, total,
      status, currency, payment_method, transaction_type, tax_inclusive, is_pos, is_fiscalized)
     VALUES (126, 768, 'LS-TC13B', NOW() + INTERVAL '7 days', '90.00','13.50','103.50',
      'issued','LSL','CASH','FiscalInvoice',false,false,true) RETURNING id`,
  );
  const id = inv.rows[0].id;
  for (const it of items.rows) {
    await sql.query(
      "INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, tax_rate, line_total, tax_type_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, it.product_id, it.description, it.quantity, it.unit_price, it.tax_rate, it.line_total, it.tax_type_id],
    );
  }
  console.log("cloned LS-TC13B id=", id);
  await sql.end();
}
main().catch((e) => { console.error("CLONE-ERR:", e.message); process.exit(1); });
