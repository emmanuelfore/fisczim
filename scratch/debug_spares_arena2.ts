import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.tzczbbsdvrlonwjwcwss:9TPewLiNYgoeu406@aws-1-eu-west-2.pooler.supabase.com:5432/postgres";

async function main() {
    const pool = new Pool({ connectionString });
    try {
        // GRV items with product info
        const items = await pool.query(`
            SELECT gdn.id as gdn_id, gdn.gdn_number, gdn.status, gdn.confirmed_grv_number,
                   i.id as item_id, i.product_id, i.description, i.quantity_received, i.unit_cost,
                   p.name as product_name, p.is_active
            FROM goods_delivery_notes gdn 
            JOIN goods_delivery_note_items i ON i.gdn_id = gdn.id 
            LEFT JOIN products p ON p.id = i.product_id 
            WHERE gdn.company_id = 54
        `);
        console.log('GRV Items with product info:');
        console.log(JSON.stringify(items.rows, null, 2));

        // Product counts
        const totalProds = await pool.query(`
            SELECT 
                COUNT(*) as total, 
                SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN NOT is_active THEN 1 ELSE 0 END) as inactive
            FROM products WHERE company_id = 54
        `);
        console.log('\nProduct counts (total/active/inactive):', totalProds.rows[0]);

        // Check inventory transactions of type STOCK_IN for company 54
        const stockInTx = await pool.query(`
            SELECT id, product_id, type, quantity, reference_type, reference_id, created_at 
            FROM inventory_transactions 
            WHERE company_id = 54 AND type = 'STOCK_IN' 
            ORDER BY created_at DESC LIMIT 10
        `);
        console.log('\nSTOCK_IN transactions for company 54:');
        console.log(JSON.stringify(stockInTx.rows, null, 2));
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

main();
