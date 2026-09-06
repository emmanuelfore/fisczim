import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  await pool.query("UPDATE public.users SET is_super_admin=true WHERE id='68f7c0d2-a0cd-4015-9c2d-1bf6a721bc9f'");
  const r = await pool.query("SELECT email,is_super_admin FROM public.users WHERE id='68f7c0d2-a0cd-4015-9c2d-1bf6a721bc9f'");
  console.log(r.rows);
  const cnt = await pool.query("SELECT count(*) FROM public.users");
  console.log("total", cnt.rows[0].count);
  await pool.end();
}
run();
