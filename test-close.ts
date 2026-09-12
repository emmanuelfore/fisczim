import { ZimraDevice, getZimraBaseUrl } from "./server/zimra";
import pg from 'pg';
import { config } from 'dotenv';
config();

async function closeDay() {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const res = await client.query("SELECT * FROM companies WHERE id = 84");
    const company = res.rows[0];
    await client.end();

    const device = new ZimraDevice({
        deviceId: company.fdms_device_id,
        deviceSerialNo: company.fdms_device_serial_no,
        activationKey: company.fdms_api_key,
        privateKey: company.zimra_private_key,
        certificate: company.zimra_certificate,
        baseUrl: getZimraBaseUrl(company.zimra_environment || 'test')
    }, console as any);

    try {
        const counters = [{
            taxCode: 'A',
            taxID: 1,
            taxPercent: 0,
            taxAmount: 0,
            salesAmountWithTax: 0.25 // from our 25 dummy receipts
        }];
        // But what about the other receipts that might be on Day 2? Like INV-043?
        // INV-043 was probably not exempt. 
        // We shouldn't close the day manually here unless we are sure about the totals. 
        // Actually, let's just use the server's sync logic or let the user do it from POS.
    } catch(e: any) {
        console.error("Close Error:", e.response?.data || e.message);
    }
}
