const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  try {
    console.log("Checking sales_orders foreign keys...");
    const res = await pool.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'sales_orders' AND constraint_type = 'FOREIGN KEY';
    `);
    console.log("Sales Orders FKs:", res.rows);
    
    // We expect something like sales_orders_quotation_id_quotations_id_fk
    for (const row of res.rows) {
      if (row.constraint_name.includes('quotation_id')) {
        console.log("Dropping constraint", row.constraint_name);
        await pool.query(`ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS "${row.constraint_name}";`);
      }
    }
    
    console.log("Adding correct FK for sales_orders...");
    await pool.query(`ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_quotation_id_invoices_id_fk FOREIGN KEY (quotation_id) REFERENCES invoices(id);`);

    console.log("Checking sales_order_items foreign keys...");
    const res2 = await pool.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'sales_order_items' AND constraint_type = 'FOREIGN KEY';
    `);
    
    for (const row of res2.rows) {
      if (row.constraint_name.includes('quotation_item_id')) {
        console.log("Dropping constraint", row.constraint_name);
        await pool.query(`ALTER TABLE sales_order_items DROP CONSTRAINT IF EXISTS "${row.constraint_name}";`);
      }
    }
    
    console.log("Adding correct FK for sales_order_items...");
    await pool.query(`ALTER TABLE sales_order_items ADD CONSTRAINT sales_order_items_quotation_item_id_invoice_items_id_fk FOREIGN KEY (quotation_item_id) REFERENCES invoice_items(id);`);
    
    console.log("Done.");
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
fix();
