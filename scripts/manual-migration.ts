import { pool } from "../server/db.js";
import { config } from "dotenv";
config();

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log("Creating sales_orders...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        branch_id INTEGER REFERENCES branches(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        quotation_id INTEGER REFERENCES quotations(id),
        order_number TEXT NOT NULL,
        issue_date TIMESTAMP DEFAULT NOW(),
        due_date TIMESTAMP,
        subtotal NUMERIC(10,2) NOT NULL,
        tax_amount NUMERIC(10,2) NOT NULL,
        total NUMERIC(10,2) NOT NULL,
        status TEXT DEFAULT 'draft' NOT NULL,
        currency TEXT DEFAULT 'USD',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Creating sales_order_items...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_order_items (
        id SERIAL PRIMARY KEY,
        sales_order_id INTEGER NOT NULL REFERENCES sales_orders(id),
        product_id INTEGER REFERENCES products(id),
        description TEXT NOT NULL,
        quantity NUMERIC(10,2) NOT NULL,
        invoiced_quantity NUMERIC(10,2) DEFAULT '0.00' NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL,
        tax_rate NUMERIC(5,2) NOT NULL,
        line_total NUMERIC(10,2) NOT NULL,
        tax_type_id INTEGER REFERENCES tax_types(id)
      );
    `);

    console.log("Creating customer_products...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_products (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        is_exclusive BOOLEAN DEFAULT FALSE NOT NULL,
        customer_sku TEXT,
        artwork_version TEXT,
        spec_reference TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Creating customer_stock...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_stock (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        customer_id INTEGER REFERENCES customers(id),
        batch_id INTEGER REFERENCES product_batches(id),
        quantity NUMERIC(10,2) DEFAULT '0' NOT NULL,
        uom TEXT,
        status TEXT DEFAULT 'AVAILABLE' NOT NULL,
        last_movement_date TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Altering invoices...");
    await client.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_order_id INTEGER;
    `);

    console.log("Altering invoice_items...");
    await client.query(`
      ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS sales_order_item_id INTEGER;
    `);

    await client.query('COMMIT');
    console.log("Manual migration successful!");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Migration failed:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
