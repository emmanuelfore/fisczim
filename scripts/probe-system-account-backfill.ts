import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../server/db.js";
import { storage } from "../server/storage.js";
import { accounts } from "../shared/schema.js";

const companyId = Number(process.env.PROBE_COMPANY ?? 1);

async function main() {
  // Every call below runs inside a transaction that is rolled back. Resolving a
  // supplemental code inserts the missing account, so nothing here may commit.
  let wht = "";
  let seenInTx = -1;
  let journalLines = 0;
  try {
    await db.transaction(async (tx) => {
      wht = await storage.getSystemAccountCode(companyId, "withholdingTaxPayableCode", tx);
      const code = await storage.getSystemAccountCode(companyId, "inventoryInTransitCode", tx);
      const rows = await tx.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.companyId, companyId), eq(accounts.code, code)));
      seenInTx = rows.length;

      const je = await storage.postToLedger(companyId, {
        entryDate: new Date(),
        description: "in-transit probe (rolled back)",
        referenceType: "TRANSFER_DISPATCH",
        referenceId: "BACKFILL-PROBE",
        lines: [
          { accountCode: code, type: "CREDIT", amount: 1 },
          { accountCode: "1300", type: "DEBIT", amount: 1 },
        ],
      }, tx);

      // postToLedger only returns once every line resolves to a real account.
      journalLines = je.id ? 1 : 0;

      // Second resolution must reuse the row rather than trip the unique index.
      await storage.getSystemAccountCode(companyId, "inventoryInTransitCode", tx);
      throw new Error("__rollback__");
    });
  } catch (err: any) {
    if (err.message !== "__rollback__") throw err;
  }

  console.log(`withholding default now resolves to: ${wht} (expect 2012, not 2200)`);
  console.log(`1310 created inside the transaction: ${seenInTx === 1 ? "yes" : "NO"}`);
  console.log(`posting against 1310 succeeded: ${journalLines ? "yes" : "no"}`);
  const leftover = await db.select({ n: sql<number>`count(*)` }).from(accounts)
    .where(and(eq(accounts.companyId, companyId), eq(accounts.code, "1310")));
  console.log(`1310 rows left after rollback: ${(leftover[0] as any).n} (must be 0)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
