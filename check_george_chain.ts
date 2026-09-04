import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, companies } from "./shared/schema";
import { eq, gte, asc, and } from "drizzle-orm";
import crypto from "crypto";

async function run() {
    try {
        const [company] = await db.select().from(companies).where(eq(companies.id, 11));
        const privateKeyPem = (company as any).zimraPrivateKey;
        const publicKey = crypto.createPublicKey(privateKeyPem);

        const logs = await db.select().from(zimraLogs)
            .where(and(eq(zimraLogs.companyId, 11), gte(zimraLogs.createdAt, new Date("2026-08-01T00:00:00Z"))))
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

        let prevHash: string | null = null;
        let chainBroken = false;
        const results: any[] = [];

        for (const l of logs) {
            const req: any = l.requestPayload;
            if (!req || !req.receipt) continue;
            const receipt = req.receipt;
            if (!receipt.receiptDeviceSignature?.signature) continue;

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

            const variants: [string, string, boolean][] = [];
            const taxesWithCode = sortedTaxes.map(t => taxLine(t, true)).join('');
            const taxesNoCode = sortedTaxes.map(t => taxLine(t, false)).join('');
            for (const [name, taxes] of [["withCode", taxesWithCode], ["noCode", taxesNoCode]] as any) {
                for (const [pName, ph] of [["+prevHash", prevHash ? prevHash : ""], ["-prevHash", ""]] as any) {
                    const s = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${taxes}${ph}`;
                    variants.push([`${name} ${pName}`, s, name === "withCode"]);
                }
            }

            const sig = receipt.receiptDeviceSignature.signature;
            const payloadHash = receipt.receiptDeviceSignature.hash;

            let best: string | null = null;
            for (const [label, s, _c] of variants) {
                if (verifySig(sig, s)) { best = label; break; }
            }

            // canonical hash = sha256 of the withCode+prevHash string (server's stringToSign)
            const canonical = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${taxesWithCode}${prevHash ? prevHash : ''}`;
            const canonicalHash = getHash(canonical);

            results.push({
                id: l.invoiceId, g: rGlobal, date: rDate,
                payloadHash: payloadHash.slice(0, 12),
                canonicalHash: canonicalHash.slice(0, 12),
                hashMatch: payloadHash === canonicalHash,
                sigMatch: best ?? "NONE"
            });

            if (payloadHash !== canonicalHash) chainBroken = true;
            prevHash = canonicalHash;
        }

        for (const r of results) {
            console.log(`inv=${r.id} g=${r.g} date=${r.date} payloadHash=${r.payloadHash} canonical=${r.canonicalHash} hashMatch=${r.hashMatch} sigMatch=${r.sigMatch}`);
        }
        console.log("\nchainBroken (any hash mismatch vs canonical chain):", chainBroken);
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}
run();