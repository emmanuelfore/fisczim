import pg from 'pg';

async function run() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log("Connected directly via PG client.");
    
    await client.query(`
        UPDATE products 
        SET tax_rate = 15.50, tax_type_id = 82 
        WHERE company_id = 60 AND product_type = 'good'
    `);
    
    await client.query(`
        UPDATE products 
        SET tax_rate = 0.00, tax_type_id = 81, hs_code = '99003000' 
        WHERE company_id = 60 AND product_type = 'service' AND name ILIKE '%deposit%'
    `);
    
    await client.query(`
        UPDATE products 
        SET tax_rate = 15.50, tax_type_id = 82, hs_code = '99001000' 
        WHERE company_id = 60 AND product_type = 'service' AND name NOT ILIKE '%deposit%'
    `);

    console.log("Successfully ran bulk SQL updates!");
  } catch (e) {
    console.error("SQL Error:", e);
  } finally {
    await client.end();
  }
}
run();
