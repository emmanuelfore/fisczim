import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  const r = await pool.query("SELECT id,email,username FROM public.users WHERE username='admin'");
  console.log("admin username:", r.rows);
  const r2 = await pool.query("SELECT id,email,username FROM public.users WHERE email='admin@zimra.co.zw'");
  console.log("admin@zimra by email:", r2.rows);
  const cnt = await pool.query("SELECT count(*) FROM public.users");
  console.log("total", cnt.rows[0].count);
  await pool.end();
}
run();
