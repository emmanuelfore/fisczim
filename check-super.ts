import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  const r = await pool.query(`SELECT id,email,name,username,is_super_admin FROM public.users WHERE is_super_admin=true`);
  console.log("superusers:", r.rows);
  const r2 = await pool.query(`SELECT id,email,name FROM public.users WHERE lower(email)='admin@zimra.co.zw'`);
  console.log("admin@zimra:", r2.rows);
  const r3 = await pool.query(`SELECT id,email,name FROM public.users WHERE id='9482b181-9109-4012-8d65-291488268746'`);
  console.log("manuchidovi3:", r3.rows);
  await pool.end();
}
run();
