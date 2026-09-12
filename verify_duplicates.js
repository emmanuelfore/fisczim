import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

// Pairs to verify — [id1, id2] (lower = older)
const PAIRS = [
  [8263, 8264],   // $5.00
  [8282, 8283],   // $23.00
  [8294, 8295],   // $57.00
  [8226, 8227, 8228], // $70.00 - triple
  [8284, 8285, 8286, 8287], // $4.00 - quad
];

async function getItems(id) {
  const res = await client.query(`
    SELECT ii.product_id, p.name AS product_name, ii.quantity, ii.unit_price, ii.line_total, ii.tax_rate,
           i.customer_id, c.name AS customer_name
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    LEFT JOIN products p ON p.id = ii.product_id
    LEFT JOIN customers c ON c.id = i.customer_id
    WHERE ii.invoice_id = $1
    ORDER BY ii.product_id
  `, [id]);
  return res.rows;
}

async function main() {
  await client.connect();

  try {
    for (const group of PAIRS) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`CHECKING GROUP: Invoice IDs [${group.join(', ')}]`);
      console.log('='.repeat(70));

      const allItems = [];
      for (const id of group) {
        const items = await getItems(id);
        allItems.push({ id, items });
        const customerName = items[0]?.customer_name || 'Unknown';
        console.log(`\nInvoice ID ${id} — Customer: ${customerName}`);
        for (const item of items) {
          console.log(`  - [ProductID: ${item.product_id}] ${item.product_name} | qty: ${item.quantity} | unitPrice: $${item.unit_price} | lineTotal: $${item.line_total}`);
        }
      }

      // Compare: are all items identical across invoices in the group?
      const ref = allItems[0].items;
      let allMatch = true;
      let sameCustomer = true;
      const refCustomer = allItems[0].items[0]?.customer_id;

      for (let i = 1; i < allItems.length; i++) {
        const other = allItems[i].items;
        if (other.length !== ref.length) { allMatch = false; break; }
        for (let j = 0; j < ref.length; j++) {
          if (
            ref[j].product_id !== other[j].product_id ||
            ref[j].quantity !== other[j].quantity ||
            ref[j].unit_price !== other[j].unit_price
          ) { allMatch = false; break; }
        }
        if (other[0]?.customer_id !== refCustomer) sameCustomer = false;
      }

      console.log(`\n  ➤ Same line items?   ${allMatch ? '✅ YES — CONFIRMED DUPLICATE' : '❌ NO — DIFFERENT ITEMS'}`);
      console.log(`  ➤ Same customer?     ${sameCustomer ? '✅ YES' : '❌ NO — DIFFERENT CUSTOMERS'}`);
      if (!allMatch || !sameCustomer) {
        console.log(`  ➤ VERDICT: ⚠️  NOT a duplicate — do NOT delete`);
      } else {
        console.log(`  ➤ VERDICT: 🗑️  Safe to delete all but the first (lowest ID)`);
      }
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

main();
