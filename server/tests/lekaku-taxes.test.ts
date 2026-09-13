import { describe, expect, test } from "vitest";
import forge from "node-forge";
import {
  generateLekukaKeypair,
  prepareLekukaReceipt,
  type LekukaReceipt,
} from "../lekuka.js";
import {
  assertLekukaTaxPreflight,
  type LekukaMappedTax,
  type LekukaLevyEntry,
} from "../lib/fiscalization.js";

const VAT15: LekukaMappedTax = { taxID: 3, taxType: "VAT", taxRate: 15 };
const EXEMPT: LekukaMappedTax = { taxID: 1, taxType: "Exempt", taxRate: 0 };
const leviesNone = new Map<number, LekukaLevyEntry[]>();

const baseReceipt = (over: Partial<LekukaReceipt>): LekukaReceipt => ({
  receiptType: "FiscalInvoice",
  receiptCurrency: "LSL",
  receiptCounter: 1,
  receiptGlobalNo: 1,
  invoiceNo: "LS-T1",
  receiptDate: "2026-09-10T10:00:00",
  receiptLinesTaxInclusive: false,
  receiptLines: [],
  receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 0 }],
  ...over,
});

describe("LEKUKA CSR common name (RSL spec)", () => {
  test("CN is RSL-<serial>-<zero-padded-10-digit-deviceId>", () => {
    const { privateKey, certificateRequest } = generateLekukaKeypair("812", "SN-0004");
    expect(privateKey).toContain("BEGIN RSA PRIVATE KEY");
    const csr = forge.pki.certificationRequestFromPem(certificateRequest);
    const cn = csr.subject.getField("CN" as any);
    expect((cn as any)?.value).toBe("RSL-SN-0004-0000000812");
  });
  test("CN without serial falls back to RSL-<paddedId>", () => {
    const { certificateRequest } = generateLekukaKeypair(187);
    const csr = forge.pki.certificationRequestFromPem(certificateRequest);
    const cn = csr.subject.getField("CN" as any);
    expect((cn as any)?.value).toBe("RSL-0000000187");
  });
});

describe("LEKUKA tax preflight (fail locally, never at the gateway)", () => {
  const mapping = new Map<number, LekukaMappedTax>([
    [10, VAT15],
    [11, EXEMPT],
  ]);
  const item = (taxTypeId: number, extra: any = {}) => ({
    description: "Item", unitPrice: 100, quantity: 1, taxRate: 99, // stored rate must be IGNORED
    product: { id: 1, taxTypeId }, taxTypeId, ...extra,
  });

  test("passes for mapped, valid taxes", () => {
    expect(() => assertLekukaTaxPreflight([item(10)], mapping, leviesNone, "2026-09-10T10:00:00")).not.toThrow();
  });
  test("rejects unmapped product tax", () => {
    expect(() => assertLekukaTaxPreflight([item(999)], mapping, leviesNone, "2026-09-10T10:00:00")).toThrow(/not mapped/);
  });
  test("rejects expired gateway tax", () => {
    const m = new Map<number, LekukaMappedTax>([[10, { ...VAT15, validTill: "2026-01-01" }]]);
    expect(() => assertLekukaTaxPreflight([item(10)], m, leviesNone, "2026-09-10T10:00:00")).toThrow(/expired/);
  });
  test("rejects not-yet-valid gateway tax", () => {
    const m = new Map<number, LekukaMappedTax>([[10, { ...VAT15, validFrom: "2027-01-01" }]]);
    expect(() => assertLekukaTaxPreflight([item(10)], m, leviesNone, "2026-09-10T10:00:00")).toThrow(/not yet valid/);
  });
  test("rejects WithholdingTax as a line main tax", () => {
    const m = new Map<number, LekukaMappedTax>([[10, { taxID: 9, taxType: "WithholdingTax", taxRate: 10 }]]);
    expect(() => assertLekukaTaxPreflight([item(10)], m, leviesNone, "2026-09-10T10:00:00")).toThrow(/cannot be a receipt line's main tax/);
  });
  test("rejects unmapped levy and fixed levy without quantity", () => {
    const badLevy = new Map<number, LekukaLevyEntry[]>([
      [1, [{ taxTypeId: 50, lekukaTaxId: "", lekukaTaxType: "", rate: "5", appliedForQuantity: null }]],
    ]);
    expect(() => assertLekukaTaxPreflight([item(10)], mapping, badLevy, "2026-09-10T10:00:00")).toThrow(/levy is not mapped/);
    const noQty = new Map<number, LekukaLevyEntry[]>([
      [1, [{ taxTypeId: 51, lekukaTaxId: "7", lekukaTaxType: "FixedValueLevy", rate: "2.5", appliedForQuantity: null }]],
    ]);
    expect(() => assertLekukaTaxPreflight([item(10)], mapping, noQty, "2026-09-10T10:00:00")).toThrow(/appliedForQuantity/);
  });
});

describe("LEKUKA receipt tax table (spec objects)", () => {
  const line = (over: any = {}) => ({
    receiptLineType: "Sale" as const, receiptLineNo: 1, receiptLineName: "Item",
    receiptLineQuantity: 1, receiptLineTotal: 100, taxID: 3, taxType: "VAT" as const, taxRate: 15, ...over,
  });

  test("Exempt lines carry no rate and zero tax", () => {
    const r = prepareLekukaReceipt(baseReceipt({
      receiptLines: [line({ taxID: 1, taxType: "Exempt", taxRate: undefined })],
      receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 100 }],
    }));
    expect(r.receiptTaxes).toEqual([expect.objectContaining({ taxID: 1, taxType: "Exempt", taxAmount: 0 })]);
    expect(r.receiptTotal).toBe(100);
  });

  test("PerReceipt vs PerReceiptLine rounding differ on fractional lines", () => {
    const lines = [1, 2, 3].map((n) => line({ receiptLineNo: n, receiptLineTotal: 0.1 }));
    const perLine = prepareLekukaReceipt(baseReceipt({
      receiptLines: lines, receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 0.36 }], taxRoundingType: "PerReceiptLine",
    }));
    const perReceipt = prepareLekukaReceipt(baseReceipt({
      receiptLines: lines, receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 0.35 }], taxRoundingType: "PerReceipt",
    }));
    const amt = (r: any) => r.receiptTaxes.find((t: any) => t.taxID === 3).taxAmount;
    expect(amt(perLine)).toBe(0.06); // 0.02 x 3 (round-then-sum)
    expect(amt(perReceipt)).toBe(0.05); // 0.30 x 15% = 0.045 -> 0.05 (aggregate-then-round)
    expect(amt(perLine)).not.toBe(amt(perReceipt));
  });

  test("ReceiptTax groups by taxID + taxCode", () => {
    const r = prepareLekukaReceipt(baseReceipt({
      receiptLines: [
        line({ receiptLineNo: 1, taxCode: "C" }),
        line({ receiptLineNo: 2, taxCode: "D" }),
      ],
      receiptPayments: [{ moneyTypeCode: "Cash", paymentAmount: 230 }],
    }));
    expect(r.receiptTaxes!.map((t) => t.taxCode).sort()).toEqual(["C", "D"]);
    expect(r.receiptTotal).toBe(230);
  });
});
