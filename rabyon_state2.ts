import "dotenv/config";
import { db } from "./server/db";
import { companies, branches } from "./shared/schema";
import { eq } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

async function run() {
    const c = (await db.select().from(companies).where(eq(companies.id, 91)))[0];
    console.log("COMPANY fiscalDayOpenedAt =", c.fiscalDayOpenedAt?.toISOString(), "| lastFiscalDayStatus =", c.lastFiscalDayStatus);
    const brs = await db.select({ id: branches.id, openedAt: branches.fiscalDayOpenedAt }).from(branches).where(eq(branches.companyId, 91));
    console.log("BRANCHES openedAt:", JSON.stringify(brs));
    const device = new ZimraDevice({
        deviceId: c.fdmsDeviceId!,
        deviceSerialNo: c.fdmsDeviceSerialNo || "UNKNOWN",
        activationKey: c.fdmsApiKey || "",
        privateKey: c.zimraPrivateKey || undefined,
        certificate: c.zimraCertificate || undefined,
        baseUrl: getZimraBaseUrl((c.zimraEnvironment as "test" | "production") || "test"),
    });
    const st = await device.getStatus() as any;
    console.log("DEVICE status:", JSON.stringify(st));
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
