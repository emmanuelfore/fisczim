import { describe, expect, test } from "vitest";

process.env.DATABASE_URL ||= "postgres://user:pass@127.0.0.1:5432/test";
process.env.FISCAL_QR_SECRET ||= "test-fiscal-qr-secret";

const {
  buildCustomFieldWriteback,
  mapZohoInvoiceToFiscalizePayload,
} = await import("../zoho-books.js");
const {
  buildInvoiceQrUrl,
  signInvoiceQrToken,
  verifyInvoiceQrToken,
} = await import("../fiscal-qr.js");

const company = {
  id: 1,
  currency: "USD",
  fdmsDeviceId: "1234567890",
} as any;

describe("mapZohoInvoiceToFiscalizePayload", () => {
  test("maps lines, scales to sub_total, applies prefix and buyer tax ids", () => {
    const invoice = {
      invoice_id: "zoho-1",
      invoice_number: "INV-1",
      date: "2026-01-15",
      currency_code: "ZWG",
      status: "sent",
      sub_total: 270,
      line_items: [
        {
          name: "Standard item",
          quantity: 1,
          rate: 100,
          item_total: 100,
          tax_name: "Standard Rate",
          tax_percentage: 15,
        },
        {
          name: "Zero item",
          quantity: 2,
          rate: 100,
          item_total: 200,
          tax_name: "Zero Rated",
          tax_percentage: 0,
        },
      ],
    };

    const contact = {
      contact_name: "Acme (Pvt) Ltd",
      email: "accounts@acme.co.zw",
      phone: "+263771234567",
      address: "1 Samora Machel Ave",
      city: "Harare",
      custom_fields: [
        { label: "TIN", value: "1234567890" },
        { label: "VAT Number", value: "123456789" },
      ],
    };

    const payload = mapZohoInvoiceToFiscalizePayload(invoice, contact, company, {
      invoiceNumberPrefix: "ZOHO-",
      taxMap: { "Zero Rated": "ZERO_RATED" },
    });

    expect(payload.invoiceNumber).toBe("ZOHO-INV-1");
    expect(payload.currency).toBe("ZWG");
    expect(payload.date).toBe("2026-01-15");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].taxType).toBe("STANDARD");
    expect(payload.items[1].taxType).toBe("ZERO_RATED");
    // 300 net scaled down to Zoho's 270 sub_total
    expect(payload.items[0].unitPrice).toBe(90);
    expect(payload.items[1].unitPrice).toBe(90);
    expect(payload.buyer).toMatchObject({
      name: "Acme (Pvt) Ltd",
      tin: "1234567890",
      vatNumber: "123456789",
      email: "accounts@acme.co.zw",
    });
  });

  test("treats exempt tax names and defaults unknown currencies", () => {
    const invoice = {
      invoice_id: "zoho-2",
      invoice_number: "INV-2",
      currency_code: "EUR",
      line_items: [
        { name: "Service", quantity: 1, rate: 50, tax_name: "Exempt", tax_percentage: 0 },
      ],
    };

    const payload = mapZohoInvoiceToFiscalizePayload(invoice, null, company);
    expect(payload.currency).toBe("USD");
    expect(payload.items[0].taxType).toBe("EXEMPT");
  });

  test("backs tax out of tax-inclusive rates", () => {
    const invoice = {
      invoice_id: "zoho-3",
      invoice_number: "INV-3",
      is_inclusive_tax: true,
      sub_total: 100,
      line_items: [
        { name: "Inclusive", quantity: 1, rate: 115, tax_name: "Standard Rate", tax_percentage: 15 },
      ],
    };

    const payload = mapZohoInvoiceToFiscalizePayload(invoice, null, company);
    expect(payload.items[0].unitPrice).toBe(100);
    expect(payload.items[0].taxInclusive).toBe(false);
  });
});

describe("buildCustomFieldWriteback", () => {
  test("matches fields by label and reports missing labels", () => {
    const invoice = {
      custom_fields: [
        { customfield_id: "cf1", label: "Fiscal Code", value: "" },
        { customfield_id: "cf2", label: "QR Code Image", value: "" },
        { customfield_id: "cf3", label: "Fiscal Receipt Number", value: "" },
      ],
    };

    const qrCode =
      "https://fdms.zimra.co.zw/0000000001010520260000000012ABCDEF0123456789";
    const fiscal = {
      fiscalCode: "abc123",
      qrCode,
      receiptNumber: 42,
      receipt: { receiptCounter: 1, receiptGlobalNo: 42, fiscalDayNo: 3 },
    };

    const writeback = buildCustomFieldWriteback(
      invoice,
      fiscal,
      company,
      "https://fiscalstack.co.zw/api/public/fiscal/qr?c=1&invoice=INV-1&t=token",
      null,
    );

    const byId = Object.fromEntries(
      writeback.updates.map((update) => [update.customfield_id, update.value]),
    );

    expect(byId.cf1).toBe("abc123");
    expect(byId.cf2).toContain("/api/public/fiscal/qr");
    expect(byId.cf3).toBe("42");
    expect(writeback.values.verificationCode).toBe(qrCode.slice(-16));
    expect(writeback.missing).toEqual(
      expect.arrayContaining(["fiscalDay", "deviceId", "status"]),
    );
  });
});

describe("invoice QR tokens", () => {
  test("signs and verifies per company + invoice", () => {
    const token = signInvoiceQrToken(1, "INV-1");
    expect(token).toHaveLength(40);
    expect(verifyInvoiceQrToken(1, "INV-1", token)).toBe(true);
    expect(verifyInvoiceQrToken(1, "INV-2", token)).toBe(false);
    expect(verifyInvoiceQrToken(2, "INV-1", token)).toBe(false);
    expect(verifyInvoiceQrToken(1, "INV-1", "nope")).toBe(false);
  });

  test("builds an encoded public URL", () => {
    const url = buildInvoiceQrUrl("https://fiscalstack.co.zw/", 1, "INV/2026/1");
    expect(url).toContain("/api/public/fiscal/qr?c=1&invoice=INV%2F2026%2F1&t=");
  });
});
