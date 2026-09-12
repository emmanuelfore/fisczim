import "dotenv/config";
import { db } from "../server/db";
import { accounts, companies } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const companyList = await db.select().from(companies);
  console.log("All companies in DB:");
  for (const c of companyList) {
    console.log(`ID: ${c.id} - Name: ${c.name} - AppMode: ${c.appMode}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
