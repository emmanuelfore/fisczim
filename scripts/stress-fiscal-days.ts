import "dotenv/config";
import { storage } from "../server/storage";
import { pool } from "../server/db";
import { processInvoiceFiscalization, getZimraLogger } from "../server/lib/fiscalization";
import { getZimraBaseUrl, ZimraDevice } from "../server/zimra";

type CurrencyCode = "USD" | "ZWG";
type TransactionKind = "invoice" | "credit-note" | "debit-note";

type ScenarioDocument = {
  kind: TransactionKind;
  currency: CurrencyCode;
  net: number;
  taxInclusive?: boolean;
  paymentMethod: string;
  relatedTo?: string;
  label: string;
};

type Scenario = {
  name: string;
  documents: ScenarioDocument[];
};

const companyIdArg = process.argv.find(arg => arg.startsWith("--company-id="));
const companyId = companyIdArg ? Number(companyIdArg.split("=")[1]) : 59;
const runId = `FD-STRESS-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const showHelp = process.argv.includes("--help") || process.argv.includes("-h");
const continueOpen = process.argv.includes("--continue-open");
const onlyScenarioArg = process.argv.find(arg => arg.startsWith("--only-scenario="));
const onlyScenario = onlyScenarioArg ? onlyScenarioArg.split("=").slice(1).join("=").trim().toLowerCase() : "";

if (showHelp) {
  console.log(`
Usage:
  npx tsx scripts/stress-fiscal-days.ts [--company-id=59]
  npx tsx scripts/stress-fiscal-days.ts --continue-open
  npx tsx scripts/stress-fiscal-days.ts --continue-open --only-scenario="Inclusive tax mixed tender notes"

Runs live FDMS stress scenarios:
  - Multiple USD/ZWG invoice, credit note, and debit note combinations
  - Each credit/debit note references a real fiscalized original invoice
  - Each scenario closes its fiscal day before moving to the next

By default the company must start with ZIMRA reporting FiscalDayClosed.
Use --continue-open to append the first scenario to the currently open day.
`);
  process.exit(0);
}

const scenarios: Scenario[] = [
  {
    name: "USD invoice, credit note, debit note",
    documents: [
      { kind: "invoice", currency: "USD", net: 10, paymentMethod: "CASH", label: "usd-base" },
      { kind: "credit-note", currency: "USD", net: 4, paymentMethod: "CASH", relatedTo: "usd-base", label: "usd-credit" },
      { kind: "debit-note", currency: "USD", net: 2, paymentMethod: "CARD", relatedTo: "usd-base", label: "usd-debit" },
    ],
  },
  {
    name: "High volume mixed currency notes",
    documents: [
      { kind: "invoice", currency: "USD", net: 18.75, paymentMethod: "CASH", label: "bulk-usd-a" },
      { kind: "invoice", currency: "USD", net: 42.1, paymentMethod: "TRANSFER", label: "bulk-usd-b" },
      { kind: "invoice", currency: "ZWG", net: 25.4, paymentMethod: "ECOCASH", label: "bulk-zwg-a" },
      { kind: "invoice", currency: "ZWG", net: 64.2, paymentMethod: "CARD", label: "bulk-zwg-b" },
      { kind: "credit-note", currency: "USD", net: 5.5, paymentMethod: "CASH", relatedTo: "bulk-usd-a", label: "bulk-usd-credit-a" },
      { kind: "credit-note", currency: "USD", net: 12.25, paymentMethod: "TRANSFER", relatedTo: "bulk-usd-b", label: "bulk-usd-credit-b" },
      { kind: "credit-note", currency: "ZWG", net: 8.75, paymentMethod: "ECOCASH", relatedTo: "bulk-zwg-a", label: "bulk-zwg-credit-a" },
      { kind: "debit-note", currency: "USD", net: 3.2, paymentMethod: "CARD", relatedTo: "bulk-usd-a", label: "bulk-usd-debit-a" },
      { kind: "debit-note", currency: "ZWG", net: 6.4, paymentMethod: "CASH", relatedTo: "bulk-zwg-b", label: "bulk-zwg-debit-b" },
    ],
  },
  {
    name: "Repeated adjustments on same originals",
    documents: [
      { kind: "invoice", currency: "USD", net: 31, paymentMethod: "TRANSFER", label: "repeat-usd-base" },
      { kind: "invoice", currency: "ZWG", net: 47, paymentMethod: "ECOCASH", label: "repeat-zwg-base" },
      { kind: "credit-note", currency: "USD", net: 4, paymentMethod: "TRANSFER", relatedTo: "repeat-usd-base", label: "repeat-usd-credit-1" },
      { kind: "credit-note", currency: "USD", net: 6.5, paymentMethod: "TRANSFER", relatedTo: "repeat-usd-base", label: "repeat-usd-credit-2" },
      { kind: "debit-note", currency: "USD", net: 2.75, paymentMethod: "TRANSFER", relatedTo: "repeat-usd-base", label: "repeat-usd-debit-1" },
      { kind: "credit-note", currency: "ZWG", net: 10, paymentMethod: "ECOCASH", relatedTo: "repeat-zwg-base", label: "repeat-zwg-credit-1" },
      { kind: "debit-note", currency: "ZWG", net: 4.25, paymentMethod: "ECOCASH", relatedTo: "repeat-zwg-base", label: "repeat-zwg-debit-1" },
      { kind: "debit-note", currency: "ZWG", net: 3.5, paymentMethod: "CARD", relatedTo: "repeat-zwg-base", label: "repeat-zwg-debit-2" },
    ],
  },
  {
    name: "Inclusive tax mixed tender notes",
    documents: [
      { kind: "invoice", currency: "USD", net: 23.1, taxInclusive: true, paymentMethod: "CASH", label: "inclusive-usd-base" },
      { kind: "invoice", currency: "ZWG", net: 57.75, taxInclusive: true, paymentMethod: "CARD", label: "inclusive-zwg-base" },
      { kind: "invoice", currency: "USD", net: 15.02, taxInclusive: true, paymentMethod: "ECOCASH", label: "inclusive-usd-second" },
      { kind: "credit-note", currency: "USD", net: 7.7, taxInclusive: true, paymentMethod: "CASH", relatedTo: "inclusive-usd-base", label: "inclusive-usd-credit" },
      { kind: "debit-note", currency: "USD", net: 2.31, taxInclusive: true, paymentMethod: "ECOCASH", relatedTo: "inclusive-usd-second", label: "inclusive-usd-debit" },
      { kind: "credit-note", currency: "ZWG", net: 11.55, taxInclusive: true, paymentMethod: "CARD", relatedTo: "inclusive-zwg-base", label: "inclusive-zwg-credit" },
      { kind: "debit-note", currency: "ZWG", net: 5.78, taxInclusive: true, paymentMethod: "CASH", relatedTo: "inclusive-zwg-base", label: "inclusive-zwg-debit" },
    ],
  },
  {
    name: "ZWG invoice and credit note",
    documents: [
      { kind: "invoice", currency: "ZWG", net: 12, paymentMethod: "CASH", label: "zwg-base" },
      { kind: "credit-note", currency: "ZWG", net: 3, paymentMethod: "CASH", relatedTo: "zwg-base", label: "zwg-credit" },
    ],
  },
  {
    name: "Mixed currency day",
    documents: [
      { kind: "invoice", currency: "USD", net: 7.5, paymentMethod: "TRANSFER", label: "mixed-usd-base" },
      { kind: "invoice", currency: "ZWG", net: 8, paymentMethod: "ECOCASH", label: "mixed-zwg-base" },
      { kind: "credit-note", currency: "USD", net: 2.5, paymentMethod: "TRANSFER", relatedTo: "mixed-usd-base", label: "mixed-usd-credit" },
      { kind: "debit-note", currency: "ZWG", net: 1.5, paymentMethod: "ECOCASH", relatedTo: "mixed-zwg-base", label: "mixed-zwg-debit" },
    ],
  },
];

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatHarareDateOnly(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Harare",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const p = (type: string) => parts.find(part => part.type === type)?.value;
  return `${p("year")}-${p("month")}-${p("day")}`;
}

async function ensureCustomer() {
  const customers = await storage.getCustomers(companyId);
  const existing = customers.find(customer => customer.name === "Fiscal Stress Test Customer") || customers[0];
  if (existing) return existing;

  return storage.createCustomer({
    companyId,
    name: "Fiscal Stress Test Customer",
    email: "stress-test@example.com",
    customerType: "business",
    country: "Zimbabwe",
    currency: "USD",
    isActive: true,
  });
}

async function getStandardTax() {
  const taxTypes = await storage.getTaxTypes(companyId);
  const standard = taxTypes
    .filter(tax => Number(tax.rate) > 0)
    .sort((a, b) => Number(b.rate) - Number(a.rate))[0];

  if (!standard) {
    throw new Error(`No positive VAT/tax type found for company ${companyId}`);
  }

  return {
    id: standard.id,
    rate: Number(standard.rate),
    name: standard.name,
    zimraTaxId: standard.zimraTaxId,
  };
}

async function createAndFiscalizeDocument(
  scenarioName: string,
  doc: ScenarioDocument,
  customerId: number,
  tax: Awaited<ReturnType<typeof getStandardTax>>,
  relatedByLabel: Map<string, any>,
) {
  const transactionType =
    doc.kind === "credit-note" ? "CreditNote" :
      doc.kind === "debit-note" ? "DebitNote" :
        "FiscalInvoice";
  const taxAmount = doc.taxInclusive
    ? roundMoney(doc.net - (doc.net / (1 + tax.rate / 100)))
    : roundMoney(doc.net * (tax.rate / 100));
  const total = doc.taxInclusive ? roundMoney(doc.net) : roundMoney(doc.net + taxAmount);
  const subtotal = doc.taxInclusive ? roundMoney(total - taxAmount) : roundMoney(doc.net);
  const relatedInvoice = doc.relatedTo ? relatedByLabel.get(doc.relatedTo) : undefined;

  if (doc.relatedTo && !relatedInvoice) {
    throw new Error(`${doc.label} requires related document ${doc.relatedTo}, but it was not created`);
  }
  if (doc.relatedTo) {
    if (!relatedInvoice.fiscalCode || !relatedInvoice.receiptGlobalNo || !relatedInvoice.fiscalDayNo) {
      throw new Error(`${doc.label} original ${doc.relatedTo} is not fully fiscalized`);
    }
    if (relatedInvoice.validationStatus === "red") {
      throw new Error(`${doc.label} original ${doc.relatedTo} has red validation status`);
    }
  }

  const invoice = await storage.createInvoice({
    companyId,
    customerId,
    issueDate: new Date(),
    dueDate: new Date(),
    status: "draft",
    currency: doc.currency,
    paymentMethod: doc.paymentMethod,
    transactionType,
    relatedInvoiceId: relatedInvoice?.id,
    taxInclusive: !!doc.taxInclusive,
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
    notes: `${runId} ${scenarioName} ${doc.label}`,
    items: [{
      description: `${runId} ${doc.label}`,
      quantity: "1.00",
      unitPrice: doc.net.toFixed(2),
      lineTotal: doc.net.toFixed(2),
      taxRate: tax.rate.toFixed(2),
      taxTypeId: tax.id,
    }],
  });

  const fiscalized = await processInvoiceFiscalization(invoice.id, companyId);
  relatedByLabel.set(doc.label, fiscalized);

  return {
    label: doc.label,
    id: fiscalized.id,
    invoiceNumber: fiscalized.invoiceNumber,
    transactionType: fiscalized.transactionType,
    currency: fiscalized.currency,
    total: fiscalized.total,
    fiscalDayNo: fiscalized.fiscalDayNo,
    receiptCounter: fiscalized.receiptCounter,
    receiptGlobalNo: fiscalized.receiptGlobalNo,
    validationStatus: fiscalized.validationStatus,
  };
}

async function closeCurrentFiscalDay() {
  const company = await storage.getCompany(companyId);
  if (!company) throw new Error(`Company ${companyId} not found`);
  if (!company.fdmsDeviceId) throw new Error(`Company ${companyId} is not registered with ZIMRA`);
  if (!company.fiscalDayOpen && company.lastFiscalDayStatus !== "FiscalDayCloseFailed") {
    throw new Error(`Company ${companyId} has no open fiscal day to close`);
  }

  const device = new ZimraDevice({
    deviceId: company.fdmsDeviceId,
    deviceSerialNo: company.fdmsDeviceSerialNo || "UNKNOWN",
    activationKey: company.fdmsApiKey || "",
    privateKey: company.zimraPrivateKey || "",
    certificate: company.zimraCertificate || "",
    baseUrl: getZimraBaseUrl((company.zimraEnvironment as "test" | "production") || "test"),
  }, getZimraLogger(companyId));

  const fiscalDayNo = company.currentFiscalDayNo || 0;
  const dayInvoices = await storage.getInvoicesByFiscalDay(companyId, fiscalDayNo);
  const receiptCounter = dayInvoices.reduce((max, invoice) => Math.max(max, invoice.receiptCounter || 0), 0);
  const counters = await storage.calculateFiscalCounters(companyId, fiscalDayNo);
  const fiscalDayDate = company.fiscalDayOpenedAt
    ? formatHarareDateOnly(new Date(company.fiscalDayOpenedAt))
    : formatHarareDateOnly(new Date());

  const closeResult = await device.closeDay(fiscalDayNo, fiscalDayDate, receiptCounter, counters) as any;
  let status: any = null;

  for (let attempt = 1; attempt <= 10; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    status = await device.getStatus() as any;
    if (status.fiscalDayStatus !== "FiscalDayCloseInitiated") break;
    console.log(`[stress] Day ${fiscalDayNo} still closing; poll ${attempt}/10`);
  }

  if (status.fiscalDayStatus === "FiscalDayCloseFailed") {
    await storage.updateCompany(companyId, {
      fiscalDayOpen: true,
      lastFiscalDayStatus: "FiscalDayCloseFailed",
    });
  } else if (status.fiscalDayStatus === "FiscalDayClosed") {
    await storage.updateCompany(companyId, {
      fiscalDayOpen: false,
      lastFiscalDayStatus: "FiscalDayClosed",
      dailyReceiptCount: 0,
    });
  } else {
    await storage.updateCompany(companyId, {
      fiscalDayOpen: true,
      lastFiscalDayStatus: status.fiscalDayStatus || "FiscalDayCloseInitiated",
    });
  }

  return {
    fiscalDayNo,
    receiptCounter,
    counters,
    closeResult,
    status,
  };
}

async function assertStartsClosed() {
  const company = await storage.getCompany(companyId);
  if (!company) throw new Error(`Company ${companyId} not found`);
  if (!company.fdmsDeviceId) throw new Error(`Company ${companyId} is not registered with ZIMRA`);

  const device = new ZimraDevice({
    deviceId: company.fdmsDeviceId,
    deviceSerialNo: company.fdmsDeviceSerialNo || "UNKNOWN",
    activationKey: company.fdmsApiKey || "",
    privateKey: company.zimraPrivateKey || "",
    certificate: company.zimraCertificate || "",
    baseUrl: getZimraBaseUrl((company.zimraEnvironment as "test" | "production") || "test"),
  }, getZimraLogger(companyId));

  const status = await device.getStatus() as any;
  if (status.fiscalDayStatus !== "FiscalDayClosed" && !continueOpen) {
    throw new Error(`ZIMRA fiscal day is ${status.fiscalDayStatus} for day ${status.lastFiscalDayNo}. Close or repair it before running the stress harness.`);
  }
  if (status.fiscalDayStatus !== "FiscalDayClosed") {
    console.log(`[stress] Continuing from open ZIMRA fiscal day ${status.lastFiscalDayNo} (${status.fiscalDayStatus})`);
  }
}

async function main() {
  await assertStartsClosed();

  const customer = await ensureCustomer();
  const tax = await getStandardTax();
  const results: any[] = [];

  console.log(`[stress] Run ${runId}`);
  console.log(`[stress] Company ${companyId}; customer ${customer.id}; tax ${tax.name} ${tax.rate}% ZIMRA ${tax.zimraTaxId || "n/a"}`);

  const selectedScenarios = onlyScenario
    ? scenarios.filter(scenario => scenario.name.toLowerCase() === onlyScenario)
    : scenarios;
  if (onlyScenario && selectedScenarios.length === 0) {
    throw new Error(`No scenario found named "${onlyScenario}".`);
  }

  for (const scenario of selectedScenarios) {
    console.log(`[stress] Starting scenario: ${scenario.name}`);
    const relatedByLabel = new Map<string, any>();
    const documents = [];

    for (const doc of scenario.documents) {
      const result = await createAndFiscalizeDocument(scenario.name, doc, customer.id, tax, relatedByLabel);
      documents.push(result);
      console.log(`[stress] Fiscalized ${result.invoiceNumber} ${result.transactionType} ${result.currency} receipt ${result.receiptCounter}`);
    }

    const close = await closeCurrentFiscalDay();
    const passed = close.status.fiscalDayStatus === "FiscalDayClosed";
    results.push({
      scenario: scenario.name,
      passed,
      documents,
      fiscalDayNo: close.fiscalDayNo,
      receiptCounter: close.receiptCounter,
      closeStatus: close.status,
      counters: close.counters,
    });

    console.log(`[stress] Closed day ${close.fiscalDayNo}: ${close.status.fiscalDayStatus}`);
    if (!passed) {
      console.log(JSON.stringify(results, null, 2));
      throw new Error(`Scenario "${scenario.name}" failed to close: ${close.status.fiscalDayClosingErrorCode || close.status.fiscalDayStatus}`);
    }
  }

  console.log(JSON.stringify({ runId, companyId, results }, null, 2));
}

main()
  .catch(error => {
    console.error("[stress] FAILED", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
