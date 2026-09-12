import "dotenv/config";
import { db } from "./server/db";
import { companies } from "./shared/schema";
import { eq } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

const COMPANY_ID = 91;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function run() {
    const c = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
    const device = new ZimraDevice({
        deviceId: c.fdmsDeviceId!,
        deviceSerialNo: c.fdmsDeviceSerialNo || "UNKNOWN",
        activationKey: c.fdmsApiKey || "",
        privateKey: c.zimraPrivateKey || undefined,
        certificate: c.zimraCertificate || undefined,
        baseUrl: getZimraBaseUrl((c.zimraEnvironment as "test" | "production") || "test"),
    });

    const variants = [
        { name: "V1-date-07-25-full", date: "2026-07-25", counters: [
            { fiscalCounterType: "SaleByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 0.03, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
            { fiscalCounterType: "SaleTaxByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 0.00, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
            { fiscalCounterType: "BalanceByMoneyType", fiscalCounterValue: 0.03, fiscalCounterCurrency: "USD", fiscalCounterMoneyType: 0 },
        ] },
        { name: "V2-date-08-01-full", date: "2026-08-01", counters: [
            { fiscalCounterType: "SaleByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 0.03, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
            { fiscalCounterType: "SaleTaxByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 0.00, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
            { fiscalCounterType: "BalanceByMoneyType", fiscalCounterValue: 0.03, fiscalCounterCurrency: "USD", fiscalCounterMoneyType: 0 },
        ] },
    ];

    for (const v of variants) {
        console.log(`\n=== ${v.name} ===`);
        try {
            const res = await device.closeDay(4, v.date, 3, v.counters as any);
            console.log("CloseDay response:", JSON.stringify(res));
        } catch (e: any) {
            console.log("CloseDay ERROR:", e.message || e);
        }
        for (let i = 0; i < 8; i++) {
            await sleep(3000);
            const st = await device.getStatus() as any;
            console.log(`  poll ${i}: ${st.fiscalDayStatus} lastDay=${st.lastFiscalDayNo} lastGlobal=${st.lastReceiptGlobalNo} err=${st.fiscalDayClosingErrorCode || "-"} counters=${st.fiscalDayCounters ? JSON.stringify(st.fiscalDayCounters) : "none"}`);
            if (String(st.fiscalDayStatus).toLowerCase() === "fiscaldayclosed") { console.log("  >>> DAY CLOSED"); process.exit(0); }
            if (String(st.fiscalDayStatus).toLowerCase() === "fiscaldayopened") break;
        }
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
