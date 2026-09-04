import { describe, expect, test } from "vitest";
import { getLekakuReceiptSignatureInput, prepareLekakuReceipt } from "../lekaku.js";

describe("LEKAKU receipt preparation", () => {
  test("builds the v1.11 device-signature input in its documented order", () => {
    const receipt = {
      receiptType: "FiscalInvoice" as const, receiptCurrency: "LSL" as const, receiptCounter: 1, receiptGlobalNo: 432,
      invoiceNo: "signature-example", receiptDate: "2024-02-28T15:43:12", receiptLinesTaxInclusive: true,
      receiptPayments: [{ moneyTypeCode: "Cash" as const, paymentAmount: 9450 }], receiptTotal: 9450,
      receiptLines: [], receiptTaxes: [
        { taxID: 1, taxCode: "A", taxType: "Exempt" as const, taxAmount: 0, salesAmountWithTax: 2500 },
        { taxID: 2, taxCode: "B", taxType: "NonVAT" as const, taxRate: 0, taxAmount: 0, salesAmountWithTax: 3500 },
        { taxID: 3, taxCode: "C", taxType: "VAT" as const, taxRate: 15, taxAmount: 150, salesAmountWithTax: 1150 },
        { taxID: 3, taxCode: "D", taxType: "VAT" as const, taxRate: 15, taxAmount: 300, salesAmountWithTax: 2300 },
      ],
    };
    const input = getLekakuReceiptSignatureInput(receipt, 321, "hNVJXP/ACOiE8McD3pKsDlqBXpuaUqQOfPnMyfZWI9k=");
    expect(input).toBe("321FISCALINVOICELSL4322024-02-28T15:43:12945000A0250000B0.000350000C15.0015000115000D15.0030000230000hNVJXP/ACOiE8McD3pKsDlqBXpuaUqQOfPnMyfZWI9k=");
  });
  test("includes a percentage levy in both line data and aggregated receipt taxes", () => {
    const receipt = prepareLekakuReceipt({
      receiptType: "FiscalInvoice", receiptCurrency: "LSL", receiptCounter: 1, receiptGlobalNo: 1,
      invoiceNo: "LS-1", receiptDate: "2026-09-03T10:00:00", receiptLinesTaxInclusive: false,
      receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 115 }],
      receiptLines: [{ receiptLineType: "Sale", receiptLineNo: 1, receiptLineName: "Service", receiptLineQuantity: 1,
        receiptLineTotal: 100, taxID: 1, taxType: "VAT", taxRate: 15,
        additionalTaxes: [{ taxID: 9, receiptLineId: 1, taxType: "PercentageLevy", taxRate: 0 }] }],
    });
    expect(receipt.receiptTaxes).toEqual([
      expect.objectContaining({ taxID: 1, taxType: "VAT", taxAmount: 15, salesAmountWithTax: 115 }),
      expect.objectContaining({ taxID: 9, taxType: "PercentageLevy", taxAmount: 0, salesAmountWithTax: 100 }),
    ]);
    expect(receipt.receiptTotal).toBe(115);
  });

  test("adds a fixed levy to an exclusive receipt total", () => {
    const receipt = prepareLekakuReceipt({
      receiptType: "FiscalInvoice", receiptCurrency: "LSL", receiptCounter: 1, receiptGlobalNo: 1,
      invoiceNo: "LS-2", receiptDate: "2026-09-03T10:00:00", receiptLinesTaxInclusive: false,
      receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 25 }],
      receiptLines: [{ receiptLineType: "Sale", receiptLineNo: 1, receiptLineName: "Pack", receiptLineQuantity: 2,
        receiptLineTotal: 20, taxID: 2, taxType: "Exempt",
        additionalTaxes: [{ taxID: 10, receiptLineId: 1, taxType: "FixedValueLevy", taxRate: 2.5, appliedForQuantity: 2 }] }],
    });
    expect(receipt.receiptTaxes).toEqual(expect.arrayContaining([expect.objectContaining({ taxID: 10, taxAmount: 5 })]));
    expect(receipt.receiptTotal).toBe(25);
  });

  test("rejects a fixed levy without its required appliedForQuantity", () => {
    expect(() => prepareLekakuReceipt({
      receiptType: "FiscalInvoice", receiptCurrency: "LSL", receiptCounter: 1, receiptGlobalNo: 1,
      invoiceNo: "LS-3", receiptDate: "2026-09-03T10:00:00", receiptLinesTaxInclusive: false,
      receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 20 }],
      receiptLines: [{ receiptLineType: "Sale", receiptLineNo: 1, receiptLineName: "Item", receiptLineQuantity: 1,
        receiptLineTotal: 20, taxID: 2, taxType: "Exempt",
        additionalTaxes: [{ taxID: 10, receiptLineId: 1, taxType: "FixedValueLevy", taxRate: 2.5 }] }],
    })).toThrow("requires appliedForQuantity");
  });
});
