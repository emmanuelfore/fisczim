import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const c = await db.execute(sql`SELECT id, name, trading_name, inventory_valuation_method FROM companies WHERE name ILIKE '%spare%' OR trading_name ILIKE '%spare%'`);
  console.log("companies", c.rows);
  for (const co of c.rows as any[]) {
    const b = await db.execute(sql`SELECT id, name, city, fdms_device_id, is_active FROM branches WHERE company_id=${co.id}`);
    console.log("branches", co.id, b.rows); console.log("b22/23", (await db.execute(sql`SELECT id, company_id, name FROM branches WHERE id IN (22,23)`)).rows);
    const l = await db.execute(sql`SELECT id, name, type, branch_id, is_default_receiving FROM inventory_locations WHERE company_id=${co.id}`);
    console.log("locations", l.rows);
    const p = await db.execute(sql`SELECT count(*), sum(stock_level) FROM products WHERE company_id=${co.id}`);
    console.log("products", p.rows);
    const bs = await db.execute(sql`SELECT bs.branch_id, count(*), sum(bs.stock_level) FROM branch_stocks bs JOIN products p ON p.id=bs.product_id WHERE p.company_id=${co.id} GROUP BY bs.branch_id`);
    console.log("branch_stocks", bs.rows);
    const ls = await db.execute(sql`SELECT ls.location_id, count(*), sum(ls.stock_level) FROM inventory_location_stocks ls JOIN products p ON p.id=ls.product_id WHERE p.company_id=${co.id} GROUP BY ls.location_id`);
    console.log("location_stocks", ls.rows);
    const inv = await db.execute(sql`SELECT branch_id, count(*) FROM invoices WHERE company_id=${co.id} GROUP BY branch_id`);
    console.log("invoices by branch", inv.rows);
    const sample = await db.execute(sql`SELECT id,name,sku,description,category,price,cost_price,tax_rate,tax_type_id,tax_category_id,hs_code,is_tracked,stock_level FROM products WHERE company_id=${co.id} ORDER BY id DESC LIMIT 3`);
    console.log("sample", sample.rows);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
