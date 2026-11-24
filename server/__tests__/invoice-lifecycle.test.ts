import { describe, expect, test } from "vitest";
import {
  CORRECTABLE_INVOICE_STATUSES,
  DRAFT_INVOICE_STATUSES,
  invoiceImmutableReasons,
} from "../lib/invoice-lifecycle.js";

describe("invoice correction lifecycle", () => {
  test("issued invoices are correctable until fiscal or ledger evidence exists", () => {
    expect(CORRECTABLE_INVOICE_STATUSES.has("issued")).toBe(true);
    expect(DRAFT_INVOICE_STATUSES.has("issued")).toBe(false);
    expect(invoiceImmutableReasons({ status: "issued", fdmsStatus: "Failed" })).toEqual([]);
  });

  test("successful fiscalization makes even an issued invoice immutable", () => {
    expect(invoiceImmutableReasons({
      status: "issued",
      fiscalCode: "FC-123",
      fdmsStatus: "Fiscalized",
      syncedWithFdms: true,
    })).toEqual(expect.arrayContaining([
      "a fiscal code is present",
      "the invoice was synced to FDMS",
    ]));
  });

  test("empty fiscal fields from a failed attempt are not treated as evidence", () => {
    expect(invoiceImmutableReasons({
      status: "issued",
      fiscalCode: "",
      qrCodeData: "",
      submissionId: "",
      fdmsStatus: "Failed",
    })).toEqual([]);
  });

  test("ledger postings block commercial corrections", () => {
    expect(invoiceImmutableReasons({ status: "issued", journalEntryId: 42 })).toContain("a journal entry is attached");
  });
});
