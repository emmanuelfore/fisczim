import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, invoices, companies } from "./shared/schema";
import { eq, inArray } from "drizzle-orm";
import forge from "node-forge";

async function run() {
    try {
        const [company] = await db.select().from(companies).where(eq(companies.id, 91));
        const privateKeyPem = (company as any).zimraPrivateKey;
        const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
        const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);

        const invs = await db.select().from(invoices).where(inArray(invoices.id, [11478, 11479]));
        const logs = await db.select().from(zimraLogs).where(inArray(zimraLogs.invoiceId, [11478, 11479]));
        const invById: Record<number, any> = {};
        for (const i of invs) invById[i.id] = i;

        const verify = (sig: string, s: string) => {
            const md = forge.md.sha256.create();
            md.update(s, 'utf8');
            try { return publicKey.verify(md.digest().bytes(), forge.util.decode64(sig)); } catch { return false; }
        };

        for (const l of logs) {
            const req: any = l.requestPayload;
            const receipt = req?.receipt;
            const inv = invById[l.invoiceId];
            const sig = receipt?.receiptDeviceSignature?.signature;
            const deviceId = String(req.deviceID ?? "");
            const rType = String(receipt.receiptType).toUpperCase();
            const rCurr = String(receipt.receiptCurrency).toUpperCase();
            const rGlobal = receipt.receiptGlobalNo;
            const rTotal = Math.round(parseFloat(receipt.receiptTotal) * 100);
            const prevHash = receipt?.receiptDeviceSignature?.hash; // not this; prev hash is the submitted PREVIOUS hash

            const sortedTaxes = [...(receipt.receiptTaxes || [])].sort((a, b) => {
                if (a.taxID !== b.taxID) return a.taxID - b.taxID;
                return String(a.taxCode || '').localeCompare(String(b.taxCode || ''));
            });
            const taxLine = (t: any, withCode: boolean) => {
                let p = "";
                if (t.taxID !== 1 && t.taxPercent !== undefined && t.taxPercent !== null) p = Number(t.taxPercent).toFixed(2);
                const amt = Math.round(Number(t.taxAmount) * 100);
                const sales = Math.round(Number(t.salesAmountWithTax) * 100);
                return `${withCode ? (t.taxCode || '') : ''}${p}${amt}${sales}`;
            };
            const taxesNoCode = sortedTaxes.map(t => taxLine(t, false)).join('');
            const taxesWithCode = sortedTaxes.map(t => taxLine(t, true)).join('');

            // Client-local date (issueDate + 2h Harare) vs submitted date
            const harareDate = (d: Date) => new Date(d.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 19);
            const clientDate = harareDate(inv.issueDate);

            const base = (date: string, taxes: string) => `${deviceId}${rType}${rCurr}${rGlobal}${date}${rTotal}${taxes}`;

            const variants: [string, string][] = [
                ["submitted date, NO taxCode, no prevHash", base(receipt.receiptDate, taxesNoCode)],
                ["submitted date, WITH taxCode, no prevHash", base(receipt.receiptDate, taxesWithCode)],
                ["CLIENT date, NO taxCode, no prevHash", base(clientDate, taxesNoCode)],
                ["CLIENT date, WITH taxCode, no prevHash", base(clientDate, taxesWithCode)],
            ];
            console.log(`inv=${l.invoiceId} issueDate=${inv.issueDate?.toISOString()} clientDate=${clientDate} submittedDate=${receipt.receiptDate}`);
            for (const [label, s] of variants) {
                console.log(`   [${label}] -> ${verify(sig, s) ? "VERIFIES" : "no"}`);
            }
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}
run();
