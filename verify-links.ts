import "dotenv/config";
import { pool } from "./server/db.js";
async function run(){
  const orphans = await pool.query(`SELECT count(*) FROM company_users cu LEFT JOIN users u ON u.id=cu.user_id WHERE u.id IS NULL`);
  console.log("orphan company_users (no user):", orphans.rows[0].count);
  const noCompany = await pool.query(`SELECT count(*) FROM users u LEFT JOIN company_users cu ON cu.user_id=u.id WHERE cu.user_id IS NULL`);
  console.log("users with no company:", noCompany.rows[0].count);
  const links = await pool.query(`SELECT u.email, c.name as company, cu.role FROM company_users cu JOIN users u ON u.id=cu.user_id JOIN companies c ON c.id=cu.company_id LIMIT 10`);
  console.log("sample links:", links.rows);
  const cnt = await pool.query(`SELECT count(*) FROM company_users`);
  console.log("total links", cnt.rows[0].count);
  await pool.end();
}
run();
