import "dotenv/config";
import { db } from "./server/db";
import { companies, branches } from "./shared/schema";
import { eq } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

const COMPANY_ID = 91;

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

    const counters = [
        { fiscalCounterType: "SaleByTax", fiscalCounterTaxID: 515, fiscalCounterValue: 0.03, fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15.5 },
        { fiscalCounterType: "BalanceByMoneyType", fiscalCounterValue: 0.03, fiscalCounterCurrency: "USD", fiscalCounterMoneyType: "Cash" },
    ];

    console.log(`Closing day 4 (date=2026-08-01, counter=3) with ZIMRA-stored counters:`, JSON.stringify(counters));
    try {
        const res = await device.closeDay(4, "2026-08-01", 3, counters as any);
        console.log("CloseDay response:", JSON.stringify(res));
    } catch (e: any) {
        console.log("CloseDay ERROR:", e.message || e, "\n", JSON.stringify(e.details || "").slice(0, 500));
    }

    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const st = await device.getStatus() as any;
        console.log(`poll ${i}: status=${st.fiscalDayStatus} lastDay=${st.lastFiscalDayNo} lastGlobal=${st.lastReceiptGlobalNo} err=${st.fiscalDayClosingErrorCode || "-"}`);
        if (String(st.fiscalDayStatus).toLowerCase() === "fiscaldayclosed") {
            console.log("\nDAY 4 CLOSED SUCCESSFULLY");
            break;
        }
        if (String(st.fiscalDayStatus).toLowerCase() === "fiscaldayopened") {
            console.log("\nDay is OPEN again (close not final?)");
            break;
        }
    }
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
