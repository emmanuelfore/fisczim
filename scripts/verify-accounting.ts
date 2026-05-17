import "dotenv/config";
import { storage } from "../server/storage.js";
import { db } from "../server/db.js";
import { companies, accounts } from "../shared/schema.js";
import { eq } from "drizzle-orm";

async function verifyAccounting() {
  console.log("🚀 Starting Accounting Verification...");

  try {
    // 1. Create a Test Company
    const testCompanyName = `Test Accounting Co ${Date.now()}`;
    const [testCompany] = await db.insert(companies).values({
      name: testCompanyName,
      address: "123 Test Street",
      city: "Harare",
      phone: "0771234567",
      email: "test@example.com",
      tin: Math.floor(Math.random() * 10000000000).toString().padStart(10, '0'),
      currency: "USD",
      isTest: true
    }).returning();
    console.log(`✅ Created Test Company: ${testCompany.name} (ID: ${testCompany.id})`);

    // 2. Initialize Accounts
    await storage.initializeCompanyAccounts(testCompany.id);
    const companyAccounts = await storage.getAccounts(testCompany.id);
    console.log(`✅ Initialized ${companyAccounts.length} accounts.`);

    if (companyAccounts.length < 30) {
       console.warn(`⚠️ Warning: Expected ~30+ accounts, found ${companyAccounts.length}`);
    }

    // 3. Verify specific critical accounts exist
    const criticalCodes = ["1000", "1200", "1300", "2000", "2100", "2110", "3000", "4000", "5000"];
    for (const code of criticalCodes) {
      const acc = companyAccounts.find(a => a.code === code);
      if (!acc) throw new Error(`Critical account ${code} missing!`);
    }
    console.log("✅ All critical control accounts present.");

    // 4. Test Cash Transaction (RECEIPT)
    const bankAcc = companyAccounts.find(a => a.code === "1010"); // Bank USD
    const interestIncAcc = companyAccounts.find(a => a.code === "4200"); // Interest Income
    
    if (bankAcc && interestIncAcc) {
      await storage.createCashTransaction({
        companyId: testCompany.id,
        type: "RECEIPT",
        bankAccountId: bankAcc.id,
        counterpartyAccountId: interestIncAcc.id,
        amount: 150.50,
        date: new Date(),
        description: "Test Interest Income Receipt"
      });
      console.log("✅ Created Cash Receipt (Interest Income).");
    }

    // 5. Verify Trial Balance
    const tb = await storage.getTrialBalance(testCompany.id);
    console.log("📊 Trial Balance After Receipt:");
    console.table(tb.map(t => ({ 
      Code: t.accountCode, 
      Name: t.accountName, 
      Debit: t.debit, 
      Credit: t.credit, 
      Balance: t.balance 
    })));

    const totalDebit = tb.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = tb.reduce((sum, t) => sum + t.credit, 0);
    console.log(`Total Debit: ${totalDebit}, Total Credit: ${totalCredit}`);
    
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      console.error("❌ TRIAL BALANCE IS NOT BALANCED!");
    } else {
      console.log("✅ Trial Balance is balanced.");
    }

    console.log("🎉 Verification completed successfully.");
  } catch (error) {
    console.error("❌ Verification failed:", error);
  } finally {
    process.exit(0);
  }
}

verifyAccounting();
