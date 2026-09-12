import "dotenv/config";
import { pool } from "../server/db.js";
import { expectedReceiptTotal } from "../server/lib/zimra-preflight.js";

const r = await pool.query(`
  SELECT i.id, i.invoice_number, i.total, i.tax_inclusive, i.transaction_type,
         it.quantity, it.unit_price, it.line_total, it.tax_rate
  FROM invoices i
  JOIN invoice_items it ON it.invoice_id = i.id
  WHERE i.company_id = 28 AND i.validation_status = 'red'
  ORDER BY i.id DESC
  LIMIT 400`);
const byInvoice = new Map<number, any[]>();
for (const row of r.rows) {
  const list = byInvoice.get(row.id) || [];
  list.push(row);
  byInvoice.set(row.id, list);
}

const roundMoney = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
let mismatches = 0;
let total = 0;
let examples = 0;
for (const [invId, rows] of byInvoice) {
  total++;
  const first = rows[0];
  const invoiceTotal = roundMoney(Number(first.total));
  const lines = rows.map((row) => {
    const qty = Number(row.quantity);
    const price = Number(row.unit_price);
    return {
      receiptLineQuantity: qty,
      receiptLinePrice: price,
      receiptLineTotal: roundMoney(qty * price),
      taxID: row.tax_rate > 0 ? 2 : 1,
      taxPercent: Number(row.tax_rate || 0),
    };
  });
  const computed = expectedReceiptTotal({
    receiptType: first.transaction_type === "CreditNote" ? "CreditNote" : "FiscalInvoice",
    receiptLines: lines,
    receiptLinesTaxInclusive: first.tax_inclusive,
  } as any);
  const normalized = roundMoney(computed);
  if (Math.abs(normalized - invoiceTotal) > 0.01) {
    mismatches++;
    if (examples < 8) {
      console.log(`Invoice ${first.invoice_number}: invoice total ${invoiceTotal.toFixed(2)} vs ZIMRA bucket total ${normalized.toFixed(2)} (diff ${(normalized - invoiceTotal).toFixed(2)})`);
      examples++;
    }
  }
}
console.log(`\nChecked ${total} red invoices: ${mismatches} would change total when submitted (${((mismatches / total) * 100).toFixed(1)}%)`);
await pool.end();
