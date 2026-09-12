const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
const COMPANY_ID = 89;

async function run() {
  await client.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Creating Test Products...');
    // Create Raw Materials
    const prodRes = await client.query(`
      INSERT INTO products (company_id, name, sku, product_type, stock_level, cost_price, price) VALUES 
      ($1, 'Glossy Label Paper Roll', 'RAW-PAPER-01', 'RAW_MATERIAL', 5000, 0.50, 0),
      ($1, 'Premium Black Ink', 'RAW-INK-BLK', 'RAW_MATERIAL', 200, 15.00, 0),
      ($1, 'Premium Cyan Ink', 'RAW-INK-CYN', 'RAW_MATERIAL', 200, 15.00, 0),
      ($1, 'Adhesive Backing', 'RAW-ADH-01', 'RAW_MATERIAL', 1000, 1.20, 0),
      ($1, 'Vintage Wine Label (Finished Good)', 'FG-WINE-VNT', 'INVENTORY', 0, 0.00, 15.50)
      RETURNING id, sku
    `, [COMPANY_ID]);
    
    const products = prodRes.rows.reduce((acc, row) => ({ ...acc, [row.sku]: row.id }), {});

    console.log('Creating Work Centers...');
    // Create Work Centers
    const wcRes = await client.query(`
      INSERT INTO manufacturing_work_centers (company_id, name, code, cost_per_hour, overhead_rate) VALUES
      ($1, 'Digital Printing Station', 'WC-PRINT-01', 45.00, 15.00),
      ($1, 'Die Cutting Station', 'WC-CUT-01', 35.00, 10.00),
      ($1, 'Packaging & Quality', 'WC-PKG-01', 25.00, 5.00)
      RETURNING id, code
    `, [COMPANY_ID]);

    const wcs = wcRes.rows.reduce((acc, row) => ({ ...acc, [row.code]: row.id }), {});

    console.log('Creating Machines...');
    // Create Machines
    await client.query(`
      INSERT INTO manufacturing_machines (work_center_id, name, code) VALUES
      ($1, 'HP Indigo Digital Press', 'MACH-HP-01'),
      ($2, 'Rotary Die Cutter', 'MACH-DIE-01')
    `, [wcs['WC-PRINT-01'], wcs['WC-CUT-01']]);

    console.log('Creating BOM...');
    // Create BOM
    const bomRes = await client.query(`
      INSERT INTO bill_of_materials (company_id, product_id, name, version) VALUES
      ($1, $2, 'Vintage Wine Label Master BOM', '1.0')
      RETURNING id
    `, [COMPANY_ID, products['FG-WINE-VNT']]);
    const bomId = bomRes.rows[0].id;

    // Create BOM Lines
    await client.query(`
      INSERT INTO bom_lines (bom_id, component_product_id, quantity, unit_of_measure, scrap_percentage) VALUES
      ($1, $2, 0.5, 'meters', 2.0),
      ($1, $3, 0.05, 'liters', 0.5),
      ($1, $4, 0.05, 'liters', 0.5),
      ($1, $5, 0.5, 'meters', 1.0)
    `, [bomId, products['RAW-PAPER-01'], products['RAW-INK-BLK'], products['RAW-INK-CYN'], products['RAW-ADH-01']]);

    console.log('Creating Routing...');
    // Create Routing
    const routRes = await client.query(`
      INSERT INTO manufacturing_routings (company_id, product_id, name, version) VALUES
      ($1, $2, 'Standard Label Production Flow', '1.0')
      RETURNING id
    `, [COMPANY_ID, products['FG-WINE-VNT']]);
    const routingId = routRes.rows[0].id;

    // Create Routing Operations
    await client.query(`
      INSERT INTO manufacturing_routing_operations (routing_id, sequence, work_center_id, name, setup_time_minutes, operation_time_minutes, basis_quantity) VALUES
      ($1, 10, $2, 'Print Labels', 30, 2, 100),
      ($1, 20, $3, 'Die Cut to Shape', 15, 1, 100),
      ($1, 30, $4, 'Inspect & Box', 5, 5, 100)
    `, [routingId, wcs['WC-PRINT-01'], wcs['WC-CUT-01'], wcs['WC-PKG-01']]);

    console.log('Creating Standard Cost...');
    // Create Standard Cost
    await client.query(`
      INSERT INTO standard_costs (company_id, product_id, material_cost, labor_cost, overhead_cost, total_cost, effective_from) VALUES
      ($1, $2, 3.50, 1.25, 0.75, 5.50, NOW())
    `, [COMPANY_ID, products['FG-WINE-VNT']]);

    await client.query('COMMIT');
    console.log('Test Data Seeded Successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
  } finally {
    await client.end();
  }
}

run();
