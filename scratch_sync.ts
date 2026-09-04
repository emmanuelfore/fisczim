import { Pool } from 'pg';
import { ZimraDevice } from './server/zimra';
import dotenv from 'dotenv';
dotenv.config();

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
    const status = await device.getStatus();
    console.log('--- ZIMRA STATUS ---');
    console.log(JSON.stringify(status, null, 2));
  } catch (e: any) {
    console.error('Error fetching status:', e.response?.data || e.message);
  }
  process.exit(0);
}
run();
