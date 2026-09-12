import "dotenv/config";
import axios from "axios";
import https from "node:https";
import { db } from "./server/db";
import { companies } from "./shared/schema";
import { eq } from "drizzle-orm";

const COMPANY_ID = 91;
const INVOICE_IDS = [11377, 11378];
const BASE = "https://161.97.115.59";

async function run() {
    try {
        const rows = await db.select().from(companies).where(eq(companies.id, COMPANY_ID));
        const apiKey = rows[0]?.apiKey;
        if (!apiKey) { console.error("No API key"); process.exit(1); }

        const client = axios.create({
            timeout: 120000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            headers: { "x-api-key": apiKey },
        });

        for (const id of INVOICE_IDS) {
            try {
                const r = await client.post(`${BASE}/api/v1/invoices/${id}/fiscalize`, {});
                console.log(`#${id} -> 200 OK  fiscalCode=${r.data.fiscalCode} globalNo=${r.data.receiptGlobalNo} counter=${r.data.receiptCounter} dayNo=${r.data.fiscalDayNo}`);
            } catch (e: any) {
                const detail = e.response?.data?.message || e.response?.data?.error || e.message;
                console.log(`#${id} -> FAILED: ${JSON.stringify(detail)}`);
            }
        }
    } catch (e) {
        console.error("RESUBMIT ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
