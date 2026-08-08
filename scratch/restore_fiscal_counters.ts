import { db } from "../server/db.js";
import { companies } from "../shared/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  const [updated] = await db.update(companies).set({
    lastReceiptGlobalNo: 3,
    dailyReceiptCount: 3,
    lastFiscalHash: "Jw6viLmu6GVhfTdxqR24lVoMq+6VgBlf6fbfjhTrAD0=",
  }).where(eq(companies.id, 114)).returning({
    id: companies.id,
    lastReceiptGlobalNo: companies.lastReceiptGlobalNo,
    dailyReceiptCount: companies.dailyReceiptCount,
    lastFiscalHash: companies.lastFiscalHash,
  });

  console.log("✅ Fiscal counters restored:");
  console.log(`  lastReceiptGlobalNo : ${updated.lastReceiptGlobalNo}`);
  console.log(`  dailyReceiptCount   : ${updated.dailyReceiptCount}`);
  console.log(`  lastFiscalHash      : ${updated.lastFiscalHash}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
