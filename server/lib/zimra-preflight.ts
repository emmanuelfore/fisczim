import { and, eq, ne } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { invoices, invoiceItems } from "../../shared/schema.js";
import type { ReceiptData, ZimraConfigResponse } from "../zimra.js";

export type ZimraPreflightIssue = {
  code: string;
  message: string;
};

export class ZimraPreflightError extends Error {
  issues: ZimraPreflightIssue[];

  constructor(message: string, issues: ZimraPreflightIssue[]) {
    super(message);
    this.name = "ZimraPreflightError";
    this.issues = issues;
  }
}

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const approxEqual = (a: number, b: number, tolerance = 0.02) => Math.abs(roundMoney(a) - roundMoney(b)) <= tolerance;

function addIssue(issues: ZimraPreflightIssue[], code: string, message: string) {
  issues.push({ code, message });
}

function normalizedLineTotal(receipt: ReceiptData, line: any) {
  const quantity = Number(line.receiptLineQuantity);
  const price = Number(line.receiptLinePrice);
  const calculated = roundMoney(quantity * price);
  return receipt.receiptType === "CreditNote" ? -Math.abs(calculated) : calculated;
}

function lineTax(lineTotal: number, taxPercent: number, taxInclusive: boolean) {
  if (!taxPercent) return 0;
  if (taxInclusive) {
    return roundMoney(lineTotal - lineTotal / (1 + taxPercent / 100));
  }
  return roundMoney(lineTotal * (taxPercent / 100));
}

function parseZimraHarareDate(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return value ? new Date(value) : null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 2,
    Number(minute),
    Number(second)
  ));
}

export async function assertReceiptPreflight(args: {
  company: any;
  invoice: any;
  receiptData: ReceiptData;
  originalInvoice?: any;
  zimraConfig?: ZimraConfigResponse;
}) {
  const { company, invoice, receiptData, originalInvoice, zimraConfig } = args;
  const issues: ZimraPreflightIssue[] = [];
  const receiptType = receiptData.receiptType;
  const invoiceNumber = String(receiptData.invoiceNo || invoice.invoiceNumber || "").trim();

  if (!invoiceNumber) {
    addIssue(issues, "RCPT010", "Invoice number is required.");
  } else {
    const duplicates = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, company.id),
        eq(invoices.invoiceNumber, invoiceNumber),
        eq(invoices.syncedWithFdms, true),
        ne(invoices.id, invoice.id)
      ));
    if (duplicates.length > 0) {
      addIssue(issues, "RCPT013", `Invoice number ${invoiceNumber} is already fiscalized for this company.`);
    }
  }

  if (!receiptData.fiscalDayNo || receiptData.fiscalDayNo !== (company.currentFiscalDayNo || receiptData.fiscalDayNo)) {
    addIssue(issues, "PREFLIGHT_DAY_MISMATCH", `Receipt fiscal day ${receiptData.fiscalDayNo} does not match local open day ${company.currentFiscalDayNo}.`);
  }

  if (!receiptData.receiptCounter || receiptData.receiptCounter < 1) {
    addIssue(issues, "RCPT011", "Receipt counter is missing or invalid.");
  }

  if (!receiptData.receiptGlobalNo || receiptData.receiptGlobalNo < 1) {
    addIssue(issues, "RCPT012", "Receipt global number is missing or invalid.");
  }

  if (!invoice.receiptGlobalNo && company.lastReceiptGlobalNo && receiptData.receiptGlobalNo !== company.lastReceiptGlobalNo) {
    addIssue(issues, "RCPT012", `Receipt global number ${receiptData.receiptGlobalNo} does not match the locally claimed next global number ${company.lastReceiptGlobalNo}.`);
  }

  if (!invoice.receiptCounter && company.dailyReceiptCount && receiptData.receiptCounter !== company.dailyReceiptCount) {
    addIssue(issues, "RCPT011", `Receipt counter ${receiptData.receiptCounter} does not match the locally claimed daily counter ${company.dailyReceiptCount}.`);
  }

  const receiptDate = parseZimraHarareDate(receiptData.receiptDate);
  const openedAt = company.fiscalDayOpenedAt ? new Date(company.fiscalDayOpenedAt) : null;
  const lastReceiptAt = company.lastReceiptAt ? new Date(company.lastReceiptAt) : null;
  if (!receiptDate || Number.isNaN(receiptDate.getTime())) {
    addIssue(issues, "RCPT014", "Receipt date is missing or invalid.");
  } else {
    if (openedAt && !Number.isNaN(openedAt.getTime()) && receiptDate.getTime() <= openedAt.getTime()) {
      addIssue(issues, "RCPT014", "Receipt date must be after the fiscal day opening time.");
    }
    if (lastReceiptAt && !Number.isNaN(lastReceiptAt.getTime()) && receiptDate.getTime() <= lastReceiptAt.getTime()) {
      addIssue(issues, "RCPT030", "Invoice date is earlier than or equal to the previously submitted receipt date.");
    }
  }

  if (!Array.isArray(receiptData.receiptLines) || receiptData.receiptLines.length === 0) {
    addIssue(issues, "RCPT016", "Receipt has no lines.");
  }

  if (!Array.isArray(receiptData.receiptPayments) || receiptData.receiptPayments.length === 0) {
    addIssue(issues, "RCPT018", "Receipt has no payments.");
  }

  if (receiptData.buyerData) {
    const buyerData: any = receiptData.buyerData;
    if (!String(buyerData.buyerTIN || "").trim()) {
      addIssue(issues, "RCPT043", "Buyer TIN is mandatory when buyer data is submitted.");
    }
    if (!String(buyerData.buyerRegisterName || "").trim()) {
      addIssue(issues, "RCPT043", "Buyer register name is mandatory when buyer data is submitted.");
    }
  }

  const liveTaxIds = new Set((zimraConfig?.applicableTaxes || []).map(t => t.taxID));
  let expectedTotal = 0;
  let expectedTaxRows = 0;

  for (const [index, line] of (receiptData.receiptLines || []).entries()) {
    const lineNo = index + 1;
    const quantity = Number(line.receiptLineQuantity);
    const price = Number(line.receiptLinePrice);
    const submittedLineTotal = Number(line.receiptLineTotal);
    const taxPercent = Number(line.taxPercent || 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      addIssue(issues, "RCPT023", `Line ${lineNo} quantity must be positive.`);
    }

    if (!Number.isFinite(price) || price === 0) {
      addIssue(issues, "RCPT022", `Line ${lineNo} price must be non-zero.`);
    }

    const calculatedLineTotal = normalizedLineTotal(receiptData, line);
    const expectedSubmittedTotal = receiptType === "CreditNote" ? Math.abs(calculatedLineTotal) : calculatedLineTotal;
    if (!approxEqual(Math.abs(submittedLineTotal), Math.abs(expectedSubmittedTotal))) {
      addIssue(issues, "RCPT024", `Line ${lineNo} total does not match price times quantity.`);
    }

    const explicitlyNotVatRegistered = company.vatRegistered === false || company.vatEnabled === false;

    // Skip tax ID validation for non-VAT registered companies
    if (!explicitlyNotVatRegistered) {
      if (!line.taxID || (liveTaxIds.size > 0 && !liveTaxIds.has(line.taxID))) {
        addIssue(issues, "RCPT025", `Line ${lineNo} tax ID ${line.taxID || "missing"} is not valid for this ZIMRA device.`);
      }

      if (line.taxID !== 1 && !Number.isFinite(taxPercent)) {
        addIssue(issues, "RCPT025", `Line ${lineNo} tax percent is invalid.`);
      }

      if (taxPercent > 0) {
        addIssue(issues, "RCPT021", `Line ${lineNo} uses VAT while this company is marked as not VAT registered.`);
      }
    }

    const hsCode = String(line.receiptLineHSCode || "").trim();
    if (!/^\d{4}$|^\d{8}$/.test(hsCode)) {
      addIssue(issues, "RCPT048", `Line ${lineNo} HS code must be 4 or 8 digits.`);
    }

    const tax = lineTax(calculatedLineTotal, taxPercent, !!receiptData.receiptLinesTaxInclusive);
    if (line.taxID) expectedTaxRows++;
    expectedTotal += receiptData.receiptLinesTaxInclusive ? calculatedLineTotal : calculatedLineTotal + tax;
  }

  // Skip tax rows validation for non-VAT registered companies
  const explicitlyNotVatRegistered = company.vatRegistered === false || company.vatEnabled === false;
  if (!explicitlyNotVatRegistered && (receiptData.receiptLines || []).length > 0 && expectedTaxRows === 0) {
    addIssue(issues, "RCPT017", "Taxes information is not provided for receipt lines.");
  }

  expectedTotal = roundMoney(expectedTotal);
  const paymentTotal = roundMoney((receiptData.receiptPayments || []).reduce((sum: number, p: any) => sum + Number(p.paymentAmount || 0), 0));
  const signedInvoiceTotal = receiptType === "CreditNote" ? -Math.abs(Number(invoice.total || 0)) : Math.abs(Number(invoice.total || 0));
  if (Number.isFinite(signedInvoiceTotal) && !approxEqual(expectedTotal, signedInvoiceTotal)) {
    addIssue(issues, "RCPT027", `Receipt calculated total ${expectedTotal.toFixed(2)} does not match invoice total ${signedInvoiceTotal.toFixed(2)}.`);
  }

  if (!approxEqual(paymentTotal, expectedTotal)) {
    addIssue(issues, "RCPT039", `Payment total ${paymentTotal.toFixed(2)} does not match expected receipt total ${expectedTotal.toFixed(2)}.`);
  }

  if (receiptType === "CreditNote") {
    if (paymentTotal > 0) {
      addIssue(issues, "RCPT028", "Credit note payment amount must be negative.");
    }
  } else if (paymentTotal < 0) {
    addIssue(issues, "RCPT028", `${receiptType} payment amount must not be negative.`);
  }

  if (receiptType === "CreditNote" || receiptType === "DebitNote") {
    if (!receiptData.creditDebitNote) {
      addIssue(issues, "RCPT015", `${receiptType} requires credited/debited invoice details.`);
    }
    if (!receiptData.receiptNotes?.trim()) {
      addIssue(issues, "RCPT034", `${receiptType} requires a note/reason.`);
    }
    if (!originalInvoice) {
      addIssue(issues, "RCPT032", `${receiptType} original invoice was not loaded.`);
    } else {
      if (!originalInvoice.fiscalCode || !originalInvoice.receiptGlobalNo || !originalInvoice.fiscalDayNo) {
        addIssue(issues, "RCPT032", `${receiptType} original invoice is not fully fiscalized.`);
      }
      if (originalInvoice.validationStatus === "red") {
        addIssue(issues, "RCPT032", `${receiptType} original invoice has red validation status.`);
      }
      if ((originalInvoice.currency || "USD") !== receiptData.receiptCurrency) {
        addIssue(issues, "RCPT042", `${receiptType} currency must match original invoice currency.`);
      }

      const originalItems = originalInvoice.items || [];
      const originalTaxKeys = new Set(originalItems.map((item: any) => `${Number(item.taxRate || 0).toFixed(2)}:${item.taxTypeId || ""}`));
      for (const item of invoice.items || []) {
        const key = `${Number(item.taxRate || 0).toFixed(2)}:${item.taxTypeId || ""}`;
        if (originalTaxKeys.size > 0 && !originalTaxKeys.has(key)) {
          addIssue(issues, "RCPT036", `${receiptType} uses tax ${key}, which differs from the original invoice.`);
        }
      }

      if (receiptType === "CreditNote") {
        const existingNotes = await db
          .select({ invoice: invoices })
          .from(invoices)
          .where(and(
            eq(invoices.companyId, company.id),
            eq(invoices.relatedInvoiceId, originalInvoice.id),
            eq(invoices.transactionType, "CreditNote"),
            eq(invoices.syncedWithFdms, true)
          ));
        const existingCreditTotal = existingNotes
          .filter(row => row.invoice.id !== invoice.id)
          .reduce((sum, row) => sum + Math.abs(Number(row.invoice.total || 0)), 0);
        const nextCreditTotal = existingCreditTotal + Math.abs(Number(invoice.total || expectedTotal || 0));
        if (nextCreditTotal > Math.abs(Number(originalInvoice.total || 0)) + 0.02) {
          addIssue(issues, "RCPT035", `Credit notes total ${nextCreditTotal.toFixed(2)} exceeds original invoice total ${Number(originalInvoice.total || 0).toFixed(2)}.`);
        }
      }
    }
  } else if (receiptData.creditDebitNote) {
    addIssue(issues, "RCPT029", "Fiscal invoice must not include credit/debit note reference data.");
  }

  if (issues.length > 0) {
    throw new ZimraPreflightError("ZIMRA preflight failed. Receipt was not submitted.", issues);
  }
}

export async function assertFiscalDayClosePreflight(companyId: number, fiscalDayNo: number) {
  const issues: ZimraPreflightIssue[] = [];
  const dayInvoices = await storage.getInvoicesByFiscalDay(companyId, fiscalDayNo);
  const synced = dayInvoices.filter(inv => inv.syncedWithFdms);

  if (synced.length === 0) {
    addIssue(issues, "CLOSE_NO_RECEIPTS", "Fiscal day has no synced receipts to close.");
  }

  const invalid = synced.filter(inv => ["red", "grey", "invalid"].includes(String(inv.validationStatus || "").toLowerCase()));
  for (const inv of invalid) {
    addIssue(issues, "CLOSE_INVALID_RECEIPT", `${inv.invoiceNumber} has validation status ${inv.validationStatus}.`);
  }

  const byCounter = new Map<number, string[]>();
  for (const inv of synced) {
    if (!inv.receiptCounter || !inv.receiptGlobalNo || !inv.fiscalDayNo) {
      addIssue(issues, "CLOSE_MISSING_RECEIPT_NUMBERS", `${inv.invoiceNumber} is missing receipt counter/global/fiscal day.`);
      continue;
    }
    if (inv.fiscalDayNo !== fiscalDayNo) {
      addIssue(issues, "CLOSE_DAY_MISMATCH", `${inv.invoiceNumber} belongs to fiscal day ${inv.fiscalDayNo}, expected ${fiscalDayNo}.`);
    }
    const list = byCounter.get(inv.receiptCounter) || [];
    list.push(inv.invoiceNumber);
    byCounter.set(inv.receiptCounter, list);
  }

  for (const [counter, invoiceNumbers] of byCounter.entries()) {
    if (invoiceNumbers.length > 1) {
      addIssue(issues, "CLOSE_DUPLICATE_COUNTER", `Receipt counter ${counter} is duplicated by ${invoiceNumbers.join(", ")}.`);
    }
  }

  const maxCounter = Math.max(0, ...Array.from(byCounter.keys()));
  for (let counter = 1; counter <= maxCounter; counter++) {
    if (!byCounter.has(counter)) {
      addIssue(issues, "CLOSE_MISSING_COUNTER", `Receipt counter ${counter} is missing in fiscal day ${fiscalDayNo}.`);
    }
  }

  for (const inv of synced.filter(inv => inv.transactionType === "CreditNote" || inv.transactionType === "DebitNote")) {
    if (!inv.relatedInvoiceId) {
      addIssue(issues, "CLOSE_BAD_NOTE_REFERENCE", `${inv.invoiceNumber} has no related original invoice.`);
      continue;
    }
    const original = await storage.getInvoice(inv.relatedInvoiceId);
    if (!original?.fiscalCode || !original.receiptGlobalNo || !original.fiscalDayNo || original.validationStatus === "red") {
      addIssue(issues, "CLOSE_BAD_NOTE_REFERENCE", `${inv.invoiceNumber} original invoice is not a valid fiscalized receipt.`);
    }
  }

  const rows = await db
    .select({ invoice: invoices, item: invoiceItems })
    .from(invoices)
    .leftJoin(invoiceItems, eq(invoices.id, invoiceItems.invoiceId))
    .where(and(eq(invoices.companyId, companyId), eq(invoices.fiscalDayNo, fiscalDayNo), eq(invoices.syncedWithFdms, true)));

  const itemCounts = new Map<number, number>();
  for (const row of rows) {
    if (!row.invoice) continue;
    itemCounts.set(row.invoice.id, (itemCounts.get(row.invoice.id) || 0) + (row.item ? 1 : 0));
  }
  for (const inv of synced) {
    if ((itemCounts.get(inv.id) || 0) === 0) {
      addIssue(issues, "CLOSE_MISSING_ITEMS", `${inv.invoiceNumber} is synced but has no invoice items.`);
    }
  }

  const counters = await storage.calculateFiscalCounters(companyId, fiscalDayNo);
  for (const counter of counters) {
    const value = Number(counter.fiscalCounterValue);
    if (!Number.isFinite(value)) {
      addIssue(issues, "CLOSE_BAD_COUNTER", `${counter.fiscalCounterType} has invalid value ${counter.fiscalCounterValue}.`);
    }
  }

  if (issues.length > 0) {
    throw new ZimraPreflightError("Fiscal day is not ready to close.", issues);
  }

  return { dayInvoices, counters };
}
