import "dotenv/config";
import pg from "pg";
import { LekakuDevice } from "../server/lekaku.js";
import { prepareLekakuReceipt } from "../server/lekaku.js";

// Probe 2: walk-in FiscalInvoice with FULL buyer block except TIN
// (names + contacts + address). Raw submit to isolate gateway rules.
async function main() {
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  const co = await sql.query("SELECT * FROM companies WHERE id=126");
  const c = co.rows[0];
  const device = new LekakuDevice({
    baseUrl: c.lekuka_gateway_url, deviceId: String(c.fdms_device_id),
    privateKey: c.zimra_private_key, certificate: c.zimra_certificate,
  });
  const g = Number(c.last_receipt_global_no) + 1;
  const ctr = Number(c.daily_receipt_count) + 1;
  const now = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 19);
  const receipt: any = {
    receiptType: "FiscalInvoice", receiptCurrency: "LSL",
    receiptCounter: ctr, receiptGlobalNo: g, invoiceNo: "LS-TC23",
    receiptDate: now, receiptLinesTaxInclusive: false,
    receiptLines: [{ receiptLineType: "Sale", receiptLineNo: 1, receiptLineName: "TC Fresh Milk 2L",
      receiptLineQuantity: 1, receiptLineTotal: 50, receiptLinePrice: 50,
      receiptLineHSCode: "04012000", taxID: 7, taxType: "VAT", taxRate: 15 }],
    receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 57.5 }],
    buyerData: {
      buyerRegisterName: "TC Walk-in Customer", buyerTradeName: "TC Walk-in Customer",
      buyerContacts: { phoneNo: "0772847155" },
      buyerAddress: { city: "Maseru", street: "10 Macheke Township" },
    },
  };
  const signed = device.signReceipt(prepareLekakuReceipt(receipt), c.last_fiscal_hash || undefined);
  try {
    const res: any = await device.submitReceipt(signed, c.last_fiscal_hash || undefined);
    console.log(JSON.stringify({ ok: true, globalNo: g, counter: ctr, operationID: res.operationID, validationErrors: res.validationErrors || [] }));
    await sql.query("UPDATE companies SET last_receipt_global_no=$1, daily_receipt_count=$2, last_fiscal_hash=$3 WHERE id=126",
      [g, ctr, (signed as any).receiptDeviceSignature.hash]);
  } catch (e: any) {
    console.log(JSON.stringify({ ok: false, error: e.message, details: e.details || null }));
  }
  await sql.end();
}
main().catch((e) => { console.error("PROBE-ERR:", e.message); process.exit(1); });
