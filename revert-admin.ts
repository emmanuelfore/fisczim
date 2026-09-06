import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  await pool.query(`UPDATE public.users SET email='manuchidovi3@gmail.com', username='manuchidovi3', name='admin@zimra.co.zw', password='$2a$10$YYcMvxizfcXY1sFNrdmC6OKzaaw/XGuH8IUAIpYa1uA043yDIWBTK', is_super_admin=false WHERE id='9482b181-9109-4012-8d65-291488268746'`);
  console.log("reverted manuchidovi3");
  const r = await pool.query(`SELECT id,email,is_super_admin FROM public.users WHERE id='9482b181-9109-4012-8d65-291488268746'`);
  console.log(r.rows);
  await pool.end();
}
run();
