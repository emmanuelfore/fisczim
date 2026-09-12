import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, companies } from "./shared/schema";
import { eq, lt, asc, and } from "drizzle-orm";
import crypto from "crypto";

async function run() {
    try {
        const [company] = await db.select().from(companies).where(eq(companies.id, 91));
        const privateKeyPem = (company as any).zimraPrivateKey;
        const publicKey = crypto.createPublicKey(privateKeyPem);

        // Candidate prevHashes: every payload hash submitted BEFORE 11478
        const prior = await db.select().from(zimraLogs)
            .where(and(eq(zimraLogs.companyId, 91), lt(zimraLogs.createdAt, new Date("2026-08-01T14:31:01Z"))))
            .orderBy(asc(zimraLogs.createdAt));
        const candidates = new Set<string>();
        for (const l of prior) {
            const h = (l.requestPayload as any)?.receipt?.receiptDeviceSignature?.hash;
            if (h) candidates.add(h);
        }
        candidates.add(""); // prevHash null

        const [l] = await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, 11478));
        const receipt = (l.requestPayload as any).receipt;
        const sig = receipt.receiptDeviceSignature.signature;
        const payloadHash = receipt.receiptDeviceSignature.hash;

        const getHash = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');
        const verifySig = (s: string) => {
            try { return crypto.verify('SHA256', Buffer.from(s, 'utf8'), publicKey, Buffer.from(sig, 'base64')); }
            catch { return false; }
        };

        const deviceId = "43203";
        const rType = "FISCALINVOICE";
        const rCurr = "USD";
        const rGlobal = 778;
        const rDate = receipt.receiptDate;
        const rTotal = Math.round(Number(receipt.receiptTotal) * 100);
        const t = receipt.receiptTaxes[0];
        const taxCodeLine = `A${Number(t.taxPercent).toFixed(2)}${Math.round(Number(t.taxAmount) * 100)}${Math.round(Number(t.salesAmountWithTax) * 100)}`;
        const noCodeLine = `${Number(t.taxPercent).toFixed(2)}${Math.round(Number(t.taxAmount) * 100)}${Math.round(Number(t.salesAmountWithTax) * 100)}`;

        console.log(`taxCodeLine=${taxCodeLine} noCodeLine=${noCodeLine}`);
        let found = 0;
        for (const prev of candidates) {
            for (const [name, line] of [["withCode", taxCodeLine], ["noCode", noCodeLine]]) {
                const s = `${deviceId}${rType}${rCurr}${rGlobal}${rDate}${rTotal}${line}${prev}`;
                const h = getHash(s);
                const v = verifySig(s);
                if (h === payloadHash || v) {
                    console.log(`MATCH name=${name} prevHash=${prev ? String(prev).slice(0,16)+"..." : "null"} verify=${v} hashMatch=${h === payloadHash}`);
                    found++;
                }
            }
        }
        console.log("\nTotal matches:", found, "of", candidates.size * 2, "candidates");
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}
run();
