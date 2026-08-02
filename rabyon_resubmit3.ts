import "dotenv/config";
import axios from "axios";
import https from "node:https";
import { db } from "./server/db";
import { companies } from "./shared/schema";
import { eq } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

const COMPANY_ID = 91;
const INVOICE_IDS = [11377, 11378];
const BASE = "https://161.97.115.59";

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

        const client = axios.create({
            timeout: 120000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            headers: { "x-api-key": c.apiKey },
        });

        let attempts = 0;
        while (attempts < 30) {
            attempts++;
            const st = await device.getStatus();
            const s = st.fiscalDayStatus ?? "";
            console.log(`[${new Date().toISOString().slice(11, 19)}] poll ${attempts}: ${s} day=${st.lastFiscalDayNo} global=${st.lastReceiptGlobalNo}`);

            if (s.toLowerCase().includes("closefailed")) {
                console.log("  -> day open (close-failed). Submitting invoices NOW.");
                for (const id of INVOICE_IDS) {
                    try {
                        const r = await client.post(`${BASE}/api/v1/invoices/${id}/fiscalize`, {});
                        console.log(`  #${id} -> 200 OK  fiscalCode=${r.data.fiscalCode} globalNo=${r.data.receiptGlobalNo} counter=${r.data.receiptCounter} dayNo=${r.data.fiscalDayNo}`);
                    } catch (e: any) {
                        const detail = e.response?.data?.message || e.response?.data?.error || e.message;
                        console.log(`  #${id} -> FAILED: ${JSON.stringify(detail)}`);
                    }
                }
                break;
            }
            if (s.toLowerCase().includes("closed")) {
                console.log("  -> day CLOSED. Trying to open next day first...");
                try {
                    const open = await device.openDay((st.lastFiscalDayNo || 0) + 1);
                    console.log("  opened day:", open.fiscalDayNo);
                } catch (e: any) {
                    console.log("  openDay failed:", e.response?.data?.detail || e.message);
                }
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
