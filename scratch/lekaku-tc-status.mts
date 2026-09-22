import "dotenv/config";
import { LekakuDevice } from "../server/lekaku.js";
import pg from "pg";

async function main() {
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  const { rows } = await sql.query("SELECT zimra_private_key, zimra_certificate, lekuka_gateway_url, fdms_device_id FROM companies WHERE id=126");
  await sql.end();
  const co = rows[0];
  const device = new LekakuDevice({
    baseUrl: co.lekuka_gateway_url,
    deviceId: String(co.fdms_device_id),
    privateKey: co.zimra_private_key,
    certificate: co.zimra_certificate,
  });
  const st = await device.getStatus();
  console.log(JSON.stringify(st, null, 1));
}
main().catch((e: any) => { console.error("STATUS-ERR:", e.message, JSON.stringify(e.details || "").slice(0, 800)); process.exit(1); });
