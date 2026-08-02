import "dotenv/config";
import https from "https";
import { db } from "./server/db";
import { companies, branches, invoices } from "./shared/schema";
import { eq, and, gte, not, inArray } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl } from "./server/zimra.js";

const COMPANY_ID = 91;
const API_BASE = "https://161.97.115.59/api/v1";
const API_KEY = "ad730ac5-e4e1-497d-8aff-5e809fb176c8";

const agent = new https.Agent({ rejectUnauthorized: false });

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getDevice(c: { fdmsDeviceId: string | null; fdmsDeviceSerialNo: string | null; fdmsApiKey: string | null; zimraPrivateKey: string | null; zimraCertificate: string | null; zimraEnvironment: string | null }) {
    return new ZimraDevice({
        deviceId: c.fdmsDeviceId!,
        deviceSerialNo: c.fdmsDeviceSerialNo || "UNKNOWN",
        activationKey: c.fdmsApiKey || "",
        privateKey: c.zimraPrivateKey || undefined,
        certificate: c.zimraCertificate || undefined,
        baseUrl: getZimraBaseUrl((c.zimraEnvironment as "test" | "production") || "test"),
    });
}

async function syncCounters(companyId: number) {
    const c = (await db.select().from(companies).where(eq(companies.id, companyId)))[0];
    const device = await getDevice(c);
    const st = await device.getStatus();

    const globalNo = st.lastReceiptGlobalNo ?? 0;
    const lastAccepted = await db.select({ counter: invoices.receiptCounter }).from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.receiptGlobalNo, globalNo))).limit(1);
    const counter = lastAccepted[0]?.counter ?? globalNo;

    const now = new Date();
    const updates: Record<string, unknown> = {
        lastReceiptGlobalNo: globalNo,
        dailyReceiptCount: counter,
        fiscalDayOpen: true,
        currentFiscalDayNo: st.lastFiscalDayNo ?? c.currentFiscalDayNo ?? 1,
        fiscalDayOpenedAt: now,
    };
    const companyDrift = (c.lastReceiptGlobalNo ?? 0) !== globalNo || (c.dailyReceiptCount ?? 0) !== counter || !c.fiscalDayOpen;
    if (companyDrift) {
        await db.update(companies).set(updates).where(eq(companies.id, companyId));
        console.log(`SYNC company: lastGlobal=${globalNo} daily=${counter} day=${updates.currentFiscalDayNo} open=true openedAt=${now.toISOString()} (was ${c.lastReceiptGlobalNo}/${c.dailyReceiptCount}/${c.fiscalDayOpen})`);
    } else {
        console.log(`SYNC company: no drift (${globalNo}/${counter})`);
    }

    const brs = await db.select().from(branches).where(eq(branches.companyId, companyId));
    for (const b of brs) {
        if ((b.lastReceiptGlobalNo ?? 0) !== globalNo || (b.dailyReceiptCount ?? 0) !== counter || !b.fiscalDayOpen) {
            await db.update(branches).set({ lastReceiptGlobalNo: globalNo, dailyReceiptCount: counter, fiscalDayOpen: true }).where(eq(branches.id, b.id));
            console.log(`SYNC branch#${b.id} ${b.name}: -> ${globalNo}/${counter} open=true`);
        }
    }
    return { st, counter };
}

async function pollReady(companyId: number, device: any, maxSec = 60) {
    const deadline = Date.now() + maxSec * 1000;
    while (Date.now() < deadline) {
        const st = await device.getStatus();
        const s = st.fiscalDayStatus || "";
        if (/Closed|CloseFailed|DayOpen|Open/i.test(s) && !/Initiated|Closing/i.test(s)) {
            return st;
        }
        console.log(`  poll: status=${s} — waiting for open window...`);
        await sleep(5000);
    }
    throw new Error("timed out waiting for open day window");
}

async function fiscalizeViaApi(invoiceId: number) {
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
        const req = https.request(`${API_BASE}/invoices/${invoiceId}/fiscalize`, {
            method: "POST",
            agent,
            headers: { "x-api-key": API_KEY, "content-type": "application/json" },
        }, (res) => {
            let raw = "";
            res.on("data", (d) => (raw += d));
            res.on("end", () => {
                try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode ?? 0, body: raw }); }
            });
        });
        req.on("error", reject);
        req.end("{}");
    });
}

async function run() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const failed = await db.select({ id: invoices.id, num: invoices.invoiceNumber }).from(invoices)
        .where(and(eq(invoices.companyId, COMPANY_ID), gte(invoices.issueDate, todayStart), not(eq(invoices.fdmsStatus, "Fiscalized"))))
        .orderBy(invoices.id);
    console.log(`TARGETS (${failed.length}):`, failed.map(f => `#${f.id} ${f.num}`).join(", "));

    const c = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
    const device = await getDevice(c);

    await db.update(invoices).set({ receiptGlobalNo: null, receiptCounter: null, fiscalDayNo: null, fiscalCode: null, fdmsStatus: "Pending", validationStatus: null })
        .where(and(eq(invoices.companyId, COMPANY_ID), gte(invoices.issueDate, todayStart), not(eq(invoices.fdmsStatus, "Fiscalized"))));
    console.log("CLEARED locks on all failed invoices");

    for (const f of failed) {
        const { st } = await syncCounters(COMPANY_ID);
        const ready = await pollReady(COMPANY_ID, device, 45);
        console.log(`\n#${f.id} ${f.num}: device=${ready.fiscalDayStatus} day=${ready.lastFiscalDayNo} lastGlobal=${ready.lastReceiptGlobalNo}`);
        const r = await fiscalizeViaApi(f.id);
        const b = r.body as any;
        console.log(`  API ${r.status}: ${JSON.stringify(b)?.slice(0, 600)}`);
        const data = b?.data ?? b?.invoice ?? b;
        const vs = (data?.validationStatus ?? b?.validationStatus) as string | undefined;
        if (r.status === 200 && vs && vs.toLowerCase() !== "red") {
            console.log(`  #${f.id} OK (${vs})`);
        } else {
            console.log(`  #${f.id} NEEDS ATTENTION`);
        }
        await sleep(2000);
    }
}

run().catch(e => { console.error("ERROR:", e); process.exit(1); });
