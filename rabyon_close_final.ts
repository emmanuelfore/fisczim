import "dotenv/config";
import { db } from "./server/db";
import { companies, branches } from "./shared/schema";
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
        { name: "W1: probes+real(g4=2.00)", counter: 4, counters: [
            { fiscalCounterType: "SaleByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 1.03, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
            { fiscalCounterType: "SaleTaxByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 0.13, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
            { fiscalCounterType: "SaleByTax", fiscalCounterTaxID: 2, fiscalCounterValue: 1.00, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 0 },
            { fiscalCounterType: "BalanceByMoneyType", fiscalCounterValue: 2.03, fiscalCounterCurrency: "USD", fiscalCounterMoneyType: 0 },
        ] },
        { name: "W2: probes+g4-0.01", counter: 4, counters: [
            { fiscalCounterType: "SaleByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 0.04, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
            { fiscalCounterType: "BalanceByMoneyType", fiscalCounterValue: 0.04, fiscalCounterCurrency: "USD", fiscalCounterMoneyType: 0 },
        ] },
        { name: "W3: probes only", counter: 3, counters: [
            { fiscalCounterType: "SaleByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 0.03, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
            { fiscalCounterType: "BalanceByMoneyType", fiscalCounterValue: 0.03, fiscalCounterCurrency: "USD", fiscalCounterMoneyType: 0 },
        ] },
    ];

    for (const v of variants) {
        console.log(`\n=== ${v.name} (date=2026-07-25, counter=${v.counter}) ===`);
        try {
            const res = await device.closeDay(4, "2026-07-25", v.counter, v.counters as any);
            console.log("CloseDay response:", JSON.stringify(res));
        } catch (e: any) {
            console.log("CloseDay ERROR:", e.message || e);
        }
        let closed = false;
        for (let i = 0; i < 8; i++) {
            await sleep(3000);
            const st = await device.getStatus() as any;
            console.log(`  poll ${i}: ${st.fiscalDayStatus} lastDay=${st.lastFiscalDayNo} lastGlobal=${st.lastReceiptGlobalNo} err=${st.fiscalDayClosingErrorCode || "-"}`);
            if (String(st.fiscalDayStatus).toLowerCase() === "fiscaldayclosed") { closed = true; break; }
            if (String(st.fiscalDayStatus).toLowerCase() === "fiscaldayopened") break;
        }
        if (closed) {
            console.log("\n>>> DAY 4 CLOSED. Opening day 5...");
            try {
                const openRes = await device.openDay(5) as any;
                console.log("OpenDay 5:", JSON.stringify(openRes));
                const openedAt = new Date();
                const upd = {
                    currentFiscalDayNo: 5,
                    fiscalDayOpen: true,
                    fiscalDayOpenedAt: openedAt,
                    lastFiscalDayStatus: "FiscalDayOpened",
                    dailyReceiptCount: 0,
                    lastFiscalHash: null,
                };
                await db.update(companies).set(upd).where(eq(companies.id, COMPANY_ID));
                const brs = await db.select({ id: branches.id }).from(branches).where(eq(branches.companyId, COMPANY_ID));
                for (const b of brs) await db.update(branches).set(upd).where(eq(branches.id, b.id));
                console.log("Company+branches updated: day 5 open, counters reset, hash cleared. lastReceiptGlobalNo kept for continuity.");
            } catch (e: any) {
                console.log("OpenDay 5 ERROR:", e.message || e);
            }
            process.exit(0);
        }
    }
    console.log("\nAll variants failed.");
    process.exit(1);
}
run().catch(e => { console.error(e); process.exit(1); });
