import "dotenv/config";
import { db } from "./server/db";
import { companies, invoices } from "./shared/schema";
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

        console.log("=== DEVICE STATUS ===");
        const st = await device.getStatus();
        console.log(JSON.stringify(st, null, 2));

        console.log("\n=== #11384 SUBMIT REQUEST ===");
        const rows = await db.select({
            requestPayload: invoices.id,
        }).from(invoices).where(eq(invoices.id, 11384));
        void rows;
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
