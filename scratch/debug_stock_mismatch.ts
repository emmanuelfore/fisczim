import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function main() {
    const pool = new Pool({ connectionString });
    try {
        // Check ALL products for company 54 where stock_level doesn't match inventory transactions
        const mismatch = await pool.query(`
            WITH tx_sums AS (
                SELECT 
                    product_id,
                    SUM(quantity::numeric) as computed_stock
                FROM inventory_transactions
                WHERE company_id = 54
                GROUP BY product_id
            )
            SELECT 
                p.id, p.name, p.sku, 
                p.stock_level::numeric as stored_stock,
                COALESCE(ts.computed_stock, 0) as computed_stock,
                (p.stock_level::numeric - COALESCE(ts.computed_stock, 0)) as discrepancy
            FROM products p
            LEFT JOIN tx_sums ts ON ts.product_id = p.id
            WHERE p.company_id = 54
              AND p.is_active = true
              AND ABS(p.stock_level::numeric - COALESCE(ts.computed_stock, 0)) > 0.01
            ORDER BY ABS(p.stock_level::numeric - COALESCE(ts.computed_stock, 0)) DESC
            LIMIT 30
        `);

        console.log(`=== Products with stock_level mismatch vs inventory_transactions ===`);
        console.log(`Found ${mismatch.rows.length} products with discrepancies:`);
        console.log(JSON.stringify(mismatch.rows, null, 2));

        // Check stock takes - were they badly applied?
        const stockTakes = await pool.query(`
            SELECT id, status, start_date, completed_at, notes
            FROM stock_takes
            WHERE company_id = 54
            ORDER BY start_date ASC
        `);
        console.log('\n=== Stock Takes for Company 54 ===');
        console.log(JSON.stringify(stockTakes.rows, null, 2));

        // Check stock take #8, #9, #14, #15 (the ones adding big adjustments to product 7589)
        const stItems = await pool.query(`
            SELECT sti.id, sti.stock_take_id, sti.product_id, 
                   sti.system_count, sti.physical_count,
                   p.name as product_name, p.stock_level as current_stock
            FROM stock_take_items sti
            JOIN products p ON p.id = sti.product_id
            WHERE sti.stock_take_id IN (8, 9, 14, 15) AND sti.product_id = 7589
        `);
        console.log('\n=== Stock Take Items for product 7589 in takes 8,9,14,15 ===');
        console.log(JSON.stringify(stItems.rows, null, 2));

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

main();
