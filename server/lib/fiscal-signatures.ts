export interface SignatureReceiptTaxLike {
  taxID: number;
  taxCode?: string | null;
  taxPercent?: number | null;
  taxAmount: number;
  salesAmountWithTax: number;
}

export interface SignatureFiscalCounterLike {
  fiscalCounterType: string;
  fiscalCounterCurrency: string;
  fiscalCounterTaxPercent?: number | null;
  fiscalCounterTaxID?: number | null;
  fiscalCounterMoneyType?: string | null;
  fiscalCounterValue: number;
}

export function normalizeSignedAmountToCents(value: number): string {
  return Math.round(Number(value) * 100).toString();
}

export function formatTaxPercentForSignature(taxID: number, taxPercent?: number | null): string {
  if (taxID === 1 || taxPercent === undefined || taxPercent === null) {
    return "";
  }

  return Number(taxPercent).toFixed(2);
}

export function sortReceiptTaxesForSignature<T extends SignatureReceiptTaxLike>(taxes: T[]): T[] {
  return [...taxes].sort((left, right) => {
    if (left.taxID !== right.taxID) {
      return left.taxID - right.taxID;
    }

    return (left.taxCode || "").localeCompare(right.taxCode || "");
  });
}

export function buildReceiptTaxesSignatureString(taxes: SignatureReceiptTaxLike[]): string {
  return sortReceiptTaxesForSignature(taxes)
    .map((tax) => {
      const percent = formatTaxPercentForSignature(tax.taxID, tax.taxPercent);
      const amount = normalizeSignedAmountToCents(tax.taxAmount);
      const sales = normalizeSignedAmountToCents(tax.salesAmountWithTax);
      return `${tax.taxCode || ""}${percent}${amount}${sales}`;
    })
    .join("");
}

export function buildReceiptDeviceSignatureInput(params: {
  deviceId: string | number;
  receiptType: string;
  receiptCurrency: string;
  receiptGlobalNo: number;
  receiptDate: string;
  receiptTotal: number;
  receiptTaxes: SignatureReceiptTaxLike[];
  previousReceiptHash?: string | null;
}): string {
  const base = [
    String(parseInt(String(params.deviceId), 10)),
    String(params.receiptType).toUpperCase(),
    String(params.receiptCurrency).toUpperCase(),
    String(params.receiptGlobalNo),
    params.receiptDate,
    normalizeSignedAmountToCents(params.receiptTotal),
    buildReceiptTaxesSignatureString(params.receiptTaxes),
  ].join("");

  return params.previousReceiptHash ? `${base}${params.previousReceiptHash}` : base;
}

const FISCAL_COUNTER_TYPE_PRIORITY: Record<string, number> = {
  SALEBYTAX: 1,
  SALETAXBYTAX: 2,
  CREDITNOTEBYTAX: 3,
  CREDITNOTETAXBYTAX: 4,
  DEBITNOTEBYTAX: 5,
  DEBITNOTETAXBYTAX: 6,
  BALANCEBYMONEYTYPE: 7,
};

const FISCAL_COUNTER_TYPE_CANONICAL: Record<string, string> = {
  SALEBYTAX: "SaleByTax",
  SALETAXBYTAX: "SaleTaxByTax",
  CREDITNOTEBYTAX: "CreditNoteByTax",
  CREDITNOTETAXBYTAX: "CreditNoteTaxByTax",
  DEBITNOTEBYTAX: "DebitNoteByTax",
  DEBITNOTETAXBYTAX: "DebitNoteTaxByTax",
  BALANCEBYMONEYTYPE: "BalanceByMoneyType",
  PAYOUTBYTAX: "PayoutByTax",
  PAYOUTTAXBYTAX: "PayoutTaxByTax",
};

const MONEY_TYPE_PRIORITY: Record<string, number> = {
  CASH: 0,
  CARD: 1,
  MOBILEWALLET: 2,
  COUPON: 3,
  CREDIT: 4,
  BANKTRANSFER: 5,
  OTHER: 6,
};

const MONEY_TYPE_CANONICAL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILEWALLET: "MobileWallet",
  COUPON: "Coupon",
  CREDIT: "Credit",
  BANKTRANSFER: "BankTransfer",
  OTHER: "Other",
};

function normalizeCounterType(type: unknown): string {
  const normalized = String(type || "").toUpperCase();
  return FISCAL_COUNTER_TYPE_CANONICAL[normalized] || String(type || "");
}

function normalizeCounterMoneyType(moneyType: unknown): string {
  const normalized = String(moneyType || "").toUpperCase();
  return MONEY_TYPE_CANONICAL[normalized] || String(moneyType || "");
}

function normalizeCounterMoneyTypeForSort(moneyType: unknown): number {
  const normalized = String(moneyType || "").toUpperCase();
  return MONEY_TYPE_PRIORITY[normalized] ?? 99;
}

export function normalizeFiscalCountersForSignature<T extends SignatureFiscalCounterLike>(counters: T[]): T[] {
  return counters
    .filter((counter) => Math.abs(Number(counter.fiscalCounterValue || 0)) > 0.001)
    .map((counter) => ({
      ...counter,
      fiscalCounterType: normalizeCounterType(counter.fiscalCounterType),
      ...(counter.fiscalCounterMoneyType !== undefined && counter.fiscalCounterMoneyType !== null
        ? { fiscalCounterMoneyType: normalizeCounterMoneyType(counter.fiscalCounterMoneyType) }
        : {}),
    }))
    .sort((left, right) => {
      const leftType = FISCAL_COUNTER_TYPE_PRIORITY[String(left.fiscalCounterType).toUpperCase()] || 99;
      const rightType = FISCAL_COUNTER_TYPE_PRIORITY[String(right.fiscalCounterType).toUpperCase()] || 99;
      if (leftType !== rightType) {
        return leftType - rightType;
      }

      const leftCurrency = left.fiscalCounterCurrency || "";
      const rightCurrency = right.fiscalCounterCurrency || "";
      if (leftCurrency !== rightCurrency) {
        return leftCurrency.localeCompare(rightCurrency);
      }

      const leftTaxId = left.fiscalCounterTaxID ?? "";
      const rightTaxId = right.fiscalCounterTaxID ?? "";
      if (leftTaxId !== rightTaxId) {
        if (typeof leftTaxId === "number" && typeof rightTaxId === "number") {
          return leftTaxId - rightTaxId;
        }

        return String(leftTaxId).localeCompare(String(rightTaxId));
      }

      return normalizeCounterMoneyTypeForSort(left.fiscalCounterMoneyType) - normalizeCounterMoneyTypeForSort(right.fiscalCounterMoneyType);
    });
}

export function buildFiscalDayCountersSignatureString(counters: SignatureFiscalCounterLike[]): string {
  return normalizeFiscalCountersForSignature(counters)
    .map((counter) => {
      const type = String(counter.fiscalCounterType).toUpperCase();
      const currency = String(counter.fiscalCounterCurrency).toUpperCase();
      const taxPercent = counter.fiscalCounterTaxPercent === undefined || counter.fiscalCounterTaxPercent === null
        ? ""
        : Number(counter.fiscalCounterTaxPercent).toFixed(2);
      const moneyType = counter.fiscalCounterMoneyType === undefined || counter.fiscalCounterMoneyType === null
        ? ""
        : String(counter.fiscalCounterMoneyType).toUpperCase();
      const value = normalizeSignedAmountToCents(counter.fiscalCounterValue);

      return `${type}${currency}${taxPercent}${moneyType}${value}`;
    })
    .join("");
}

export function buildFiscalDayDeviceSignatureInput(params: {
  deviceId: string | number;
  fiscalDayNo: number;
  fiscalDayDate: string;
  counters: SignatureFiscalCounterLike[];
}): string {
  return [
    String(parseInt(String(params.deviceId), 10)),
    String(params.fiscalDayNo),
    params.fiscalDayDate,
    buildFiscalDayCountersSignatureString(params.counters),
  ].join("");
}
