import "dotenv/config";
import { db } from "./server/db";
import { companies } from "./shared/schema";
import { eq } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

const COMPANY_ID = 91;

async function run() {
    try {
        const c = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
        const device = new ZimraDevice({
            deviceId: c.fdmsDeviceId!,
            deviceSerialNo: c.fdmsDeviceSerialNo || "UNKNOWN",
            activationKey: c.fdmsApiKey || "",
            privateKey: c.zimraPrivateKey || undefined,
            certificate: c.zimraCertificate || undefined,
            baseUrl: getZimraBaseUrl((c.zimraEnvironment as "test" | "production") || "test"),
        });
        for (let i = 1; i <= 6; i++) {
            try {
                const st = await device.getStatus();
                console.log(`[${i}] status=${st.fiscalDayStatus} lastDay=${st.lastFiscalDayNo} lastGlobal=${st.lastReceiptGlobalNo} lastCounter=${st.lastReceiptCounter ?? "-"} closeErr=${st.fiscalDayClosingErrorCode ?? "-"}`);
                if (st.fiscalDayStatus?.toLowerCase().includes("closed") || st.fiscalDayStatus?.toLowerCase().includes("opened")) break;
            } catch (e: any) {
                console.log(`[${i}] status error: ${e.message}`);
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
