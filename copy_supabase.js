// Node fallback if pg_dump not available — copies all public tables via two pools
import pg from "pg";
const { Pool } = pg;

const SOURCE_URL = process.env.SOURCE_URL || "postgresql://postgres.nopztclveukecdabuist:%23Ndakapenga4710@aws-1-eu-west-3.pooler.supabase.com:6543/postgres";
const TARGET_URL = process.env.DATABASE_URL || "postgresql://postgres:2512@161.97.115.59:5432/fisczim";

const source = new Pool({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } });
const target = new Pool({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });

async function copyTable(table) {
  const cols = await source.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  if (!cols.rows.length) return;
  const colNames = cols.rows.map(r => `"${r.column_name}"`).join(", ");
  const data = await source.query(`SELECT ${colNames} FROM "public"."${table}"`);
  if (!data.rows.length) { console.log(`${table}: 0 rows`); return; }
  let inserted = 0;
  const batchSize = 500;
  for(let i=0;i<data.rows.length;i+=batchSize){
    const batch = data.rows.slice(i, i+batchSize);
    const values = [];
    const params = [];
    let idx = 1;
    for(const row of batch){
      const placeholders = cols.rows.map(()=>`$${idx++}`);
      values.push(`(${placeholders.join(", ")})`);
      for(const c of cols.rows) params.push(row[c.column_name]);
    }
    try{
      await target.query(`INSERT INTO "public"."${table}" (${colNames}) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`, params);
      inserted += batch.length;
    }catch(e){
      // fallback to row-by-row for this batch
      for(const row of batch){
        const vals = cols.rows.map(r => row[r.column_name]);
        const ph = cols.rows.map((_,k)=>`$${k+1}`).join(", ");
        try{ await target.query(`INSERT INTO "public"."${table}" (${colNames}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals); inserted++; }catch(ee){ /* ignore */ }
      }
    }
  }
  console.log(`${table}: ${inserted}/${data.rows.length} inserted`);
}

async function run(){
  const tables = await source.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
  console.log("Tables:", tables.rows.map(r=>r.table_name).join(", "));
  // copy in dependency-safe order: users, companies first
  const priority = ["users","companies","company_roles","company_role_permissions","company_users","branches","branch_users","company_access_roles"];
  const ordered = [...priority.filter(p=>tables.rows.some(r=>r.table_name===p)), ...tables.rows.map(r=>r.table_name).filter(t=>!priority.includes(t))];
  for(const t of ordered) await copyTable(t);
  await source.end(); await target.end();
  console.log("Done");
}
run().catch(e=>{console.error(e); process.exit(1);});
