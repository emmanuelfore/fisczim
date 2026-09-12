import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const tables = ["bus_vehicles","bus_routes","bus_trips","bus_tickets","bus_shifts","bus_reconciliations"];
for (const t of tables) {
  const res = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
  console.log("==== "+t+" ====");
  for (const c of res.rows) console.log(`  ${c.column_name}  ${c.data_type}  null=${c.is_nullable}  def=${c.column_default||''}`);
}
const tab = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'bus_%' ORDER BY tablename`);
console.log("BUS TABLES:", tab.rows.map(r=>r.tablename).join(", "));
await pool.end();
