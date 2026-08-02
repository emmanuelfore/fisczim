import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, companies } from "./shared/schema";
import { eq, inArray } from "drizzle-orm";
import forge from "node-forge";

async function run() {
    try {
        const invs = [11478, 11479, 11480, 11481];
        const logs = await db.select().from(zimraLogs)
            .where(inArray(zimraLogs.invoiceId, invs));
        const company = await db.select().from(companies).where(eq(companies.id, 91));
        const privateKeyPem = (company[0] as any).zimraPrivateKey;
        console.log("privateKey found:", !!privateKeyPem);

        if (!privateKeyPem) { process.exit(0); }
        const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
        const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);

        for (const l of logs) {
            const req: any = l.requestPayload;
            const receipt = req?.receipt;
            const sig = receipt?.receiptDeviceSignature?.signature;
            if (!receipt) continue;

            const deviceId = String(req.deviceID ?? "");
            const rType = String(receipt.receiptType).toUpperCase();
            const rCurr = String(receipt.receiptCurrency).toUpperCase();
            const rGlobal = receipt.receiptGlobalNo;
            const rDate = receipt.receiptDate;
            const rTotal = Math.round(parseFloat(receipt.receiptTotal) * 100);

            const sortedTaxes = [...(receipt.receiptTaxes || [])].sort((a, b) => {
                if (a.taxID !== b.taxID) return a.taxID - b.taxID;
                return String(a.taxCode || '').localeCompare(String(b.taxCode || ''));
            });

            const taxLine = (t: any, withCode: boolean) => {
                let p = "";
                if (t.taxID !== 1 && t.taxPercent !== undefined && t.taxPercent !== null) {
                    p = Number(t.taxPercent).toFixed(2);
                }
                const amt = Math.round(Number(t.taxAmount) * 100);
                const sales = Math.round(Number(t.salesAmountWithTax) * 100);
                return `${withCode ? (t.taxCode || '') : ''}${p}${amt}${sales}`;
            };

            const taxesNoCode = sortedTaxes.map(t => taxLine(t, false)).join('');
            const taxesWithCode = sortedTaxes.map(t => taxLine(t, true)).join('');

            const sNoCode = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${taxesNoCode}`;
            const sWithCode = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${taxesWithCode}`;

            const md1 = forge.md.sha256.create(); md1.update(sNoCode, 'utf8');
            const md2 = forge.md.sha256.create(); md2.update(sWithCode, 'utf8');

            let vNoCode = false, vWithCode = false;
            try { vNoCode = publicKey.verify(md1.digest().bytes(), forge.util.decode64(sig)); } catch (e) {}
            try { vWithCode = publicKey.verify(md2.digest().bytes(), forge.util.decode64(sig)); } catch (e) {}

            console.log(`inv=${l.invoiceId} day=${req?.receipt?.fiscalDayNo} g=${rGlobal} c=${receipt.receiptCounter}`);
            console.log(`   verifies WITHOUT taxCode: ${vNoCode ? "YES <- client-offline signed" : "no"}`);
            console.log(`   verifies WITH taxCode:    ${vWithCode ? "YES <- server signed" : "no"}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}
run();
