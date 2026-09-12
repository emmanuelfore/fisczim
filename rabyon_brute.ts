import "dotenv/config";
import { db } from "./server/db";
import { zimraLogs, companies } from "./shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function run() {
    try {
        const [company] = await db.select().from(companies).where(eq(companies.id, 91));
        const privateKeyPem = (company as any).zimraPrivateKey;
        const publicKey = crypto.createPublicKey(privateKeyPem);

        const [l] = await db.select().from(zimraLogs).where(eq(zimraLogs.invoiceId, 11478));
        const receipt = (l.requestPayload as any).receipt;
        const sig = receipt.receiptDeviceSignature.signature;
        const payloadHash = receipt.receiptDeviceSignature.hash;

        const getHash = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');
        const verifySig = (s: string) => {
            try { return crypto.verify('SHA256', Buffer.from(s, 'utf8'), publicKey, Buffer.from(sig, 'base64')); }
            catch { return false; }
        };

        const deviceIdVariants = ["43203", "43203.0", "43203.00"];
        const typeVariants = ["FISCALINVOICE", "FiscalInvoice", "FiscalInvoice".toUpperCase()];
        const dateVariants = ["2026-08-01T16:31:01", "2026-08-01T16:31:01.000", "2026-08-01T16:31:01Z", "2026-08-01T16:31:01.000Z", "2026-08-01T14:31:01", "2026-08-01T14:31:01Z"];
        const totalVariants = [200, "200", "2.00", "200.00", 2, "2"];
        const codeVariants: (string)[] = ["A", "", "A515"];
        const pctVariants = ["15.50", "15.5", "15.50", ""];
        const amountVariants = [27, "27", 0.27, "0.27"];
        const salesVariants = [200, "200", 2, "2"];
        const hashVariants = [null, "", "null", "zQebiAQHpsuwXlTdmngLQOCalyAyAaLj+zvQ8kRajrQ="];

        let found = 0;
        outer:
        for (const d of deviceIdVariants)
        for (const t of typeVariants)
        for (const dt of dateVariants)
        for (const tot of totalVariants)
        for (const code of codeVariants)
        for (const pct of pctVariants)
        for (const amt of amountVariants)
        for (const sales of salesVariants)
        for (const prev of hashVariants) {
            const s = `${d}${t}${"USD"}${778}${dt}${tot}${code}${pct}${amt}${sales}${prev ?? ''}`;
            const h = getHash(s);
            const v = verifySig(s);
            if (h === payloadHash || v) {
                console.log(`MATCH! verify=${v} hash=${h === payloadHash}`);
                console.log(`  deviceId=${d} type=${t} date=${dt} total=${JSON.stringify(tot)} code=${JSON.stringify(code)} pct=${JSON.stringify(pct)} amt=${JSON.stringify(amt)} sales=${JSON.stringify(sales)} prev=${JSON.stringify(prev)}`);
                console.log(`  string: ${s}`);
                found++;
                if (found > 5) break outer;
            }
        }
        console.log("\nTotal matches:", found);
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        process.exit(0);
    }
}
run();
