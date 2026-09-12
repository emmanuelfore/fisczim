const { ZimraDevice, getZimraBaseUrl } = require("./server/zimra.js");
const { Client } = require('pg');
require('dotenv').config();

async function fillGaps() {
    const cid = 84;
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    const res = await client.query("SELECT * FROM companies WHERE id = $1", [cid]);
    const company = res.rows[0];
    await client.end();

    if (!company) throw new Error("Company not found");

    const device = new ZimraDevice({
        deviceId: company.fdms_device_id || "0",
        deviceSerialNo: company.fdms_device_serial_no || "UNKNOWN",
        activationKey: company.fdms_api_key || "",
        privateKey: company.zimra_private_key || "",
        certificate: company.zimra_certificate || "",
        baseUrl: getZimraBaseUrl((company.zimra_environment) || 'test')
    }, console);

    let prevHash = null;

    for (let i = 1; i <= 18; i++) {
        console.log(`Submitting receipt ${i}...`);
        const receiptData = {
            receiptType: "FiscalInvoice",
            fiscalDayNo: 2,
            receiptCounter: i,
            receiptGlobalNo: i,
            receiptDate: new Date("2026-07-15T08:00:00Z").toISOString().replace(/\.\d{3}Z$/, 'Z'),
            buyerData: {
                buyerRegisterName: "Walk-in Customer",
                buyerTradeName: "Walk-in Customer"
            },
            receiptLines: [
                {
                    receiptLineNo: 1,
                    receiptLineType: "Sale",
                    receiptLineName: "Gap Fill Adjustment",
                    receiptLineQuantity: 1,
                    receiptLineTotal: 0.01,
                    taxPercent: 0,
                    taxID: 1, // Exempt
                    receiptLinePrice: 0.01
                }
            ],
            receiptTaxes: [
                {
                    taxCode: "A",
                    taxID: 1,
                    taxPercent: 0,
                    taxAmount: 0,
                    salesAmountWithTax: 0.01
                }
            ],
            receiptPayments: [
                {
                    moneyTypeCode: "CASH",
                    paymentAmount: 0.01
                }
            ],
            receiptNotes: "SYSTEM GAP FILL",
            receiptCurrency: "USD"
        };

        try {
            const result = await device.submitReceipt(receiptData, prevHash, true);
            console.log(`Success ${i}:`, result.hash);
            prevHash = result.hash;
        } catch (err) {
            console.error(`Failed ${i}:`, err.response?.data || err.message);
        }
    }
}

fillGaps().then(() => {
    console.log("Done");
    process.exit(0);
}).catch(console.error);
