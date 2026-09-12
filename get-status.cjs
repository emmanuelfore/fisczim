const { ZimraDevice, getZimraBaseUrl } = require("./server/zimra.js");
const { Client } = require('pg');
require('dotenv').config();

async function checkStatus() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
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
    }, { log: async () => {} });

    const status = await device.getStatus();
    console.log("Device Status:", JSON.stringify(status, null, 2));
}

checkStatus().then(() => process.exit(0)).catch(console.error);
