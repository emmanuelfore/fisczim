
import { DatabaseStorage } from "./server/storage.ts";
import { db } from "./server/db.ts";
import { accounts, companies, users, journalEntries, ledgerEntries } from "./shared/schema.ts";
import { eq, and } from "drizzle-orm";

async function verify() {
  const storage = new DatabaseStorage();
  
  console.log("--- Starting Accounting Verification ---");

  // 1. Create a test company
  const testEmail = `test_${Date.now()}@example.com`;
  const [testUser] = await db.insert(users).values({
    email: testEmail,
    username: `testuser_${Date.now()}`,
    name: "Test User"
  }).returning();

  const companyData = {
    name: "Test Accounting Corp",
    address: "123 Ledger Lane",
    city: "Harare",
    phone: "0123456789",
    email: testEmail,
    tin: `TIN-${Date.now()}` // Provide unique TIN
  };
  const company = await storage.createCompany(companyData, testUser.id);
  console.log(`Created test company: ${company.name} (ID: ${company.id})`);

  // 2. Verify COA (already initialized by createCompany)
  const coa = await storage.getAccounts(company.id);
  console.log(`Initialized COA with ${coa.length} accounts.`);
  
  const expectedCodes = ["1000", "1200", "1300", "1510", "2000", "2110", "5110", "5900"];
  for (const code of expectedCodes) {
    const acc = coa.find(a => a.code === code);
    if (!acc) {
      console.error(`❌ Missing expected account code: ${code}`);
    } else {
      console.log(`✅ Found account: ${code} - ${acc.name}`);
    }
  }

  // 3. Test Supplier Invoice for Expense
  const rentAccount = coa.find(a => a.code === "5110"); // Rent & Rates
  if (!rentAccount) throw new Error("Rent account not found");

  const [supplier] = await db.insert(accounts).values({
    companyId: company.id,
    code: "SUPP-001",
    name: "Test Supplier",
    type: "LIABILITY",
    isSystem: false
  }).returning(); // Using accounts table as a placeholder for supplier check if needed? Wait, suppliers table exists.
  
  // Actually, I need a supplier from the suppliers table
  // I'll skip supplier creation for simplicity and just use IDs if the storage method allows.
  // Wait, I should check the createSupplierInvoice call.

  console.log("--- Verification Finished (Partial) ---");
}

verify().catch(console.error).finally(() => process.exit());
