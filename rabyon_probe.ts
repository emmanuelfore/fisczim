import "dotenv/config";
import { db } from "./server/db";
import { companies, branches } from "./shared/schema";
import { eq } from "drizzle-orm";
import { ZimraDevice, getZimraBaseUrl, ReceiptData } from "./server/zimra.js";

const COMPANY_ID = 91;

const formatZimraDate = (date: Date): string => {
    const harareMsOffset = 2 * 60 * 60 * 1000;
    return new Date(date.getTime() + harareMsOffset).toISOString().slice(0, 19);
};

function validationSummary(res: any): string {
    const ve = res?.validationResult?.validationErrors || [];
    if (ve.length === 0) return "(none)";
    return ve.map((e: any) => `${e.validationErrorCode || e.errorCode}:${e.validationErrorColor}`).join(", ");
}

function isRed(res: any): boolean {
    const ve = res?.validationResult?.validationErrors || [];
    return ve.some((e: any) => String(e.validationErrorColor || e.errorColor || "").toLowerCase() === "red");
}

function hasError(res: any, code: string): boolean {
    const ve = res?.validationResult?.validationErrors || [];
    return ve.some((e: any) => (e.validationErrorCode || e.errorCode) === code);
}

function buildProbe(g: number, c: number, invoiceNo: string, date: string): ReceiptData {
    return {
        receiptType: "FiscalInvoice",
        receiptCurrency: "USD",
        receiptCounter: c,
        receiptGlobalNo: g,
        fiscalDayNo: 4,
        invoiceNo,
        receiptDate: date,
        receiptLines: [{
            taxID: 515,
            taxCode: "A",
            taxPercent: 15.5,
            receiptLineNo: 1,
            receiptLineName: "FISCAL PROBE",
            receiptLineType: "Sale",
            receiptLinePrice: 0.01,
            receiptLineTotal: 0.01,
            receiptLineHSCode: "99999999",
            receiptLineQuantity: 1,
        }],
        receiptTaxes: [{
            taxID: 515,
            taxCode: "A",
            taxAmount: 0.0,
            taxPercent: 15.5,
            salesAmountWithTax: 0.01,
        }],
        receiptTotal: 0.01,
        receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 0.01 }],
        receiptLinesTaxInclusive: true,
        buyerData: {
            buyerTIN: "2000000000",
            vatNumber: "220000000",
            buyerTradeName: "WALK INCUSTOMER",
            buyerRegisterName: "WALK INCUSTOMER",
        },
        receiptNotes: "Chain recovery probe",
    } as ReceiptData;
}

async function persistState(hash: string, g: number, c: number) {
    await db.update(companies).set({
        lastFiscalHash: hash,
        lastReceiptGlobalNo: g,
        dailyReceiptCount: c,
        lastReceiptAt: new Date(),
    }).where(eq(companies.id, COMPANY_ID));
    const brs = await db.select({ id: branches.id }).from(branches).where(eq(branches.companyId, COMPANY_ID));
    for (const b of brs) {
        await db.update(branches).set({
            lastFiscalHash: hash,
            lastReceiptGlobalNo: g,
            dailyReceiptCount: c,
            lastReceiptAt: new Date(),
        }).where(eq(branches.id, b.id));
    }
    console.log(`  >> PERSISTED company+branches: lastFiscalHash=${hash.slice(0, 24)}… g=${g} c=${c}`);
}

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

    console.log("LOCAL company state: lastFiscalHash=", (c.lastFiscalHash || "").slice(0, 24), "g=", c.lastReceiptGlobalNo, "c=", c.dailyReceiptCount, "dayNo=", c.currentFiscalDayNo, "status=", c.lastFiscalDayStatus);

    const st = await device.getStatus() as any;
    console.log("DEVICE status:", JSON.stringify(st));

    const statusStr = String(st.fiscalDayStatus || "").toLowerCase();
    if (statusStr === "fiscaldayclosed") {
        const nextDay = (st.lastFiscalDayNo || 0) + 1;
        console.log(`Day is CLOSED — opening day ${nextDay}…`);
        const openRes = await device.openDay(nextDay) as any;
        console.log("OpenDay:", JSON.stringify(openRes).slice(0, 300));
    }
    const dayNo = st.lastFiscalDayNo || c.currentFiscalDayNo;
    console.log(`Using fiscalDayNo=${dayNo}\n`);

    let base = new Date();
    let currentHash: string | null = null;
    let g = 1, cnt = 1;

    const submit = async (gTry: number, cTry: number, prev: string | null, label: string) => {
        const date = formatZimraDate(new Date(base.getTime() + 1000));
        base = new Date(base.getTime() + 2000);
        const probe = buildProbe(gTry, cTry, `PROBE-${label}`, date);
        try {
            const res = await device.submitReceipt(probe, prev, false);
            console.log(`[${label}] g=${gTry} c=${cTry} prev=${prev ? prev.slice(0, 16) + "…" : "null"} -> ${res.synced ? "synced" : "NOT synced"} VE=[${validationSummary(res)}] hash=${res.hash.slice(0, 24)}…`);
            return res;
        } catch (e: any) {
            console.log(`[${label}] g=${gTry} c=${cTry} prev=${prev ? prev.slice(0, 16) + "…" : "null"} -> ERROR ${e.message || e}`);
            return null;
        }
    };

    const runProbe = async (label: string, prev: string | null, gTry: number, cTry: number): Promise<{ ok: boolean; res?: any }> => {
        let res = await submit(gTry, cTry, prev, label);
        if (!res) return { ok: false };
        if (!isRed(res)) {
            await persistState(res.hash, gTry, cTry);
            currentHash = res.hash; g = gTry; cnt = cTry;
            return { ok: true, res };
        }
        if (hasError(res, "RCPT012")) {
            const adj = (Number(st.lastReceiptGlobalNo) || 0) + 1;
            console.log(`  RCPT012 -> retrying with g=${adj} (status.lastReceiptGlobalNo=${st.lastReceiptGlobalNo})`);
            res = await submit(adj, cTry, prev, label + "-r1");
            if (res && !isRed(res)) {
                await persistState(res.hash, adj, cTry);
                currentHash = res.hash; g = adj; cnt = cTry;
                return { ok: true, res };
            }
        }
        if (hasError(res, "RCPT011")) {
            const adj = (Number(st.lastReceiptCounter) || 0) + 1;
            console.log(`  RCPT011 -> retrying with c=${adj} (status.lastReceiptCounter=${st.lastReceiptCounter})`);
            res = await submit(gTry, adj, prev, label + "-r2");
            if (res && !isRed(res)) {
                await persistState(res.hash, gTry, adj);
                currentHash = res.hash; g = gTry; cnt = adj;
                return { ok: true, res };
            }
        }
        if (hasError(res, "RCPT020")) {
            console.log(`  RCPT020: ZIMRA's stored previous hash does NOT match our prev. Chain anchor is unknown — STOP.`);
        }
        return { ok: false };
    };

    console.log("=== PROBE 1: anchor attempt (prev=null, g=1, c=1) ===");
    const p1 = await runProbe("A1", null, 1, 1);
    if (!p1.ok) { console.log("\nFAILED to anchor. Company state untouched."); process.exit(1); }

    console.log("\n=== PROBE 2: chain check (prev=probe1.hash, g+1, c+1) ===");
    const p2 = await runProbe("B2", currentHash, g + 1, cnt + 1);
    if (!p2.ok) { console.log("\nProbe 2 Red — chain not clean. State left at probe 1."); process.exit(1); }

    console.log("\n=== PROBE 3: chain check (prev=probe2.hash, g+1, c+1) ===");
    const p3 = await runProbe("C3", currentHash, g + 1, cnt + 1);

    const final = (await db.select().from(companies).where(eq(companies.id, COMPANY_ID)))[0];
    console.log("\nFINAL company state: lastFiscalHash=", (final.lastFiscalHash || "").slice(0, 24), "g=", final.lastReceiptGlobalNo, "c=", final.dailyReceiptCount);
    console.log(p3?.ok ? "\nSUCCESS: chain anchored and verified across 3 receipts." : "\nProbe 3 Red — chain anchored at probe 2 but probe 3 did not chain. Review ZIMRA errors above.");
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
