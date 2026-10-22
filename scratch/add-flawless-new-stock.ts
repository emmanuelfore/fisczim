/**
 * Adds the "New Stock Register" items to Flawless Beauty.
 * Each register line becomes a new product with its quantity as opening stock.
 * Run: npx tsx scratch/add-flawless-new-stock.ts
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const COMPANY_NAME = "Flawless Beauty";

const items = [
  { name: "Crocs – Kids", quantity: 68, price: "2.00" },
  { name: "Crocs – Big", quantity: 72, price: "3.00" },
  { name: "Rafters", quantity: 10, price: "15.00" },
  { name: "Oafters shoes", quantity: 23, price: "20.00" },
  { name: "Ladies sandals", quantity: 33, price: "15.00" },
  { name: "TN shocks shoes", quantity: 47, price: "20.00" },
  { name: "Towel, Big Baby", quantity: 17, price: "10.00" },
  { name: "Pumps shoes", quantity: 6, price: "15.00" },
  { name: "Kids pumps", quantity: 21, price: "5.00" },
  { name: "Kids Rafters", quantity: 23, price: "6.00" },
  { name: "Tonne Kids", quantity: 20, price: "8.00" },
  { name: "MQD shoes", quantity: 2, price: "10.00" },
  { name: "Bloodline shoes", quantity: 22, price: "10.00" },
  { name: "Air Max, Campus, Sampa, Jordan, New Balance", quantity: 152, price: "15.00" },
  { name: "Kids sandals", quantity: 6, price: "6.00" },
  { name: "Tik Tok", quantity: 5, price: "6.00" },
  { name: "Skirts", quantity: 4, price: "10.00" },
  { name: "Green T-shirts", quantity: 5, price: "5.00" },
  { name: "T-shirts", quantity: 7, price: "3.00" },
  { name: "T-shirts", quantity: 8, price: "8.00" },
  { name: "Cargo skirts", quantity: 4, price: "10.00" },
  { name: "Kids shirts", quantity: 83, price: "8.00" },
  { name: "Jean dresses, kids", quantity: 25, price: "18.00" },
  { name: "Boyfriend jeans", quantity: 25, price: "15.00" },
  { name: "Pleated skirts", quantity: 4, price: "10.00" },
  { name: "Boys' jeans trousers", quantity: 48, price: "15.00" },
  { name: "Girls' bum shorts", quantity: 16, price: "10.00" },
  { name: "Girls' skinny jeans", quantity: 26, price: "12.00" },
  { name: "Long jean skirts", quantity: 7, price: "15.00" },
  { name: "Jean skirts", quantity: 6, price: "10.00" },
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function main() {
  const client = await pool.connect();
  try {
    const companyResult = await client.query(
      "SELECT id, name FROM companies WHERE name ILIKE $1 LIMIT 1",
      [`%${COMPANY_NAME}%`],
    );
    const company = companyResult.rows[0];
    if (!company) throw new Error(`Company "${COMPANY_NAME}" not found.`);

    const locationResult = await client.query(
      `SELECT id FROM inventory_locations
       WHERE company_id = $1
       ORDER BY is_default_receiving DESC NULLS LAST,
                CASE WHEN type = 'WAREHOUSE' AND branch_id IS NULL THEN 0 ELSE 1 END
       LIMIT 1`,
      [company.id],
    );
    let locationId = locationResult.rows[0]?.id as number | undefined;
    if (!locationId) {
      const created = await client.query(
        `INSERT INTO inventory_locations
           (company_id, type, name, code, is_default_receiving, is_default_dispatch, is_active)
         VALUES ($1, 'WAREHOUSE', 'Main Warehouse', 'MAIN-WAREHOUSE', true, true, true)
         RETURNING id`,
        [company.id],
      );
      locationId = created.rows[0].id;
    }

    console.log(`Company: ${company.name} (ID ${company.id})`);
    console.log(`Receiving location: ${locationId}`);
    console.log(`Adding ${items.length} products...\n`);

    await client.query("BEGIN");

    const inserted: Array<{ id: number; name: string; quantity: number; price: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sku = `FB-NS-${String(i + 1).padStart(2, "0")}`;

      const productResult = await client.query(
        `INSERT INTO products
           (company_id, name, description, sku, barcode, hs_code, category, owner_group,
            price, cost_price, tax_rate, is_tracked, stock_level, low_stock_threshold,
            is_active, product_type, is_for_sale)
         VALUES
           ($1, $2, '', $3, '', '', '', '',
            $4, '0.000000', '15.50', true, $5, '10.00',
            true, 'good', true)
         RETURNING id`,
        [company.id, item.name, sku, item.price, item.quantity.toString()],
      );
      const productId = productResult.rows[0].id as number;

      await client.query(
        `INSERT INTO inventory_transactions
           (company_id, location_id, product_id, type, quantity, unit_cost, total_cost,
            reference_type, notes)
         VALUES ($1, $2, $3, 'STOCK_IN', $4, '0.00', '0.00', 'MANUAL', $5)`,
        [
          company.id,
          locationId,
          productId,
          item.quantity.toString(),
          `New stock register item ${i + 1}`,
        ],
      );

      await client.query(
        `INSERT INTO inventory_location_stocks
           (location_id, product_id, stock_level, reserved_quantity, available_quantity, updated_at)
         VALUES ($1, $2, $3, '0', $3, NOW())`,
        [locationId, productId, item.quantity.toString()],
      );

      inserted.push({ id: productId, name: item.name, quantity: item.quantity, price: item.price });
      console.log(
        `  + [${productId}] ${item.name} — qty ${item.quantity} @ $${item.price}`,
      );
    }

    await client.query("COMMIT");

    const totalUnits = inserted.reduce((sum, row) => sum + row.quantity, 0);
    const totalValue = inserted.reduce(
      (sum, row) => sum + row.quantity * Number(row.price),
      0,
    );

    console.log(`\nDone. Added ${inserted.length} products.`);
    console.log(`Total units: ${totalUnits}`);
    console.log(`Total retail value: $${totalValue.toFixed(2)}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
