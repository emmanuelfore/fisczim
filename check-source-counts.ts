import pg from "pg";
const { Pool } = pg;
const source = new Pool({ connectionString: "postgresql://postgres.nopztclveukecdabuist:%23Ndakapenga4710@aws-1-eu-west-3.pooler.supabase.com:6543/postgres", ssl:{rejectUnauthorized:false}});
async function run(){
  const tables = ["company_role_permissions","company_users","company_access_roles","branches","branch_users","products","customers"];
  for(const t of tables){
    const r = await source.query(`SELECT count(*) FROM "public"."${t}"`);
    console.log(t, r.rows[0].count);
  }
  await source.end();
}
run();
