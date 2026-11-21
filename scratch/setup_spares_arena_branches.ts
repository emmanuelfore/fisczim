/**
 * Spares Arena (company 54): "Harare Kaguvi" branch (owns all existing data)
 * + fresh "Bulawayo" branch stocked from bula.csv. Branch stocks are separate.
 *
 * Re-runnable / chunked:
 *   npx tsx scratch/setup_spares_arena_branches.ts --offset 0 --limit 100
 *   npx tsx scratch/setup_spares_arena_branches.ts --offset 100 --limit 200
 * First run also creates branches and assigns existing data to Kaguvi (once only).
 * Items already stocked in Bulawayo are skipped, so overlapping chunks are safe.
 * Each run is one transaction.
 */
import "dotenv/config";
import fs from "fs";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const COMPANY_ID = 54;
const MAIN_WAREHOUSE_ID = 33;
const TABLES = ["inventory_transactions", "journal_entries", "pos_holds", "pos_shifts", "stock_takes", "invoices", "payments"];
const arg = (n: string, d: number) => { const i = process.argv.indexOf(n); return i > -1 ? Number(process.argv[i + 1]) : d; };
const OFFSET = arg("--offset", 0);
const LIMIT = arg("--limit", 100);

function parse(line: string) {
  const out: string[] = []; let cur = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out.map(s => s.trim());
}

function loadItems() {
  const lines = fs.readFileSync("bula.csv", "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  const items = new Map<string, { name: string; desc: string; price: number; dept: string; qty: number }>();
  for (const r of lines.slice(1).map(parse)) {
    const [name = "", desc = "", price = "", dept = "", qty = ""] = r;
    if (!name) continue;
    const key = name.toUpperCase();
    const q = Math.max(0, Number(qty) || 0); // negatives -> 0
    const ex = items.get(key);
    if (ex) ex.qty += q; else items.set(key, { name, desc, price: Number(price) || 0, dept, qty: q });
  }
  return [...items.values()];
}

async function ensureBranches(tx: any) {
  const rows = (await tx.execute(sql`SELECT id, name FROM branches WHERE company_id=${COMPANY_ID}`)).rows as any[];
  let kag = rows.find(r => r.name === "Harare Kaguvi")?.id;
  let bya = rows.find(r => r.name === "Bulawayo")?.id;

  if (!kag) {
    const before = (await tx.execute(sql`SELECT coalesce(sum(stock_level),0)::numeric s FROM inventory_location_stocks WHERE location_id=${MAIN_WAREHOUSE_ID}`)).rows[0].s;
    const invBefore = (await tx.execute(sql`SELECT count(*)::int n, coalesce(sum(total),0)::numeric s FROM invoices WHERE company_id=${COMPANY_ID}`)).rows[0];
    kag = (await tx.execute(sql`INSERT INTO branches (company_id, name, code, city, is_active) VALUES (${COMPANY_ID}, 'Harare Kaguvi', 'HRE-KAGUVI', 'Harare', true) RETURNING id`)).rows[0].id;
    for (const t of TABLES) {
      const res = await tx.execute(sql.raw(`UPDATE "${t}" SET branch_id=${kag} WHERE company_id=${COMPANY_ID} AND branch_id IS NULL`));
      console.log(`  ${t}: ${res.rowCount} -> Kaguvi`);
    }
    await tx.execute(sql`UPDATE inventory_locations SET branch_id=${kag}, name='Harare Kaguvi Stock', updated_at=now() WHERE id=${MAIN_WAREHOUSE_ID} AND company_id=${COMPANY_ID}`);
    await tx.execute(sql`INSERT INTO branch_stocks (branch_id, product_id, stock_level, low_stock_threshold)
      SELECT ${kag}, ls.product_id, ls.stock_level, coalesce(p.low_stock_threshold, 10)
      FROM inventory_location_stocks ls JOIN products p ON p.id=ls.product_id WHERE ls.location_id=${MAIN_WAREHOUSE_ID}`);
    const kagStock = (await tx.execute(sql`SELECT coalesce(sum(stock_level),0)::numeric s FROM branch_stocks WHERE branch_id=${kag}`)).rows[0].s;
    const invAfter = (await tx.execute(sql`SELECT count(*)::int n, coalesce(sum(total),0)::numeric s FROM invoices WHERE company_id=${COMPANY_ID}`)).rows[0];
    if (Number(kagStock) !== Number(before)) throw new Error("Kaguvi stock mismatch");
    if (invAfter.n !== invBefore.n || Number(invAfter.s) !== Number(invBefore.s)) throw new Error("Invoices changed");
    console.log(`  Kaguvi created (id ${kag}), stock ${kagStock}, invoices ${invAfter.n} unchanged`);
  }
  if (!bya) {
    bya = (await tx.execute(sql`INSERT INTO branches (company_id, name, code, city, is_active) VALUES (${COMPANY_ID}, 'Bulawayo', 'BYO', 'Bulawayo', true) RETURNING id`)).rows[0].id;
    await tx.execute(sql`INSERT INTO inventory_locations (company_id, type, name, code, branch_id, is_default_receiving, is_default_dispatch, is_active)
      VALUES (${COMPANY_ID}, 'BRANCH', 'Bulawayo Stock', 'BYO-STOCK', ${bya}, false, false, true)`);
    console.log(`  Bulawayo created (id ${bya})`);
  }
  const byaLoc = (await tx.execute(sql`SELECT id FROM inventory_locations WHERE branch_id=${bya} LIMIT 1`)).rows[0].id;
  return { kag, bya, byaLoc };
}

async function main() {
  const all = loadItems();
  const chunk = all.slice(OFFSET, OFFSET + LIMIT);
  console.log(`CSV unique items: ${all.length}. Processing ${OFFSET}..${OFFSET + chunk.length - 1}`);

  await db.transaction(async (tx: any) => {
    const { bya, byaLoc } = await ensureBranches(tx);

    const def = (await tx.execute(sql`SELECT
        mode() WITHIN GROUP (ORDER BY tax_rate) tax_rate, mode() WITHIN GROUP (ORDER BY hs_code) hs_code,
        mode() WITHIN GROUP (ORDER BY tax_type_id) tax_type_id, mode() WITHIN GROUP (ORDER BY tax_category_id) tax_category_id,
        mode() WITHIN GROUP (ORDER BY is_tracked) is_tracked
      FROM products WHERE company_id=${COMPANY_ID}`)).rows[0];

    const existing = (await tx.execute(sql`SELECT id, name, description, cost_price FROM products WHERE company_id=${COMPANY_ID} ORDER BY id`)).rows as any[];
    const byName = new Map<string, any>();
    for (const p of existing) for (const k of [p.name, p.description]) {
      const key = String(k || "").trim().toUpperCase();
      if (key && !byName.has(key)) byName.set(key, p);
    }
    const stocked = new Set(((await tx.execute(sql`SELECT product_id FROM branch_stocks WHERE branch_id=${bya}`)).rows as any[]).map(r => r.product_id));

    let matched = 0, created = 0, skipped = 0, units = 0;
    for (const it of chunk) {
      // Prefer exact name match; a product already stocked in Bulawayo = this item was already imported
      let p = byName.get(it.name.toUpperCase());
      if (p && stocked.has(p.id)) { skipped++; continue; }
      if (!p && it.desc) { p = byName.get(it.desc.toUpperCase()); if (p && stocked.has(p.id)) p = undefined; }
      if (p) matched++;
      else {
        p = (await tx.execute(sql`INSERT INTO products (company_id, name, description, price, category, tax_rate, hs_code, tax_type_id, tax_category_id, is_tracked, stock_level, product_type, is_active)
          VALUES (${COMPANY_ID}, ${it.name}, ${it.desc || null}, ${it.price.toFixed(2)}, ${it.dept || null}, ${def.tax_rate ?? "15.00"}, ${def.hs_code}, ${def.tax_type_id}, ${def.tax_category_id}, ${def.is_tracked ?? true}, 0, 'good', true)
          RETURNING id, cost_price`)).rows[0];
        byName.set(it.name.toUpperCase(), p);
        created++;
      }
      stocked.add(p.id);
      const q = it.qty;
      await tx.execute(sql`INSERT INTO branch_stocks (branch_id, product_id, stock_level) VALUES (${bya}, ${p.id}, ${q})`);
      if (q <= 0) continue;
      units += q;
      const cost = Number(p.cost_price || 0);
      await tx.execute(sql`INSERT INTO inventory_location_stocks (location_id, product_id, stock_level, reserved_quantity, available_quantity) VALUES (${byaLoc}, ${p.id}, ${q}, 0, ${q})`);
      await tx.execute(sql`INSERT INTO inventory_transactions (company_id, branch_id, location_id, product_id, type, quantity, unit_cost, total_cost, remaining_quantity, reference_type, notes)
        VALUES (${COMPANY_ID}, ${bya}, ${byaLoc}, ${p.id}, 'STOCK_IN', ${q}, ${cost}, ${cost * q}, ${q}, 'OPENING_STOCK', 'Bulawayo opening stock (bula.csv)')`);
      await tx.execute(sql`UPDATE products SET stock_level = coalesce(stock_level,0) + ${q} WHERE id=${p.id}`);
    }
    const byaStock = (await tx.execute(sql`SELECT count(*)::int n, coalesce(sum(stock_level),0)::numeric s FROM branch_stocks WHERE branch_id=${bya}`)).rows[0];
    console.log({ matched, created, skipped, unitsThisChunk: units, bulawayoTotal: byaStock });
  });
  console.log(`COMMITTED. Next: --offset ${OFFSET + LIMIT} --limit ${LIMIT}`);
  process.exit(0);
}
main().catch(e => { console.error("FAILED (rolled back):", e); process.exit(1); });
