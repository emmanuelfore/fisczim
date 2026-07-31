import "dotenv/config";
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(
    `SELECT table_name, column_name, is_nullable, data_type
     FROM information_schema.columns
     WHERE table_name IN ('companies','branches','invoices','api_logs','tax_types')
       AND column_name IN ('correction_period_months','fiscal_day_staleness_hours',
                           'buyer_vat','buyer_tin','offline_previous_hash','offline_date',
                           'response_time_ms','ip_address','user_agent','request_payload','response_payload',
                           'default_hs_code')
     ORDER BY table_name, column_name`
  );
  console.log(JSON.stringify(r.rows, null, 1));
  await c.end();
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
