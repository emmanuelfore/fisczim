import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, companies } from "./shared/schema";
import { eq, gte, asc, and } from "drizzle-orm";
import crypto from "crypto";

async function run() {
    try {
        const [company] = await db.select().from(companies).where(eq(companies.id, 91));
        const privateKeyPem = (company as any).zimraPrivateKey;
        const publicKey = crypto.createPublicKey(privateKeyPem);

        const logs = await db.select().from(zimraLogs)
            .where(and(eq(zimraLogs.companyId, 91), gte(zimraLogs.createdAt, new Date("2026-08-01T08:45:00Z"))))
            .orderBy(asc(zimraLogs.createdAt));

        const getHash = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');
        const verifySig = (sig: string, s: string) => {
            try {
                return crypto.verify('SHA256', Buffer.from(s, 'utf8'), publicKey, Buffer.from(sig, 'base64'));
            } catch { return false; }
        };

        const taxLine = (t: any, withCode: boolean) => {
            let p = "";
            if (t.taxID !== 1 && t.taxPercent !== undefined && t.taxPercent !== null) p = Number(t.taxPercent).toFixed(2);
            const amt = Math.round(Number(t.taxAmount) * 100);
            const sales = Math.round(Number(t.salesAmountWithTax) * 100);
            return `${withCode ? (t.taxCode || '') : ''}${p}${amt}${sales}`;
        };

        let prevHash: string | null = null; // day start: first receipt has no previous hash
        const results: any[] = [];

        for (const l of logs) {
            const req: any = l.requestPayload;
            if (!req || !req.receipt || !req.receipt.receiptDeviceSignature?.signature) continue;
            const receipt = req.receipt;

            const deviceId = String(req.deviceID ?? "");
            const rType = String(receipt.receiptType).toUpperCase();
            const rCurr = String(receipt.receiptCurrency).toUpperCase();
            const rGlobal = receipt.receiptGlobalNo;
            const rDate = receipt.receiptDate;
            const rTotal = Math.round(Number(receipt.receiptTotal) * 100);
            const sortedTaxes = [...(receipt.receiptTaxes || [])].sort((a, b) => {
                if (a.taxID !== b.taxID) return a.taxID - b.taxID;
                return String(a.taxCode || '').localeCompare(String(b.taxCode || ''));
            });
            const taxesWithCode = sortedTaxes.map(t => taxLine(t, true)).join('');
            const taxesNoCode = sortedTaxes.map(t => taxLine(t, false)).join('');

            const sig = receipt.receiptDeviceSignature.signature;
            const payloadHash = receipt.receiptDeviceSignature.hash;

            // Server canonical string WITH taxCode + prevHash
            const serverWithCode = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${taxesWithCode}${prevHash ? prevHash : ''}`;
            const serverNoCode = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${taxesNoCode}${prevHash ? prevHash : ''}`;

            const hashWithCode = getHash(serverWithCode);
            const hashNoCode = getHash(serverNoCode);

            const sigVerifiesWithCode = verifySig(sig, serverWithCode);
            const sigVerifiesNoCode = verifySig(sig, serverNoCode);

            results.push({
                id: l.invoiceId, g: rGlobal, counter: receipt.receiptCounter, date: rDate,
                hashMatchesServer: payloadHash === hashWithCode,
                hashMatchesNoCode: payloadHash === hashNoCode,
                sigWithCode: sigVerifiesWithCode,
                sigNoCode: sigVerifiesNoCode,
            });

            // Chain advances using the SERVER's canonical (withCode) hash, as the server would
            prevHash = hashWithCode;
        }

        for (const r of results) {
            const flag = r.hashMatchesServer ? "chain-ok" : r.hashMatchesNoCode ? "chain-nocode" : "CHAIN-BROKEN";
            const who = r.sigWithCode ? "SERVER-signed" : r.sigNoCode ? "CLIENT-signed(nocode)" : "SIG-NOVERIFY";
            console.log(`inv=${r.id} g=${r.g} c=${r.counter} date=${r.date} ${flag} | ${who}`);
        }
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}
run();
