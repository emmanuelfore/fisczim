import "dotenv/config";
import { DatabaseStorage } from "../server/storage.js";

async function main() {
  const storage = new DatabaseStorage();
  const companyId = 59;
  
  console.log(`Starting immediate update for Demo Company (ID: ${companyId})...`);
  await storage.initializeCompanyAccounts(companyId);
  console.log(`Demo Company (ID: ${companyId}) updated successfully.`);

  const accountsList = await storage.getAccounts(companyId);
  console.log(`Demo Company now has ${accountsList.length} accounts.`);
  console.log("Active accounts:");
  console.log(accountsList.filter(a => a.isActive).map(a => `${a.code} - ${a.name}`));
}

main().catch(console.error).finally(() => process.exit(0));
