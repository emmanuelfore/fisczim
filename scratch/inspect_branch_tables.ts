import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
async function main() {
  const t = (await db.execute(sql`SELECT c1.table_name FROM information_schema.columns c1 JOIN information_schema.columns c2 ON c1.table_name=c2.table_name AND c2.column_name='branch_id' AND c2.table_schema='public' WHERE c1.column_name='company_id' AND c1.table_schema='public'`)).rows as any[];
  for (const r of t) {
    const n = (await db.execute(sql.raw(`SELECT count(*)::int n FROM "${r.table_name}" WHERE company_id=54 AND branch_id IS NULL`))).rows[0] as any;
    if (n.n) console.log(r.table_name, n.n);
  }
  console.log("inv_tx types", (await db.execute(sql`SELECT DISTINCT type FROM inventory_transactions WHERE company_id=54`)).rows);
  console.log("cols", (await db.execute(sql`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='inventory_transactions'`)).rows.map((r:any)=>r.column_name+(r.is_nullable==='NO'?'*':'')).join(","));
  process.exit(0);
}
main();
