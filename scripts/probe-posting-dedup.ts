import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../server/db.js";
import { storage } from "../server/storage.js";
import { accounts, journalEntries } from "../shared/schema.js";

const companyId = Number(process.env.PROBE_COMPANY ?? 1);
const key = "DEDUP-PROBE-DO-NOT-KEEP";

async function post(tx: any, deduplicate: boolean) {
  const found = await tx.select({ code: accounts.code }).from(accounts)
    .where(and(eq(accounts.companyId, companyId), eq(accounts.isActive, true))).limit(2);
  const lines = [
    { accountCode: found[0].code, type: "DEBIT" as const, amount: 1 },
    { accountCode: found[1].code, type: "CREDIT" as const, amount: 1 },
  ];
  return storage.postToLedger(companyId, {
    entryDate: new Date(),
    description: "idempotency probe (rolled back)",
    referenceType: "PROBE",
    referenceId: key,
    deduplicate,
    lines,
  }, tx);
}

async function run(label: string, deduplicate: boolean) {
  let blocked: string | null = null;
  let posted = 0;
  try {
    await db.transaction(async (tx) => {
      await post(tx, deduplicate);
      posted++;
      try {
        await post(tx, deduplicate);
        posted++;
      } catch (err: any) {
        blocked = err.message;
      }
      throw new Error("__rollback__");
    });
  } catch (err: any) {
    if (err.message !== "__rollback__") throw err;
  }
  console.log(`${label}: posted=${posted} ${blocked ? `blocked="${blocked}"` : 'blocked=none'}`);
}

async function main() {
  await run("deduplicate=false", false);
  await run("deduplicate=true ", true);

  const leftovers = await db.select({ n: sql<number>`count(*)` }).from(journalEntries)
    .where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.referenceId, key)));
  console.log(`rows left in journalEntries for probe key: ${(leftovers[0] as any).n} (must be 0)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
