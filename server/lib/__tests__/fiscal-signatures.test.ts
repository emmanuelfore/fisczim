import { describe, expect, test } from "vitest";
import {
  buildFiscalDayDeviceSignatureInput,
  buildReceiptDeviceSignatureInput,
  buildReceiptTaxesSignatureString,
  formatTaxPercentForSignature,
  normalizeFiscalCountersForSignature,
} from "../fiscal-signatures.js";

describe("fiscal signature canonicalization", () => {
  test("matches the FDMS fiscal invoice example with tax codes and previous hash", () => {
    const input = buildReceiptDeviceSignatureInput({
      deviceId: "321",
      receiptType: "FiscalInvoice",
      receiptCurrency: "zwl",
      receiptGlobalNo: 432,
      receiptDate: "2019-09-19T15:43:12",
      receiptTotal: 9450,
      previousReceiptHash: "hNVJXP/ACOiE8McD3pKsDlqBXpuaUqQOfPnMyfZWI9k=",
      receiptTaxes: [
        { taxID: 3, taxCode: "D", taxPercent: 15, taxAmount: 300, salesAmountWithTax: 2300 },
        { taxID: 2, taxCode: "B", taxPercent: 0, taxAmount: 0, salesAmountWithTax: 3500 },
        { taxID: 1, taxCode: "A", taxPercent: 0, taxAmount: 0, salesAmountWithTax: 2500 },
        { taxID: 3, taxCode: "C", taxPercent: 15, taxAmount: 150, salesAmountWithTax: 1150 },
      ],
    });

    expect(input).toBe(
      "321FISCALINVOICEZWL4322019-09-19T15:43:12945000A0250000B0.000350000C15.0015000115000D15.0030000230000hNVJXP/ACOiE8McD3pKsDlqBXpuaUqQOfPnMyfZWI9k=",
    );
  });

  test("matches the FDMS fiscal invoice example without tax codes", () => {
    const input = buildReceiptDeviceSignatureInput({
      deviceId: "322",
      receiptType: "FiscalInvoice",
      receiptCurrency: "usd",
      receiptGlobalNo: 85,
      receiptDate: "2019-09-19T09:23:07",
      receiptTotal: 40.35,
      previousReceiptHash: "hNVJXP/ACOiE8McD3pKsDlqBXpuaUqQOfPnMyfZWI9k=",
      receiptTaxes: [
        { taxID: 3, taxPercent: 14.5, taxAmount: 0.05, salesAmountWithTax: 0.35 },
        { taxID: 1, taxPercent: 0, taxAmount: 0, salesAmountWithTax: 7 },
        { taxID: 2, taxPercent: 0, taxAmount: 0, salesAmountWithTax: 10 },
      ],
    });

    expect(input).toBe(
      "322FISCALINVOICEUSD852019-09-19T09:23:07403507000.000100014.50535hNVJXP/ACOiE8McD3pKsDlqBXpuaUqQOfPnMyfZWI9k=",
    );
  });

  test("formats exempt and non-exempt tax percentages exactly as FDMS expects", () => {
    expect(formatTaxPercentForSignature(1, 0)).toBe("");
    expect(formatTaxPercentForSignature(2, 0)).toBe("0.00");
    expect(formatTaxPercentForSignature(3, 14.5)).toBe("14.50");
  });

  test("uses deterministic tax ordering and changes the signature input when a signed field changes", () => {
    const taxes = [
      { taxID: 3, taxCode: "D", taxPercent: 15, taxAmount: 300, salesAmountWithTax: 2300 },
      { taxID: 3, taxCode: "C", taxPercent: 15, taxAmount: 150, salesAmountWithTax: 1150 },
      { taxID: 1, taxCode: "A", taxPercent: 0, taxAmount: 0, salesAmountWithTax: 2500 },
    ];
    const canonical = buildReceiptTaxesSignatureString(taxes);
    const changed = buildReceiptDeviceSignatureInput({
      deviceId: "321",
      receiptType: "FiscalInvoice",
      receiptCurrency: "ZWL",
      receiptGlobalNo: 432,
      receiptDate: "2019-09-19T15:43:12",
      receiptTotal: 9450.01,
      receiptTaxes: taxes,
    });

    expect(canonical).toBe("A0250000C15.0015000115000D15.0030000230000");
    expect(changed).toContain("945001");
    expect(changed).not.toContain("945000");
  });

  test("builds fiscal day signatures with stable documented ordering and formatting", () => {
    const input = buildFiscalDayDeviceSignatureInput({
      deviceId: "321",
      fiscalDayNo: 84,
      fiscalDayDate: "2019-09-23",
      counters: [
        { fiscalCounterType: "BalanceByMoneyType", fiscalCounterCurrency: "ZWL", fiscalCounterMoneyType: "CARD", fiscalCounterValue: 15000 },
        { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "ZWL", fiscalCounterTaxID: 2, fiscalCounterTaxPercent: 0, fiscalCounterValue: 12000 },
        { fiscalCounterType: "SaleTaxByTax", fiscalCounterCurrency: "USD", fiscalCounterTaxPercent: 15, fiscalCounterValue: 2.5 },
        { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "USD", fiscalCounterTaxID: 3, fiscalCounterTaxPercent: 14.5, fiscalCounterValue: 25 },
        { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "ZWL", fiscalCounterTaxID: 1, fiscalCounterValue: 23000 },
        { fiscalCounterType: "BalanceByMoneyType", fiscalCounterCurrency: "USD", fiscalCounterMoneyType: "CASH", fiscalCounterValue: 37 },
        { fiscalCounterType: "SaleTaxByTax", fiscalCounterCurrency: "ZWL", fiscalCounterTaxPercent: 15, fiscalCounterValue: 2300 },
        { fiscalCounterType: "BalanceByMoneyType", fiscalCounterCurrency: "ZWL", fiscalCounterMoneyType: "CASH", fiscalCounterValue: 20000 },
      ],
    });

    expect(input).toBe(
      "321842019-09-23SALEBYTAXUSD14.502500SALEBYTAXZWL2300000SALEBYTAXZWL0.001200000SALETAXBYTAXUSD15.00250SALETAXBYTAXZWL15.00230000BALANCEBYMONEYTYPEUSDCASH3700BALANCEBYMONEYTYPEZWLCASH2000000BALANCEBYMONEYTYPEZWLCARD1500000",
    );
  });

  test("normalizes fiscal day counters into a stable order", () => {
    const counters = normalizeFiscalCountersForSignature([
      { fiscalCounterType: "BalanceByMoneyType", fiscalCounterCurrency: "ZWL", fiscalCounterMoneyType: "CARD", fiscalCounterValue: 15000 },
      { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "USD", fiscalCounterTaxID: 3, fiscalCounterTaxPercent: 14.5, fiscalCounterValue: 25 },
      { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "ZWL", fiscalCounterTaxID: 1, fiscalCounterValue: 23000 },
      { fiscalCounterType: "BalanceByMoneyType", fiscalCounterCurrency: "ZWL", fiscalCounterMoneyType: "CASH", fiscalCounterValue: 20000 },
    ]);

    expect(counters.map((counter) => `${counter.fiscalCounterType}:${counter.fiscalCounterCurrency}:${counter.fiscalCounterMoneyType || ""}`)).toEqual([
      "SaleByTax:USD:",
      "SaleByTax:ZWL:",
      "BalanceByMoneyType:ZWL:Cash",
      "BalanceByMoneyType:ZWL:Card",
    ]);
  });
});
