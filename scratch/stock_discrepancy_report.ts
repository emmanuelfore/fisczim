import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function main() {
    const pool = new Pool({ connectionString });
    try {
        const report = await pool.query(`
            WITH tx_sums AS (
                SELECT 
                    product_id,
                    SUM(quantity::numeric) as computed_stock
                FROM inventory_transactions
                WHERE company_id = 54
                GROUP BY product_id
            )
            SELECT 
                p.id,
                p.name,
                p.sku,
                p.stock_level::numeric as stored_stock,
                COALESCE(ts.computed_stock, 0) as correct_stock,
                (p.stock_level::numeric - COALESCE(ts.computed_stock, 0)) as error_amount,
                CASE 
                    WHEN p.stock_level::numeric < 0 AND COALESCE(ts.computed_stock, 0) >= 0 THEN 'FALSELY NEGATIVE'
                    WHEN p.stock_level::numeric > COALESCE(ts.computed_stock, 0) THEN 'OVERSTATED'
                    WHEN p.stock_level::numeric < COALESCE(ts.computed_stock, 0) THEN 'UNDERSTATED'
                    ELSE 'OK'
                END as issue_type
            FROM products p
            LEFT JOIN tx_sums ts ON ts.product_id = p.id
            WHERE p.company_id = 54
              AND p.is_active = true
              AND ABS(p.stock_level::numeric - COALESCE(ts.computed_stock, 0)) > 0.01
            ORDER BY ABS(p.stock_level::numeric - COALESCE(ts.computed_stock, 0)) DESC
        `);

        console.log(`SPARES ARENA — STOCK LEVEL DISCREPANCY REPORT`);
        console.log(`Generated: ${new Date().toISOString()}`);
        console.log(`Total products with wrong stock_level: ${report.rows.length}`);
        console.log(`\n${'ID'.padEnd(8)} ${'SKU'.padEnd(8)} ${'Stored'.padEnd(10)} ${'Correct'.padEnd(10)} ${'Error'.padEnd(10)} Issue`);
        console.log('-'.repeat(100));
        
        let falseNeg = 0, overstated = 0, understated = 0;
        for (const r of report.rows) {
            const issueType = r.issue_type;
            if (issueType === 'FALSELY NEGATIVE') falseNeg++;
            else if (issueType === 'OVERSTATED') overstated++;
            else understated++;

            console.log(
                `${String(r.id).padEnd(8)} ${String(r.sku).padEnd(8)} ${String(r.stored_stock).padEnd(10)} ${String(r.correct_stock).padEnd(10)} ${String(r.error_amount).padEnd(10)} ${issueType}  ${r.name}`
            );
        }

        console.log(`\n--- SUMMARY ---`);
        console.log(`Falsely showing negative (should be positive): ${falseNeg}`);
        console.log(`Overstated (stock_level too high):             ${overstated}`);
        console.log(`Understated (stock_level too low):             ${understated}`);
        console.log(`Total affected products:                       ${report.rows.length}`);

        // Also show total stock value impact
        const valueImpact = await pool.query(`
            WITH tx_sums AS (
                SELECT product_id, SUM(quantity::numeric) as computed_stock
                FROM inventory_transactions WHERE company_id = 54 GROUP BY product_id
            )
            SELECT 
                SUM(ABS((p.stock_level::numeric - COALESCE(ts.computed_stock, 0)) * COALESCE(p.cost_price::numeric, 0))) as total_value_discrepancy
            FROM products p
            LEFT JOIN tx_sums ts ON ts.product_id = p.id
            WHERE p.company_id = 54 AND p.is_active = true
              AND ABS(p.stock_level::numeric - COALESCE(ts.computed_stock, 0)) > 0.01
        `);
        console.log(`\nEstimated inventory value discrepancy: $${Number(valueImpact.rows[0].total_value_discrepancy || 0).toFixed(2)}`);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

main();
