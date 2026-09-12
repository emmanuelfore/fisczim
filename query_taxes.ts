import "dotenv/config";
import { db } from "./server/db";
import { taxTypes } from "./shared/schema";
import { and, eq, or, isNull } from "drizzle-orm";

async function main() {
  const companyId = 41; // Using one of the company IDs from earlier output
  const taxes = await db
      .select()
      .from(taxTypes)
      .where(
        and(
          companyId ? or(eq(taxTypes.companyId, companyId), isNull(taxTypes.companyId)) : isNull(taxTypes.companyId),
          eq(taxTypes.isActive, true)
        )
      )
      .orderBy(taxTypes.rate);
  console.log("Found taxes length:", taxes.length);
  
  const deduped = new Map<string, any>();
  for (const tax of taxes) {
    const existing = deduped.get(tax.code);
    if (!existing || (existing.companyId === null && tax.companyId !== null)) {
      deduped.set(tax.code, tax);
    }
  }
  const result = Array.from(deduped.values()).sort((a, b) => Number(a.rate) - Number(b.rate));
  console.log("Deduped length:", result.length);
  console.log(result);
  process.exit(0);
}
main();
