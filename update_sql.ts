import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    // 1. Update goods to VAT 15.5% (tax_type_id = 82)
    await db.execute(sql`
        UPDATE products 
        SET tax_rate = 15.50, tax_type_id = 82 
        WHERE company_id = 60 AND product_type = 'good'
    `);
    
    // 2. Update service deposits to EXE 0% (tax_type_id = 81), hs_code = '99003000'
    await db.execute(sql`
        UPDATE products 
        SET tax_rate = 0.00, tax_type_id = 81, hs_code = '99003000' 
        WHERE company_id = 60 AND product_type = 'service' AND name ILIKE '%deposit%'
    `);
    
    // 3. Update other services to VAT 15.5% (tax_type_id = 82), hs_code = '99001000'
    await db.execute(sql`
        UPDATE products 
        SET tax_rate = 15.50, tax_type_id = 82, hs_code = '99001000' 
        WHERE company_id = 60 AND product_type = 'service' AND name NOT ILIKE '%deposit%'
    `);

    console.log("Successfully ran bulk SQL updates!");
  } catch (e) {
    console.error("SQL Error:", e);
  } finally {
    await pool.end();
  }
}
run();
