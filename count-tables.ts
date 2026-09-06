import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  const tables = ["companies","company_users","branches","branch_users","company_roles","company_role_permissions","company_access_roles","products","customers","invoices","currencies","tax_types","inventory_locations","employees","company_partners"];
  for(const t of tables){
    try{
      const r = await pool.query(`SELECT count(*) FROM ${t}`);
      console.log(t, r.rows[0].count);
      if(t==="company_users" || t==="company_roles"){
        const roles = await pool.query(`SELECT role, count(*) FROM ${t} GROUP BY role`).catch(()=>null);
        if(roles) console.log("  roles", roles.rows);
        if(t==="company_roles"){
          const rr = await pool.query(`SELECT name, count(*) FROM ${t} GROUP BY name`).catch(()=>null);
          if(rr) console.log("  names", rr.rows);
        }
      }
    }catch(e:any){ console.log(t, "error", e.message.slice(0,60)); }
  }
  await pool.end();
}
run();
