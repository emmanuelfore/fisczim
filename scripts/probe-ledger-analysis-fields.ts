import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../server/db.js";
import { storage } from "../server/storage.js";
import { journalEntries, ledgerEntries } from "../shared/schema.js";

const companyId = Number(process.env.PROBE_COMPANY ?? 1);

async function main() {
  let stored: any = null;
  let rejectedUnknownSegment = "";

  try {
    await db.transaction(async (tx) => {
      const je = await storage.postToLedger(companyId, {
        entryDate: new Date(),
        description: "analysis field probe (rolled back)",
        referenceType: "PROBE",
        referenceId: "ANALYSIS-PROBE",
        lines: [
          { accountCode: "4000", type: "CREDIT" as const, amount: 10, vatAmount: 1.5, withholdingTaxAmount: 0.25, memo: "probe line" },
          { accountCode: "1200", type: "DEBIT" as const, amount: 10 },
        ],
      }, tx);

      stored = await tx.select({
        vatAmount: ledgerEntries.vatAmount,
        withholdingTaxAmount: ledgerEntries.withholdingTaxAmount,
        memo: ledgerEntries.memo,
      }).from(ledgerEntries).where(eq(ledgerEntries.journalEntryId, je.id));

      // accountingSegments is empty in this database, so the tenant-ownership
      // guard is exercised with an id that cannot belong to this company.
      try {
        await storage.postToLedger(companyId, {
          entryDate: new Date(),
          description: "unknown segment probe",
          referenceType: "PROBE",
          referenceId: "ANALYSIS-PROBE-0",
          lines: [
            { accountCode: "4000", type: "CREDIT", amount: 5, segmentId: 999999 },
            { accountCode: "1200", type: "DEBIT", amount: 5 },
          ],
        }, tx);
      } catch (err: any) {
        rejectedUnknownSegment = err.message;
      }

      throw new Error("__rollback__");
    });
  } catch (err: any) {
    if (err.message !== "__rollback__") throw err;
  }

  console.log("posted lines carry:", JSON.stringify(stored));
  console.log(`unknown segment rejected: ${rejectedUnknownSegment || "NOT REJECTED"}`);
  const leftovers = await db.select({ n: sql<number>`count(*)` }).from(journalEntries)
    .where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.referenceType, "PROBE")));
  console.log(`probe journals left behind: ${(leftovers[0] as any).n} (must be 0)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
