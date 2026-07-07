/**
 * Reconcile products.stock_level and inventory_location_stocks from inventory_transactions.
 *
 * Usage: npx tsx scripts/repair-company-stock.ts [companyId]
 * Default companyId: 54 (Spares Arena)
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function repairCompanyStock(companyId: number) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const client = await pool.connect();
  try {
    console.log(`Repairing stock for company ${companyId}...`);
    await client.query("SET statement_timeout = 0");

    const locationResult = await client.query(
      `SELECT id FROM inventory_locations
       WHERE company_id = $1
       ORDER BY is_default_receiving DESC NULLS LAST,
                CASE WHEN type = 'WAREHOUSE' AND branch_id IS NULL THEN 0 ELSE 1 END
       LIMIT 1`,
      [companyId],
    );
    let locationId = locationResult.rows[0]?.id as number | undefined;

    if (!locationId) {
      const created = await client.query(
        `INSERT INTO inventory_locations (
           company_id, type, name, code, is_default_receiving, is_default_dispatch, is_active
         ) VALUES ($1, 'WAREHOUSE', 'Main Warehouse', 'MAIN-WAREHOUSE', true, true, true)
         RETURNING id`,
        [companyId],
      );
      locationId = created.rows[0].id;
    }

    const mismatches = await client.query(
      `WITH tx_sums AS (
         SELECT product_id, SUM(quantity::numeric) AS correct_stock
         FROM inventory_transactions
         WHERE company_id = $1
         GROUP BY product_id
       ),
       loc_sums AS (
         SELECT ils.product_id, COALESCE(SUM(ils.stock_level::numeric), 0) AS loc_total
         FROM inventory_location_stocks ils
         JOIN inventory_locations il ON il.id = ils.location_id
         WHERE il.company_id = $1
         GROUP BY ils.product_id
       )
       SELECT p.id AS product_id, p.name,
              p.stock_level::numeric AS stored_stock,
              COALESCE(ts.correct_stock, 0) AS correct_stock,
              COALESCE(ls.loc_total, 0) AS location_stock
       FROM products p
       LEFT JOIN tx_sums ts ON ts.product_id = p.id
       LEFT JOIN loc_sums ls ON ls.product_id = p.id
       WHERE p.company_id = $1
         AND p.is_tracked = true
         AND (
           ABS(p.stock_level::numeric - COALESCE(ts.correct_stock, 0)) > 0.01
           OR ABS(COALESCE(ls.loc_total, 0) - COALESCE(ts.correct_stock, 0)) > 0.01
         )
       ORDER BY p.id`,
      [companyId],
    );

    console.log(`Found ${mismatches.rows.length} products to repair.`);

    let updated = 0;
    for (const row of mismatches.rows) {
      const correctStock = Number(row.correct_stock);
      const correctText = correctStock.toString();

      await client.query("BEGIN");
      try {
        const existing = await client.query(
          `SELECT id FROM inventory_location_stocks
           WHERE location_id = $1 AND product_id = $2
           LIMIT 1`,
          [locationId, row.product_id],
        );

        if (existing.rows[0]) {
          await client.query(
            `UPDATE inventory_location_stocks
             SET stock_level = $1, available_quantity = $1, updated_at = NOW()
             WHERE id = $2`,
            [correctText, existing.rows[0].id],
          );
        } else if (correctStock !== 0) {
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
        updated += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    const remaining = await client.query(
      `WITH tx_sums AS (
         SELECT product_id, SUM(quantity::numeric) AS correct_stock
         FROM inventory_transactions
         WHERE company_id = $1
         GROUP BY product_id
       )
       SELECT COUNT(*)::int AS count
       FROM products p
       LEFT JOIN tx_sums ts ON ts.product_id = p.id
       WHERE p.company_id = $1
         AND p.is_tracked = true
         AND ABS(p.stock_level::numeric - COALESCE(ts.correct_stock, 0)) > 0.01`,
      [companyId],
    );

    const june25 = await client.query(
      `WITH tx_sums AS (
         SELECT product_id, SUM(quantity::numeric) AS correct_stock
         FROM inventory_transactions
         WHERE company_id = $1
         GROUP BY product_id
       )
       SELECT p.id, p.name, p.stock_level::numeric AS stock_level, COALESCE(ts.correct_stock, 0) AS tx_total
       FROM products p
       LEFT JOIN tx_sums ts ON ts.product_id = p.id
       WHERE p.company_id = $1
         AND p.id IN (
           SELECT DISTINCT product_id
           FROM inventory_transactions
           WHERE company_id = $1
             AND type = 'STOCK_IN'
             AND reference_type = 'GRN'
             AND created_at::date = '2026-06-25'
         )
       ORDER BY p.name`,
      [companyId],
    );

    console.log(`Repaired ${updated} products.`);
    console.log(`Remaining mismatches: ${remaining.rows[0].count}`);
    console.log("\nJune 25 GRV products:");
    for (const row of june25.rows) {
      const ok = Math.abs(Number(row.stock_level) - Number(row.tx_total)) < 0.01 ? "OK" : "MISMATCH";
      console.log(`  [${row.id}] ${row.name}: stock=${row.stock_level}, tx=${row.tx_total} ${ok}`);
    }

    return remaining.rows[0].count as number;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const companyId = Number(process.argv[2] || 54);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    console.error("Invalid company ID");
    process.exit(1);
  }

  try {
    const remaining = await repairCompanyStock(companyId);
    console.log(`\nDone. Remaining mismatches: ${remaining}`);
  } catch (err) {
    console.error("Repair failed:", err);
    process.exit(1);
  }
}

main();
