import { Pool } from 'pg';
import { ZimraDevice } from './server/zimra';
import dotenv from 'dotenv';
dotenv.config();

// --- WHAT WE KNOW ---
// ZIMRA has stored these receipts for device 35685:
//   GlobalNo 6 → server_hash = AmcwA9b3jrJ7z/rI4lhJxk+mt83doWFS6VNSHqG30Uo= (RCPT024 - stored)
//   GlobalNo 7 → server_hash = PuqeXcTwqAfMPhpwQlXFDK3DqjO32kxAT4faI6FyNsE= (RCPT020 - still stored by ZIMRA)
// ZIMRA's getStatus says lastReceiptGlobalNo = 7
// So ZIMRA's current "last hash" = server_hash of GlobalNo 7 = PuqeXcTwqAfMPhpwQlXFDK3DqjO32kxAT4faI6FyNsE=
//
// BUT: RCPT020 means signature was invalid - does ZIMRA still advance its chain on RCPT020?
// We need to check if getStatus confirms lastReceiptGlobalNo = 7 and what hash it reports.

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query('SELECT * FROM companies WHERE id = 109');
  const company = res.rows[0];
  
  const device = new ZimraDevice({
    deviceId: company.fdms_device_id,
    deviceSerialNo: company.fdms_device_serial_no || 'UNKNOWN',
    activationKey: company.fdms_api_key,
    privateKey: company.zimra_private_key,
    certificate: company.zimra_certificate,
    baseUrl: 'https://fdmsapi.zimra.co.zw'
  });
  
  try {
    const status = await (device as any).getStatus() as any;
    console.log('--- ZIMRA STATUS (full) ---');
    console.log(JSON.stringify(status, null, 2));
  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  }
  process.exit(0);
}
run();
