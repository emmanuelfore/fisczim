const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const queries = [
    `ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "tax_inclusive" boolean DEFAULT false;`,
    `ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "tax_type_id" integer REFERENCES "tax_types"("id");`,
    `ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL;`,
    `ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "tax_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;`,
    `ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "is_recoverable" boolean DEFAULT true;`,
    
    `ALTER TABLE "goods_delivery_notes" ADD COLUMN IF NOT EXISTS "tax_inclusive" boolean DEFAULT false;`,
    `ALTER TABLE "goods_delivery_note_items" ADD COLUMN IF NOT EXISTS "tax_type_id" integer REFERENCES "tax_types"("id");`,
    `ALTER TABLE "goods_delivery_note_items" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL;`,
    `ALTER TABLE "goods_delivery_note_items" ADD COLUMN IF NOT EXISTS "tax_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;`,
    `ALTER TABLE "goods_delivery_note_items" ADD COLUMN IF NOT EXISTS "is_recoverable" boolean DEFAULT true;`
  ];
  
  for (const q of queries) {
    try {
      await pool.query(q);
      console.log("Success: ", q);
    } catch(err) {
      console.error("Error on: ", q);
      console.error(err.message);
    }
  }
  pool.end();
}

run();
