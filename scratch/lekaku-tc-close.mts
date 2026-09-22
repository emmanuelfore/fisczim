import "dotenv/config";
import pg from "pg";
import { LekakuDevice } from "../server/lekaku.js";
import { getLekakuGatewayUrl } from "../shared/lekaku.js";
import { storage } from "../server/storage.js";

// TC-021: attempt CloseDay on company 126 day 3, then poll GetStatus.
async function main() {
  const company: any = await storage.getCompany(126);
  const device = new LekakuDevice({
    baseUrl: ((company.lekukaGatewayUrl || company.lekakuGatewayUrl || getLekakuGatewayUrl(company.zimraEnvironment)) as string).trim(),
    deviceId: String(company.fdmsDeviceId).trim(),
    privateKey: company.zimraPrivateKey || undefined,
    certificate: company.zimraCertificate || undefined,
  });
  const fiscalDayNo = company.currentFiscalDayNo;
  const dayInvoices = await storage.getInvoicesByFiscalDay(126, fiscalDayNo);
  const receiptCounter = dayInvoices.reduce((m: number, inv: any) => Math.max(m, inv.receiptCounter || 0), 0);
  const counters = await storage.calculateFiscalCounters(126, fiscalDayNo);
  const fmt = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Maseru", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const p = (t: string) => parts.find((x) => x.type === t)?.value;
    return `${p("year")}-${p("month")}-${p("day")}`;
  };
  const fiscalDayDate = company.fiscalDayOpenedAt ? fmt(new Date(company.fiscalDayOpenedAt)) : fmt(new Date());
  console.log(`closing day ${fiscalDayNo} date=${fiscalDayDate} counter=${receiptCounter} counters=${counters.length} invoices=${dayInvoices.length}`);
  try {
    const res: any = await device.closeDay(fiscalDayNo, fiscalDayDate, receiptCounter, counters as any);
    console.log("CLOSE-ACCEPTED:", JSON.stringify(res));
  } catch (e: any) {
    console.log("CLOSE-REJECTED:", e.message, JSON.stringify(e.details || "").slice(0, 600));
  }
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st: any = await device.getStatus();
    console.log(`poll${i}:`, JSON.stringify(st));
    if (st.fiscalDayStatus === "FiscalDayClosed" || st.fiscalDayStatus === "FiscalDayCloseFailed") break;
  }
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  await sql.query("UPDATE companies SET fiscal_day_open=true, last_fiscal_day_status='FiscalDayCloseFailed' WHERE id=126");
  await sql.end();
}
main().catch((e) => { console.error("CLOSE-ERR:", e.message); process.exit(1); });
