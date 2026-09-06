import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  const missing = [
    ["68f7c0d2-a0cd-4015-9c2d-1bf6a721bc9f","admin@zimra.co.zw","$2a$10$I/jYrdrCNi9xd61x2JDcmu2FphpThSP41YtfNIuHeR5bNSmMuwNP6","System Super Admin","admin_zimra",true,"2026-01-26 07:00:56.688987+00"],
    ["b1db605f-1fc5-4efa-b73d-55df29bd4283","admin@cia.co.zw","$2a$10$brp.bTzqdw67bU0iG3CuQO0X9k/ED2PzKovzNZcVeMNjr7husXSO6","Sharleen Mango","admin_cia",true,"2026-08-05 10:48:39.550885+00"],
    ["bca99c1c-3ace-4849-9b64-7782d1e4b4ce","admin@appollos.co.zw","$2a$10$akoVLLrgFJJkgTxAruMHhuzAVVFZlEsOWBQNcp5KYTU2yLIPtucja","Cecelia Kagura","admin_appollos",true,"2026-07-17 13:51:08.142528+00"],
  ];
  for(const [id,email,password,name,username,changed,created] of missing){
    try{
      await pool.query(`INSERT INTO public.users (id,email,password,name,username,password_changed,created_at,is_super_admin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, password=EXCLUDED.password, name=EXCLUDED.name, username=EXCLUDED.username`, [id,email,password,name,username,changed,created, id==="68f7c0d2-a0cd-4015-9c2d-1bf6a721bc9f"]);
      console.log("inserted", email);
    }catch(e){ console.error(e.message, email); }
  }
  // fix superadmin for zimra
  await pool.query(`UPDATE public.users SET is_super_admin=true WHERE email='admin@zimra.co.zw'`);
  const r = await pool.query(`SELECT email,username,is_super_admin FROM public.users WHERE email='admin@zimra.co.zw'`);
  console.log(r.rows);
  const cnt = await pool.query(`SELECT count(*) FROM public.users`);
  console.log("total", cnt.rows[0].count);
  // also fix duplicate accounts username - make them unique
  const dup = await pool.query(`SELECT username,count(*) FROM public.users GROUP BY username HAVING count(*)>1`);
  console.log("dups", dup.rows);
  await pool.end();
}
run();
