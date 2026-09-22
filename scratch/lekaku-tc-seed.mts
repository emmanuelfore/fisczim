import "dotenv/config";
import pg from "pg";

// Seeds company 126 (Lekuka supermarket) with TC-010..020 products, levies,
// customers and draft invoices. Idempotent — reruns reuse existing rows.
// Totals are tax-EXCLUSIVE (company rounding PerReceipt, invoices exclusive).
// Company taxes (test env): 334=VAT15(RSL7) 335=VAT10(RSL21) 333=NonVAT(RSL6)
// 332=Exempt(RSL4) levies 328=Alcohol10%(RSL81) 329=Tobacco20%(RSL82) 330=Plastic0.90(RSL83)

const COMPANY = 126;

const PRODUCTS = [
  { sku: "SUP-TC-BREAD", name: "TC Brown Bread 700g", price: 100, taxRate: 15, taxTypeId: 334, hs: "19059000" },
  { sku: "SUP-TC-MILK", name: "TC Fresh Milk 2L", price: 50, taxRate: 15, taxTypeId: 334, hs: "04012000" },
  { sku: "SUP-TC-OIL", name: "TC Cooking Oil 2L", price: 200, taxRate: 10, taxTypeId: 335, hs: "15121900" },
  { sku: "SUP-TC-MEAL", name: "TC Maize Meal 10kg", price: 300, taxRate: 0, taxTypeId: 333, hs: "11022000" },
  { sku: "SUP-TC-SALT", name: "TC Salt 1kg", price: 45, taxRate: 0, taxTypeId: 332, hs: "25010000" },
  { sku: "SUP-TC-BEER", name: "TC Lager 6-pack", price: 500, taxRate: 15, taxTypeId: 334, hs: "22030000" },
  { sku: "SUP-TC-CIG", name: "TC Cigarettes 20s", price: 400, taxRate: 15, taxTypeId: 334, hs: "24022000" },
  { sku: "SUP-TC-BAG", name: "TC Carrier Bag", price: 5, taxRate: 0, taxTypeId: 333, hs: "39232100" },
];

const LEVIES: Array<{ sku: string; taxTypeId: number; qty: string | null }> = [
  { sku: "SUP-TC-BEER", taxTypeId: 328, qty: null }, // Alcohol 10%
  { sku: "SUP-TC-CIG", taxTypeId: 329, qty: null }, // Tobacco 20%
  { sku: "SUP-TC-BAG", taxTypeId: 330, qty: "2" }, // Plastic 0.90 x 2
];

interface SeedItem { sku?: string; desc: string; qty: string; price: string; taxRate: string; taxTypeId: number; total: string }
interface SeedInv {
  no: string; tc: string; customer: "walk" | "vat"; tx: string; related?: string;
  subtotal: string; tax: string; total: string; items: SeedItem[];
}
// Math (exclusive): TC10 bread 100 +15% = 115 | TC11 milk 2x50=100 +15 = 115
// TC12 CN of TC10: -100 -15 = -115 | TC13 bread 100 - discount 10 = 90 +13.50 = 103.50
// TC14 DN milk 50 +7.50 = 57.50 | TC15 milk 50 +7.50 = 57.50 | TC16 oil 200 +20 = 220
// TC17 meal 300 +0 = 300 | TC18 cig 400 +60 VAT +80 tobacco = 540
// TC19 beer 500 +75 VAT +50 alcohol = 625 | TC20 bags 2x5=10 +1.80 plastic = 11.80
const INVOICES: SeedInv[] = [
  { no: "LS-TC10", tc: "TC-010 receipt VAT15", customer: "walk", tx: "Receipt", subtotal: "100.00", tax: "15.00", total: "115.00",
    items: [{ sku: "SUP-TC-BREAD", desc: "TC Brown Bread 700g", qty: "1", price: "100.00", taxRate: "15", taxTypeId: 334, total: "100.00" }] },
  { no: "LS-TC11", tc: "TC-011 fiscal invoice + buyer", customer: "vat", tx: "FiscalInvoice", subtotal: "100.00", tax: "15.00", total: "115.00",
    items: [{ sku: "SUP-TC-MILK", desc: "TC Fresh Milk 2L", qty: "2", price: "50.00", taxRate: "15", taxTypeId: 334, total: "100.00" }] },
  { no: "LS-TC12", tc: "TC-012 credit note", customer: "walk", tx: "CreditNote", related: "LS-TC10", subtotal: "-100.00", tax: "-15.00", total: "-115.00",
    items: [{ sku: "SUP-TC-BREAD", desc: "TC Brown Bread 700g (return)", qty: "1", price: "-100.00", taxRate: "15", taxTypeId: 334, total: "-100.00" }] },
  { no: "LS-TC13", tc: "TC-013 receipt with discount", customer: "walk", tx: "FiscalInvoice", subtotal: "90.00", tax: "13.50", total: "103.50",
    items: [
      { sku: "SUP-TC-BREAD", desc: "TC Brown Bread 700g", qty: "1", price: "100.00", taxRate: "15", taxTypeId: 334, total: "100.00" },
      { desc: "Loyalty discount", qty: "1", price: "-10.00", taxRate: "15", taxTypeId: 334, total: "-10.00" },
    ] },
  { no: "LS-TC14", tc: "TC-014 debit note", customer: "walk", tx: "DebitNote", related: "LS-TC10", subtotal: "50.00", tax: "7.50", total: "57.50",
    items: [{ sku: "SUP-TC-MILK", desc: "TC Fresh Milk 2L (undercharge)", qty: "1", price: "50.00", taxRate: "15", taxTypeId: 334, total: "50.00" }] },
  { no: "LS-TC15", tc: "TC-015 VAT @15%", customer: "walk", tx: "FiscalInvoice", subtotal: "50.00", tax: "7.50", total: "57.50",
    items: [{ sku: "SUP-TC-MILK", desc: "TC Fresh Milk 2L", qty: "1", price: "50.00", taxRate: "15", taxTypeId: 334, total: "50.00" }] },
  { no: "LS-TC16", tc: "TC-016 VAT @10%", customer: "walk", tx: "FiscalInvoice", subtotal: "200.00", tax: "20.00", total: "220.00",
    items: [{ sku: "SUP-TC-OIL", desc: "TC Cooking Oil 2L", qty: "1", price: "200.00", taxRate: "10", taxTypeId: 335, total: "200.00" }] },
  { no: "LS-TC17", tc: "TC-017 VAT @0%", customer: "walk", tx: "FiscalInvoice", subtotal: "300.00", tax: "0.00", total: "300.00",
    items: [{ sku: "SUP-TC-MEAL", desc: "TC Maize Meal 10kg", qty: "1", price: "300.00", taxRate: "0", taxTypeId: 333, total: "300.00" }] },
  { no: "LS-TC18", tc: "TC-018 levy 20% + VAT15", customer: "walk", tx: "FiscalInvoice", subtotal: "400.00", tax: "140.00", total: "540.00",
    items: [{ sku: "SUP-TC-CIG", desc: "TC Cigarettes 20s", qty: "1", price: "400.00", taxRate: "15", taxTypeId: 334, total: "400.00" }] },
  { no: "LS-TC19", tc: "TC-019 levy 10% + VAT15", customer: "walk", tx: "FiscalInvoice", subtotal: "500.00", tax: "125.00", total: "625.00",
    items: [{ sku: "SUP-TC-BEER", desc: "TC Lager 6-pack", qty: "1", price: "500.00", taxRate: "15", taxTypeId: 334, total: "500.00" }] },
  { no: "LS-TC20", tc: "TC-020 fixed plastic levy", customer: "walk", tx: "FiscalInvoice", subtotal: "10.00", tax: "1.80", total: "11.80",
    items: [{ sku: "SUP-TC-BAG", desc: "TC Carrier Bag", qty: "2", price: "5.00", taxRate: "0", taxTypeId: 333, total: "10.00" }] },
];

async function main() {
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  const prodIds = new Map<string, number>();
  for (const p of PRODUCTS) {
    const ex = await sql.query("SELECT id FROM products WHERE company_id=$1 AND sku=$2", [COMPANY, p.sku]);
    if (ex.rowCount) { prodIds.set(p.sku, ex.rows[0].id); continue; }
    const r = await sql.query(
      `INSERT INTO products (company_id, name, sku, description, price, tax_rate, tax_type_id, hs_code, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
      [COMPANY, p.name, p.sku, p.name, p.price, p.taxRate, p.taxTypeId, p.hs],
    );
    prodIds.set(p.sku, r.rows[0].id);
    console.log("product+", p.sku, r.rows[0].id);
  }
  for (const l of LEVIES) {
    await sql.query(
      `INSERT INTO product_tax_levies (product_id, tax_type_id, applied_for_quantity)
       VALUES ($1,$2,$3) ON CONFLICT (product_id, tax_type_id) DO UPDATE SET applied_for_quantity=EXCLUDED.applied_for_quantity`,
      [prodIds.get(l.sku), l.taxTypeId, l.qty],
    );
    console.log("levy=", l.sku, l.taxTypeId, l.qty);
  }
  const custIds: Record<string, number> = {};
  const mkCustomer = async (key: string, vals: any[]) => {
    const ex = await sql.query("SELECT id FROM customers WHERE company_id=$1 AND name=$2", [COMPANY, vals[0]]);
    if (ex.rowCount) { custIds[key] = ex.rows[0].id; return; }
    const r = await sql.query(
      `INSERT INTO customers (company_id, name, tin, vat_number, phone, email, city, address, customer_type, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'LSL') RETURNING id`, [COMPANY, ...vals],
    );
    custIds[key] = r.rows[0].id;
    console.log("customer+", key, r.rows[0].id);
  };
  await mkCustomer("walk", ["TC Walk-in Customer", null, null, "0772847155", null, "Maseru", "10 Macheke Township", "individual"]);
  await mkCustomer("vat", ["TC Maseru Foods (Pty) Ltd", "2001532810", "0198765433", "022312345", "orders@maserufoods.co.ls", "Maseru", "Kingsway Road", "business"]);

  const invIds = new Map<string, number>();
  for (const inv of INVOICES) {
    const ex = await sql.query("SELECT id FROM invoices WHERE company_id=$1 AND invoice_number=$2", [COMPANY, inv.no]);
    if (ex.rowCount) { invIds.set(inv.no, ex.rows[0].id); continue; }
    const r = await sql.query(
      `INSERT INTO invoices (company_id, customer_id, invoice_number, due_date, subtotal, tax_amount, total,
        status, currency, payment_method, transaction_type, related_invoice_id, tax_inclusive, is_pos, is_fiscalized)
       VALUES ($1,$2,$3, NOW() + INTERVAL '7 days', $4,$5,$6, 'issued','LSL','CASH',$7,$8,false,false,true) RETURNING id`,
      [COMPANY, custIds[inv.customer], inv.no, inv.subtotal, inv.tax, inv.total, inv.tx,
        inv.related ? invIds.get(inv.related) ?? null : null],
    );
    const id = r.rows[0].id;
    invIds.set(inv.no, id);
    for (const it of inv.items) {
      await sql.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, tax_rate, line_total, tax_type_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, it.sku ? prodIds.get(it.sku) ?? null : null, it.desc, it.qty, it.price, it.taxRate, it.total, it.taxTypeId],
      );
    }
    console.log("invoice+", inv.no, id, inv.tc);
  }
  await sql.end();
  console.log("SEED-DONE", JSON.stringify(Object.fromEntries(invIds)));
}
main().catch((e) => { console.error("SEED-ERR:", e.message); process.exit(1); });
