/**
 * Repair stock display for products in the most recent GRV only.
 *
 * Usage: npx tsx scripts/repair-last-grv-stock.ts [companyId]
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const companyId = Number(process.argv[2] || 54);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");
    await client.query("SET lock_timeout = '120s'");
    const lastGrv = await client.query(
      `SELECT reference_id, MAX(created_at) AS posted_at
       FROM inventory_transactions
       WHERE company_id = $1 AND type = 'STOCK_IN' AND reference_type = 'GRN'
       GROUP BY reference_id
       ORDER BY posted_at DESC
       LIMIT 1`,
      [companyId],
    );

    const grvRef = lastGrv.rows[0]?.reference_id as string | undefined;
    if (!grvRef) {
      console.log("No GRV found for company", companyId);
      return;
    }

    console.log(`Last GRV: ${grvRef} (${lastGrv.rows[0].posted_at})`);

    const locationResult = await client.query(
      `SELECT id FROM inventory_locations
       WHERE company_id = $1
       ORDER BY is_default_receiving DESC NULLS LAST,
                CASE WHEN type = 'WAREHOUSE' AND branch_id IS NULL THEN 0 ELSE 1 END
       LIMIT 1`,
      [companyId],
    );
    const locationId = locationResult.rows[0]?.id as number;
    if (!locationId) throw new Error("No inventory location found");

    const products = await client.query(
      `SELECT DISTINCT it.product_id,
              p.name,
              p.stock_level::numeric AS before_stock,
              (SELECT COALESCE(SUM(quantity::numeric), 0)
               FROM inventory_transactions
               WHERE company_id = $1 AND product_id = it.product_id) AS correct_stock
       FROM inventory_transactions it
       JOIN products p ON p.id = it.product_id
       WHERE it.company_id = $1
         AND it.reference_id = $2
         AND it.type = 'STOCK_IN'`,
      [companyId, grvRef],
    );

    console.log(`Repairing ${products.rows.length} products from ${grvRef}...\n`);

    for (const row of products.rows) {
      const correctStock = Number(row.correct_stock);
      const correctText = correctStock.toString();

      await client.query("BEGIN");
      try {
        const existing = await client.query(
          `SELECT id FROM inventory_location_stocks
           WHERE location_id = $1 AND product_id = $2 LIMIT 1`,
          [locationId, row.product_id],
        );

        if (existing.rows[0]) {
          await client.query(
            `UPDATE inventory_location_stocks
             SET stock_level = $1, available_quantity = $1, updated_at = NOW()
             WHERE id = $2`,
            [correctText, existing.rows[0].id],
          );
        } else {
          await client.query(
            `INSERT INTO inventory_location_stocks (
               location_id, product_id, stock_level, reserved_quantity, available_quantity, updated_at
             ) VALUES ($1, $2, $3, 0, $3, NOW())`,
            [locationId, row.product_id, correctText],
          );
        }

        await client.query(
          `UPDATE products SET stock_level = $1 WHERE id = $2`,
          [correctText, row.product_id],
        );

        await client.query("COMMIT");
        console.log(
          `  [${row.product_id}] ${row.name}: ${row.before_stock} -> ${correctStock}`,
        );
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("\nDone.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Repair failed:", err);
  process.exit(1);
});
