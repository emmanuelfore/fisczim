import "dotenv/config";
import fs from "fs";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

function parse(line: string) {
  const out: string[] = []; let cur = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out.map(s => s.trim());
}

async function main() {
  const lines = fs.readFileSync("bula.csv", "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1).map(parse);
  const existing = (await db.execute(sql`SELECT id, name, sku, stock_level FROM products WHERE company_id=54`)).rows as any[];
  const byName = new Map(existing.map(p => [p.name.trim().toUpperCase(), p]));
  const bySku = new Map(existing.filter(p => p.sku).map(p => [String(p.sku).trim().toUpperCase(), p]));
  let mName = 0, mDesc = 0, mSku = 0, qtyPos = 0, qtySum = 0, badPrice = 0;
  const depts = new Map<string, number>(); const dupNames = new Map<string, number>();
  for (const r of rows) {
    const [name = "", desc = "", price = "", dept = "", qty = ""] = r;
    if (byName.has(name.toUpperCase())) mName++;
    if (byName.has(desc.toUpperCase())) mDesc++;
    if (bySku.has(name.toUpperCase())) mSku++;
    const q = Number(qty); if (q > 0) { qtyPos++; qtySum += q; }
    if (isNaN(Number(price))) badPrice++;
    depts.set(dept, (depts.get(dept) || 0) + 1);
    dupNames.set(name.toUpperCase(), (dupNames.get(name.toUpperCase()) || 0) + 1);
  }
  console.log({ rows: rows.length, mName, mDesc, mSku, qtyPos, qtySum, badPrice, dupInCsv: [...dupNames].filter(([, c]) => c > 1).length });
  console.log("depts", [...depts]);
  console.log("existing sample names", existing.slice(0, 8).map(p => p.name));
  console.log("negative/neg qty rows", rows.filter(r => Number(r[4]) < 0).length);
  const co = (await db.execute(sql`SELECT fdms_device_id, fiscal_day_open, current_fiscal_day_no FROM companies WHERE id=54`)).rows;
  console.log("company fiscal", co);
  const tx = (await db.execute(sql`SELECT branch_id, count(*) FROM inventory_transactions WHERE company_id=54 GROUP BY branch_id`)).rows;
  console.log("inv tx by branch", tx);
  console.log("branch 23", (await db.execute(sql`SELECT id, company_id, name FROM branches WHERE id=23`)).rows);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
