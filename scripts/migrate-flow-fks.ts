import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    console.log("Starting document flow migration...");

    // 1. Add quotation_item_id to sales_order_items
    console.log("Adding quotation_item_id to sales_order_items...");
    await pool.query(`
      ALTER TABLE sales_order_items 
      ADD COLUMN IF NOT EXISTS quotation_item_id INTEGER REFERENCES quotation_items(id);
    `);

    // 2. Clean up orphaned data before applying FKs
    console.log("Cleaning up orphaned sales_order_id on invoices...");
    await pool.query(`
      UPDATE invoices 
      SET sales_order_id = NULL 
      WHERE sales_order_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM sales_orders WHERE id = invoices.sales_order_id);
    `);

    console.log("Cleaning up orphaned sales_order_item_id on invoice_items...");
    await pool.query(`
      UPDATE invoice_items 
      SET sales_order_item_id = NULL 
      WHERE sales_order_item_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM sales_order_items WHERE id = invoice_items.sales_order_item_id);
    `);

    // 3. Apply FK constraints
    console.log("Applying FK constraints...");
    
    // Check if constraint exists for invoices before adding
    const invoiceFkCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'invoices' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'invoices_sales_order_id_sales_orders_id_fk';
    `);
    
    if (invoiceFkCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE invoices 
        ADD CONSTRAINT invoices_sales_order_id_sales_orders_id_fk 
        FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
      `);
    }

    // Check if constraint exists for invoice_items before adding
    const invoiceItemFkCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'invoice_items' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'invoice_items_sales_order_item_id_sales_order_items_id_fk';
    `);
    
    if (invoiceItemFkCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE invoice_items 
        ADD CONSTRAINT invoice_items_sales_order_item_id_sales_order_items_id_fk 
        FOREIGN KEY (sales_order_item_id) REFERENCES sales_order_items(id);
      `);
    }

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Error running migration:", error);
  } finally {
    await pool.end();
  }
}

main();
