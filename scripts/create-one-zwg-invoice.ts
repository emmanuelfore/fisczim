import "dotenv/config";
import { storage } from "../server/storage";
import { pool } from "../server/db";
import { processInvoiceFiscalization } from "../server/lib/fiscalization";

const companyIdArg = process.argv.find((arg) => arg.startsWith("--company-id="));
const companyId = companyIdArg ? Number(companyIdArg.split("=")[1]) : 3;
const runId = `ZWG-SEQ-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function ensureCustomer() {
  const customers = await storage.getCustomers(companyId);
  const existing = customers.find((customer) => customer.name === "ZWG Sequence Test Customer") || customers[0];
  if (existing) return existing;

  return storage.createCustomer({
    companyId,
    name: "ZWG Sequence Test Customer",
    email: "zwg-sequence-test@example.com",
    customerType: "business",
    country: "Zimbabwe",
    currency: "ZWG",
    isActive: true,
  });
}

async function getTax() {
  const taxTypes = await storage.getTaxTypes(companyId);
  const standard = taxTypes
    .filter((tax) => Number(tax.rate) > 0)
    .sort((a, b) => Number(b.rate) - Number(a.rate))[0];

  if (!standard) {
    throw new Error(`No positive VAT/tax type found for company ${companyId}`);
  }

  return {
    id: standard.id,
    rate: Number(standard.rate),
  };
}

async function main() {
  const before = await storage.getCompany(companyId);
  if (!before) throw new Error(`Company ${companyId} not found`);

  const customer = await ensureCustomer();
  const tax = await getTax();
  const net = 10;
  const taxAmount = roundMoney(net * (tax.rate / 100));
  const total = roundMoney(net + taxAmount);

  console.log(JSON.stringify({
    stage: "before",
    companyId,
    lastReceiptGlobalNo: before.lastReceiptGlobalNo,
    dailyReceiptCount: before.dailyReceiptCount,
    currentFiscalDayNo: before.currentFiscalDayNo,
    fiscalDayOpen: before.fiscalDayOpen,
  }));

  const invoice = await storage.createInvoice({
    companyId,
    customerId: customer.id,
    issueDate: new Date(),
    dueDate: new Date(),
    status: "draft",
    currency: "ZWG",
    paymentMethod: "CASH",
    transactionType: "FiscalInvoice",
    taxInclusive: false,
    subtotal: net.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
    notes: `${runId} single ZWG sequence test`,
    items: [{
      description: `${runId} ZWG sequence test item`,
      quantity: "1.00",
      unitPrice: net.toFixed(2),
      lineTotal: net.toFixed(2),
      taxRate: tax.rate.toFixed(2),
      taxTypeId: tax.id,
    }],
  });

  const fiscalized = await processInvoiceFiscalization(invoice.id, companyId);
  const after = await storage.getCompany(companyId);

  console.log(JSON.stringify({
    stage: "after",
    invoiceId: fiscalized.id,
    invoiceNumber: fiscalized.invoiceNumber,
    currency: fiscalized.currency,
    fiscalDayNo: fiscalized.fiscalDayNo,
    receiptCounter: fiscalized.receiptCounter,
    receiptGlobalNo: fiscalized.receiptGlobalNo,
    syncedWithFdms: fiscalized.syncedWithFdms,
    fdmsStatus: fiscalized.fdmsStatus,
    validationStatus: fiscalized.validationStatus,
    companyLastReceiptGlobalNo: after?.lastReceiptGlobalNo,
    companyDailyReceiptCount: after?.dailyReceiptCount,
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
