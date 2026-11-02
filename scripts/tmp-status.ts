import "dotenv/config";
import { db } from "../server/db.js";
(async () => {
  const a: any = await db.execute(`select status, count(*)::int n from invoices group by status order by n desc`);
  console.log("invoices.status:", JSON.stringify(a.rows ?? a));
  const b: any = await db.execute(`select status, count(*)::int n from supplier_invoices group by status order by n desc`);
  console.log("supplier_invoices.status:", JSON.stringify(b.rows ?? b));
  const c: any = await db.execute(`select validation_status, count(*)::int n from invoices group by validation_status order by n desc limit 8`);
  console.log("invoices.validation_status:", JSON.stringify(c.rows ?? c));
  process.exit(0);
})();
