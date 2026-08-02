import "dotenv/config";
import axios from "axios";
import https from "node:https";
import { db } from "./server/db";
import { companies, invoices } from "./shared/schema";
import { eq, and, isNull, or } from "drizzle-orm";

const COMPANY_ID = 91;
const BASE_URL = "https://161.97.115.59";

async function run() {
    try {
        const rows = await db.select().from(companies).where(eq(companies.id, COMPANY_ID));
        const apiKey = rows[0]?.apiKey;
        if (!apiKey) { console.error("No API key"); process.exit(1); }

        const failed = await db.select({
            id: invoices.id, num: invoices.invoiceNumber, status: invoices.status,
            fiscalCode: invoices.fiscalCode, fdms: invoices.fdmsStatus, val: invoices.validationStatus,
            total: invoices.total, issueDate: invoices.issueDate,
        }).from(invoices).where(
            and(
                eq(invoices.companyId, COMPANY_ID),
                isNull(invoices.fiscalCode),
                or(
                    eq(invoices.fdmsStatus, "Failed"),
                    eq(invoices.fdmsStatus, "failed"),
                    eq(invoices.validationStatus, "invalid"),
                    eq(invoices.validationStatus, "red"),
                )
            )
        ).orderBy(invoices.id);

        console.log(`Failed invoices to resubmit: ${failed.length}`);
        for (const f of failed) console.log(`  #${f.id} ${f.num} fdms=${f.fdms} val=${f.val} total=${f.total}`);

        const client = axios.create({
            timeout: 90000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            headers: { "x-api-key": apiKey },
        });

        for (const f of failed) {
            try {
                const r = await client.post(`${BASE_URL}/api/v1/invoices/${f.id}/fiscalize`, {});
                console.log(`#${f.id} -> 200 OK fiscalCode=${r.data.fiscalCode} globalNo=${r.data.receiptGlobalNo} counter=${r.data.receiptCounter} dayNo=${r.data.fiscalDayNo}`);
            } catch (e: any) {
                const detail = e.response?.data?.message || e.response?.data?.error || e.message;
                console.log(`#${f.id} -> FAILED: ${JSON.stringify(detail)}`);
            }
        }
    } catch (e) {
        console.error("RESUBMIT ERROR:", e);
    } finally {
        process.exit(0);
    }
}

run();
