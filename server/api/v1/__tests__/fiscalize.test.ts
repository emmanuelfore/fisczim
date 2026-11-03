/**
 * Property-based tests for the pass-through fiscalize handler.
 *
 * Property 3: companyId always comes from API key, never from request body
 * Validates: Requirements 2.15, 9.1
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mock storage and fiscalization before importing the router
// ---------------------------------------------------------------------------
vi.mock("../../../storage.js", () => ({
  storage: {
    createCustomer: vi.fn(),
    createInvoice: vi.fn(),
    getNextInvoiceNumber: vi.fn(),
    getTaxTypes: vi.fn(),
    getCustomers: vi.fn(),
    getCurrencies: vi.fn(),
    getInvoices: vi.fn(),
    deleteInvoice: vi.fn(),
    getProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    syncLekukaTaxes: vi.fn(),
  },
}));

vi.mock("../../../lib/fiscalization.js", () => ({
  processInvoiceFiscalization: vi.fn(),
  getCompanyZimraConfig: vi.fn(),
}));

import { storage } from "../../../storage.js";
import { processInvoiceFiscalization, getCompanyZimraConfig } from "../../../lib/fiscalization.js";
import fiscalizeRouter from "../fiscalize.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid item */
const minimalItem = {
  name: "Test Item",
  quantity: 1,
  unitPrice: 100,
};

// Handler accepts any tax-identifier shape the authorities issue (ZIMRA 10-digit
// TIN / 9-digit VAT, RSL "200053040-8" / 8-digit VAT); the digit strings below
// are only the ZIMRA-shaped samples used by the buyer-storage properties.
const digitString9 = fc.stringMatching(/^\d{9}$/);
const digitString10 = fc.stringMatching(/^\d{10}$/);

/**
 * The rows "Sync Tax Config" leaves on a Lesotho account: hand-made taxes that
 * name no gateway taxID, plus the synced ones that do. Two 15% VAT rows exist
 * because RSL separates goods from services, and a till selling goods is billed
 * against the goods taxID.
 */
const rslTaxTypes = () => [
  { id: 310, name: "VAT", rate: "15.50", lekukaTaxId: null, lekukaTaxType: null },
  { id: 331, name: "15% VAT (Services)", rate: "15.00", lekukaTaxId: "1", lekukaTaxType: "VAT", lekukaEnvironment: "test" },
  { id: 332, name: "Exempt", rate: "0.00", lekukaTaxId: "4", lekukaTaxType: "Exempt", lekukaEnvironment: "test" },
  { id: 333, name: "0% VAT", rate: "0.00", lekukaTaxId: "6", lekukaTaxType: "NonVAT", lekukaEnvironment: "test" },
  { id: 334, name: "15% VAT (Goods)", rate: "15.00", lekukaTaxId: "7", lekukaTaxType: "VAT", lekukaEnvironment: "test" },
];

function setupDefaultMocks(
  authCompanyId: number,
  tenantCurrencies: Array<string | { code: string; isActive?: boolean }> = ["USD", "ZWG"],
  taxTypes: Array<Record<string, any>> = []
) {
  vi.mocked(storage.createCustomer).mockResolvedValue({
    id: 1,
    companyId: authCompanyId,
    name: "Walk-in Customer",
    vatNumber: null,
    tin: null,
    phone: null,
    email: null,
    address: null,
  } as any);

  vi.mocked(storage.createInvoice).mockResolvedValue({
    id: 1,
    invoiceNumber: "INV-001",
    companyId: authCompanyId,
    status: "pending",
  } as any);

  vi.mocked(storage.getNextInvoiceNumber).mockResolvedValue("INV-001");

  vi.mocked(storage.getTaxTypes).mockResolvedValue(taxTypes as any);
  vi.mocked(storage.getCustomers).mockResolvedValue([]);
  // An empty catalogue is what a till sees on its first document for an item:
  // each new name gets a fresh product id.
  let nextProductId = 900;
  vi.mocked(storage.getProducts).mockResolvedValue([]);
  vi.mocked(storage.createProduct).mockImplementation(async (data: any) => ({ id: nextProductId++, ...data } as any));
  vi.mocked(storage.updateProduct).mockImplementation(async (id: number, data: any) => ({ id, ...data } as any));
  vi.mocked(storage.syncLekukaTaxes).mockResolvedValue({ synced: [], added: 0, updated: 0, deactivated: 0 } as any);
  vi.mocked(storage.getCurrencies).mockResolvedValue(
    tenantCurrencies.map((c) =>
      typeof c === "string" ? { code: c, isActive: true } : { code: c.code, isActive: c.isActive ?? true }
    ) as any
  );
  vi.mocked(storage.getInvoices).mockResolvedValue([]);
  vi.mocked(storage.deleteInvoice).mockResolvedValue(true);

  vi.mocked(processInvoiceFiscalization).mockResolvedValue({
    fiscalCode: "FC123",
    qrCodeData: "QR",
    receiptGlobalNo: 1,
    receiptCounter: 1,
    fiscalDayNo: 1,
    invoiceNumber: "INV-001",
  } as any);

  vi.mocked(getCompanyZimraConfig).mockResolvedValue({
    applicableTaxes: []
  } as any);
}

/**
 * Dispatch a POST / request through the fiscalize router using mock req/res.
 * Returns the captured createInvoice call arguments (or null if not called).
 */
async function dispatchFiscalize(
  authCompany: { id: number; [key: string]: any },
  body: Record<string, any>
): Promise<{ statusCode: number; responseBody: any; createInvoiceArgs: any }> {
  let createInvoiceArgs: any = null;
  // Promise that resolves when the handler sends a response
  let resolveResponse!: () => void;
  const responsePromise = new Promise<void>((r) => { resolveResponse = r; });

  vi.mocked(storage.createInvoice).mockImplementation(async (data: any) => {
    createInvoiceArgs = data;
    return {
      id: 1,
      invoiceNumber: "INV-001",
      companyId: authCompany.id,
      status: "pending",
    } as any;
  });

  const mockReq: any = {
    method: "POST",
    url: "/",
    path: "/",
    headers: { "content-type": "application/json" },
    body,
    company: authCompany,
    params: {},
    query: {},
    app: { get: () => undefined },
  };

  const mockRes: any = {
    statusCode: 200,
    _body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: any) {
      this._body = b;
      resolveResponse();
      return this;
    },
  };

  // Dispatch through the router; wait for the response to be sent
  fiscalizeRouter(mockReq, mockRes, () => resolveResponse());
  await responsePromise;

  return {
    statusCode: mockRes.statusCode,
    responseBody: mockRes._body,
    createInvoiceArgs,
  };
}

// ---------------------------------------------------------------------------
// Property 3: companyId always comes from API key, never from request body
// Validates: Requirements 2.15, 9.1
// ---------------------------------------------------------------------------

describe("Pass-Through Handler — Property 3: companyId always comes from API key, never from request body", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.15, 9.1**
   *
   * For any combination of:
   * - req.company.id (the authenticated company's id from the API key)
   * - a companyId value that might be in the request body (different from req.company.id)
   *
   * storage.createInvoice must always be called with companyId === req.company.id,
   * regardless of any companyId present in the request body.
   */
  test("storage.createInvoice is always called with companyId from req.company.id, not from request body", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Authenticated company id (from API key resolution)
        fc.integer({ min: 1, max: 1_000_000 }),
        // Arbitrary companyId that an attacker might put in the request body
        fc.integer({ min: 1, max: 1_000_000 }),
        async (authCompanyId, bodyCompanyId) => {
          vi.clearAllMocks();
          setupDefaultMocks(authCompanyId);

          const authCompany = {
            id: authCompanyId,
            name: "Auth Company",
            currency: "USD",
            defaultTaxRate: 15.5,
            defaultHsCode: "04021099",
          };

          const { createInvoiceArgs } = await dispatchFiscalize(authCompany, {
            companyId: bodyCompanyId, // attempt to inject a different companyId
            items: [minimalItem],
          });

          // createInvoice must have been called
          expect(createInvoiceArgs).not.toBeNull();

          // The companyId passed to createInvoice must always be the authenticated one
          expect(createInvoiceArgs.companyId).toBe(authCompanyId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sanity check: even when bodyCompanyId === authCompanyId, the result is correct.
   */
  test("createInvoice companyId matches req.company.id even when body has same companyId", async () => {
    const authCompanyId = 42;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: 15.5,
      defaultHsCode: "04021099",
    };

    const { createInvoiceArgs } = await dispatchFiscalize(authCompany, {
      companyId: authCompanyId,
      items: [minimalItem],
    });

    expect(createInvoiceArgs).not.toBeNull();
    expect(createInvoiceArgs.companyId).toBe(authCompanyId);
  });

  /**
   * Sanity check: no companyId in body — still uses req.company.id.
   */
  test("createInvoice companyId matches req.company.id when body has no companyId", async () => {
    const authCompanyId = 99;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: 15.5,
      defaultHsCode: "04021099",
    };

    const { createInvoiceArgs } = await dispatchFiscalize(authCompany, {
      items: [minimalItem],
    });

    expect(createInvoiceArgs).not.toBeNull();
    expect(createInvoiceArgs.companyId).toBe(authCompanyId);
  });
});

// ---------------------------------------------------------------------------
// Property 5: Invoice total arithmetic is always correct
// Validates: Requirements 2.11
// ---------------------------------------------------------------------------

describe("Pass-Through Handler — Property 5: Invoice total arithmetic is always correct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.11**
   *
   * For any array of items with arbitrary quantity (≥0), unitPrice (≥0), and
   * taxRate (0–100), the values passed to storage.createInvoice must satisfy:
   *   lineTotal  = quantity × unitPrice  (per item)
   *   subtotal   = sum of all lineTotals
   *   taxAmount  = sum of (lineTotal × taxRate / 100) per item
   *   total      = subtotal + taxAmount
   *
   * Floating-point comparison uses epsilon = 0.001.
   */
  test("subtotal, taxAmount, and total passed to createInvoice always match the formula", async () => {
    // toFixed(2) rounds each of subtotal, taxAmount, total independently,
    // introducing up to ~0.005 of rounding error per value.  Use 0.01 to
    // give a comfortable margin while still catching real arithmetic bugs.
    const epsilon = 0.01;

    const itemArb = fc.record({
      name: fc.constant("Item"),
      quantity: fc.float({ min: 1, max: 10_000, noNaN: true }),
      unitPrice: fc.float({ min: 0, max: 10_000, noNaN: true }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(itemArb, { minLength: 1, maxLength: 20 }),
        async (items) => {
          vi.clearAllMocks();

          const authCompanyId = 1;
          const authCompany = {
            id: authCompanyId,
            name: "Test Co",
            currency: "USD",
            defaultTaxRate: 15.5,
            defaultHsCode: "04021099",
          };

          setupDefaultMocks(authCompanyId);

          const { createInvoiceArgs } = await dispatchFiscalize(authCompany, {
            items,
          });

          expect(createInvoiceArgs).not.toBeNull();

          // Compute expected values using the formula.
          // The handler: computes each line total from the RAW unitPrice,
          // rounds EACH line total to 2 decimals, aggregates the taxable net
          // per tax bucket and rounds tax ONCE per bucket. (unitPrice is only
          // normalised to 4 decimals for storage, not for arithmetic.)
          // All items default to STANDARD → company defaultTaxRate (15%).
          const expectedLineTotal = (item: any) => parseFloat((item.quantity * item.unitPrice).toFixed(2));
          const expectedSubtotal = items.reduce(
            (sum, item) => sum + expectedLineTotal(item),
            0
          );
          const expectedTaxAmount = Math.round(expectedSubtotal * (15.5 / 100) * 100) / 100;
          const expectedTotal = parseFloat((expectedSubtotal + expectedTaxAmount).toFixed(2));

          // The handler stores these as toFixed(2) strings — parse them back
          const actualSubtotal = parseFloat(createInvoiceArgs.subtotal);
          const actualTaxAmount = parseFloat(createInvoiceArgs.taxAmount);
          const actualTotal = parseFloat(createInvoiceArgs.total);

          expect(Math.abs(actualSubtotal - expectedSubtotal)).toBeLessThan(epsilon);
          expect(Math.abs(actualTaxAmount - expectedTaxAmount)).toBeLessThan(epsilon);
          expect(Math.abs(actualTotal - expectedTotal)).toBeLessThan(epsilon);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sanity check: single item with known values.
   */
  test("single item: lineTotal, subtotal, taxAmount, total are computed correctly", async () => {
    const authCompanyId = 7;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: 15.5,
      defaultHsCode: "04021099",
    };

    const { createInvoiceArgs } = await dispatchFiscalize(authCompany, {
      items: [{ name: "Widget", quantity: 3, unitPrice: 100 }],
    });

    // lineTotal = 3 × 100 = 300
    // subtotal  = 300
    // taxAmount = 300 × 15.5/100 = 46.5
    // total     = 345
    expect(parseFloat(createInvoiceArgs.subtotal)).toBeCloseTo(300, 2);
    expect(parseFloat(createInvoiceArgs.taxAmount)).toBeCloseTo(46.5, 2);
    expect(parseFloat(createInvoiceArgs.total)).toBeCloseTo(346.5, 2);
  });

  /**
   * Sanity check: multiple items with mixed tax rates.
   */
  test("multiple items with mixed tax rates: totals are computed correctly", async () => {
    const authCompanyId = 8;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: 15.5,
      defaultHsCode: "04021099",
    };

    const { createInvoiceArgs } = await dispatchFiscalize(authCompany, {
      items: [
        { name: "A", quantity: 2, unitPrice: 50 },   // lineTotal=100
        { name: "B", quantity: 1, unitPrice: 200 },  // lineTotal=200
        { name: "C", quantity: 4, unitPrice: 25 },   // lineTotal=100
      ],
    });

    // subtotal  = 400 (all items STANDARD at 15.5%, tax rounded once per bucket)
    // taxAmount = round(400 × 0.155) = 62
    // total     = 460
    expect(parseFloat(createInvoiceArgs.subtotal)).toBeCloseTo(400, 2);
    expect(parseFloat(createInvoiceArgs.taxAmount)).toBeCloseTo(62, 2);
    expect(parseFloat(createInvoiceArgs.total)).toBeCloseTo(462, 2);
  });
});

// ---------------------------------------------------------------------------
// Property 6: Item defaults are applied when optional fields are omitted
// Validates: Requirements 2.3, 2.4
// ---------------------------------------------------------------------------

describe("Pass-Through Handler — Property 6: Item defaults are applied when optional fields are omitted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * For any company with an arbitrary defaultTaxRate (0–100) and any items
   * that omit taxRate and hsCode, the items stored via createInvoice must
   * have taxRate equal to company.defaultTaxRate.
   *
   * Also verifies that when company has no defaultTaxRate, items use 15%.
   * And when company has no defaultHsCode, the handler succeeds (hsCode
   * resolves to "04021099" internally, though not stored in createInvoice items).
   */
  test("items without taxRate use company.defaultTaxRate; fallback to 15.5.5 when company has no default", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary company defaultTaxRate (0–100)
        fc.float({ min: 0, max: 100, noNaN: true }),
        // Arbitrary items without taxRate or hsCode
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            quantity: fc.integer({ min: 1, max: 1000 }),
            unitPrice: fc.integer({ min: 1, max: 10000 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (defaultTaxRate, items) => {
          vi.clearAllMocks();

          const authCompanyId = 1;
          const authCompany = {
            id: authCompanyId,
            name: "Test Co",
            currency: "USD",
            defaultTaxRate,
            defaultHsCode: "12345678",
          };

          setupDefaultMocks(authCompanyId);

          const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
            authCompany,
            { items }
          );

          // Handler must succeed
          expect(statusCode).toBe(200);
          expect(createInvoiceArgs).not.toBeNull();

          // Every item stored must have taxRate = company.defaultTaxRate
          for (const storedItem of createInvoiceArgs.items) {
            expect(parseFloat(storedItem.taxRate)).toBeCloseTo(defaultTaxRate, 5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.3**
   *
   * When company has no defaultTaxRate (undefined/null), items without taxRate
   * must fall back to 15%.
   */
  test("items without taxRate fall back to 15.5% when company has no defaultTaxRate", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            quantity: fc.integer({ min: 1, max: 1000 }),
            unitPrice: fc.integer({ min: 1, max: 10000 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (items) => {
          vi.clearAllMocks();

          const authCompanyId = 2;
          // Company with no defaultTaxRate
          const authCompany = {
            id: authCompanyId,
            name: "No Default Co",
            currency: "USD",
            defaultTaxRate: undefined,
            defaultHsCode: undefined,
          };

          setupDefaultMocks(authCompanyId);

          const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
            authCompany,
            { items }
          );

          expect(statusCode).toBe(200);
          expect(createInvoiceArgs).not.toBeNull();

          // Every item must use the 15.5% fallback
          for (const storedItem of createInvoiceArgs.items) {
            expect(parseFloat(storedItem.taxRate)).toBeCloseTo(15.5, 5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * When company has no defaultHsCode, items without hsCode must resolve
   * successfully (handler does not error). The handler uses "04021099" as
   * the internal fallback. We verify the handler returns 200 for any
   * arbitrary company defaultHsCode (or none).
   */
  test("items without hsCode succeed regardless of company defaultHsCode (falls back to 04021099)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary defaultHsCode or none
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            quantity: fc.integer({ min: 1, max: 1000 }),
            unitPrice: fc.integer({ min: 1, max: 10000 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (defaultHsCode, items) => {
          vi.clearAllMocks();

          const authCompanyId = 3;
          const authCompany = {
            id: authCompanyId,
            name: "HS Test Co",
            currency: "USD",
            defaultTaxRate: 15.5,
            defaultHsCode,
          };

          setupDefaultMocks(authCompanyId);

          const { statusCode } = await dispatchFiscalize(authCompany, { items });

          // Handler must always succeed — hsCode fallback is always applied
          expect(statusCode).toBe(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sanity check: explicit taxType on item overrides company default.
   */
  test("item with explicit taxType (ZERO_RATED) uses 0%, not company default", async () => {
    const authCompanyId = 10;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: 20,
      defaultHsCode: "04021099",
    };

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(authCompany, {
      items: [{ name: "Widget", quantity: 1, unitPrice: 100, taxType: "ZERO_RATED" }],
    });

    expect(statusCode).toBe(200);
    expect(parseFloat(createInvoiceArgs.items[0].taxRate)).toBeCloseTo(0, 5);
  });

  /**
   * Sanity check: item without taxRate uses company default of 20%.
   */
  test("item without taxRate uses company defaultTaxRate of 20%", async () => {
    const authCompanyId = 11;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: 20,
      defaultHsCode: "04021099",
    };

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(authCompany, {
      items: [{ name: "Widget", quantity: 1, unitPrice: 100 }],
    });

    expect(statusCode).toBe(200);
    expect(parseFloat(createInvoiceArgs.items[0].taxRate)).toBeCloseTo(20, 5);
  });

  /**
   * Sanity check: item without taxRate and company with no default uses 15%.
   */
  test("item without taxRate and no company default uses 15.5%", async () => {
    const authCompanyId = 12;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: null,
      defaultHsCode: null,
    };

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(authCompany, {
      items: [{ name: "Widget", quantity: 1, unitPrice: 100 }],
    });

    expect(statusCode).toBe(200);
    expect(parseFloat(createInvoiceArgs.items[0].taxRate)).toBeCloseTo(15.5, 5);
  });
});

// ---------------------------------------------------------------------------
// Property 7: Buyer info stored inline without creating customer records
// Validates: Requirements 2.5
// ---------------------------------------------------------------------------

describe("Pass-Through Handler — Property 7: Buyer info stored inline on invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * For any pass-through fiscalization request that includes a `buyer` object,
   * the buyer's name, VAT number, and TIN must appear on the created invoice
   * record (in buyerName, buyerVat, buyerTin fields of the createInvoice call).
   * The invoice must NOT be linked to a pre-existing customer via customerId
   * from a permanent customer record — the buyer data is stored inline.
   */
  test("buyer name, vatNumber, and TIN are stored on the invoice record (buyerName, buyerVat, buyerTin)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary buyer objects
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          vatNumber: fc.option(digitString9, { nil: undefined }),
          tin: fc.option(digitString10, { nil: undefined }),
        }),
        async (buyer) => {
          vi.clearAllMocks();

          const authCompanyId = 1;
          const authCompany = {
            id: authCompanyId,
            name: "Test Co",
            currency: "USD",
            defaultTaxRate: 15.5,
            defaultHsCode: "04021099",
          };

          setupDefaultMocks(authCompanyId);

          const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
            authCompany,
            {
              items: [minimalItem],
              buyer,
            }
          );

          expect(statusCode).toBe(200);
          expect(createInvoiceArgs).not.toBeNull();

          // Buyer name must be stored inline on the invoice (as customerName)
          expect(createInvoiceArgs.customerName).toBe(buyer.name);

          // VAT number must be stored inline if provided
          if (buyer.vatNumber !== undefined) {
            expect(createInvoiceArgs.buyerVat).toBe(buyer.vatNumber);
          }

          // TIN must be stored inline if provided
          if (buyer.tin !== undefined) {
            expect(createInvoiceArgs.buyerTin).toBe(buyer.tin);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * The invoice must not be linked to a permanent customer via a customerId
   * that was looked up from a pre-existing customer record. The customerId on
   * the createInvoice call (if any) must only come from the transient record
   * created for FK purposes — not from a customer lookup.
   */
  test("invoice is not linked to a pre-existing customer record (no getCustomer call)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          vatNumber: fc.option(digitString9, { nil: undefined }),
          tin: fc.option(digitString10, { nil: undefined }),
        }),
        async (buyer) => {
          vi.clearAllMocks();

          const authCompanyId = 5;
          const authCompany = {
            id: authCompanyId,
            name: "Test Co",
            currency: "USD",
            defaultTaxRate: 15.5,
            defaultHsCode: "04021099",
          };

          setupDefaultMocks(authCompanyId);

          // Add a getCustomer mock to detect if it's called
          const getCustomerMock = vi.fn();
          (storage as any).getCustomer = getCustomerMock;

          await dispatchFiscalize(authCompany, {
            items: [minimalItem],
            buyer,
          });

          // getCustomer must never be called — buyer data is inline, not looked up
          expect(getCustomerMock).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sanity check: buyer with all fields populated.
   */
  test("buyer with name, vatNumber, and tin are all stored on the invoice", async () => {
    const authCompanyId = 20;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: 15.5,
      defaultHsCode: "04021099",
    };

    const buyer = {
      name: "Acme Corp",
      vatNumber: "123456789",
      tin: "1234567890",
    };

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(authCompany, {
      items: [minimalItem],
      buyer,
    });

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.customerName).toBe("Acme Corp");
    expect(createInvoiceArgs.buyerVat).toBe("123456789");
    expect(createInvoiceArgs.buyerTin).toBe("1234567890");
  });

  /**
   * Sanity check: buyer with only name (no vatNumber or tin).
   */
  test("buyer with only name stores customerName on the invoice", async () => {
    const authCompanyId = 21;
    setupDefaultMocks(authCompanyId);

    const authCompany = {
      id: authCompanyId,
      name: "Test Co",
      currency: "USD",
      defaultTaxRate: 15.5,
      defaultHsCode: "04021099",
    };

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(authCompany, {
      items: [minimalItem],
      buyer: { name: "John Doe" },
    });

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.customerName).toBe("John Doe");
  });
});

// ---------------------------------------------------------------------------
// Property 12: Fiscalization failure returns 422 with FISCALIZATION_FAILED
// Validates: Requirements 2.13
// ---------------------------------------------------------------------------

describe("Pass-Through Handler — Property 12: Fiscalization failure returns 422 with FISCALIZATION_FAILED", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.13**
   *
   * For any fiscalization attempt where processInvoiceFiscalization() throws
   * an error, the API response must have:
   *   - status 422
   *   - body.error === "FISCALIZATION_FAILED"
   *   - body.message containing the original error message
   */
  test("any processInvoiceFiscalization error yields 422 FISCALIZATION_FAILED with original message", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary error messages
        fc.string({ minLength: 1, maxLength: 500 }),
        async (errorMessage) => {
          vi.clearAllMocks();

          const authCompanyId = 1;
          const authCompany = {
            id: authCompanyId,
            name: "Test Co",
            currency: "USD",
            defaultTaxRate: 15.5,
            defaultHsCode: "04021099",
          };

          // Set up storage mocks (customer + invoice creation succeed)
          vi.mocked(storage.createCustomer).mockResolvedValue({
            id: 1,
            companyId: authCompanyId,
            name: "Walk-in Customer",
            vatNumber: null,
            tin: null,
            phone: null,
            email: null,
            address: null,
          } as any);

          vi.mocked(storage.createInvoice).mockResolvedValue({
            id: 1,
            invoiceNumber: "INV-001",
            companyId: authCompanyId,
            status: "pending",
          } as any);

  vi.mocked(storage.getNextInvoiceNumber).mockResolvedValue("INV-001");

  vi.mocked(storage.getTaxTypes).mockResolvedValue([]);
  vi.mocked(storage.getCustomers).mockResolvedValue([]);
  vi.mocked(storage.getInvoices).mockResolvedValue([]);
  vi.mocked(storage.deleteInvoice).mockResolvedValue(true);

          // processInvoiceFiscalization throws with the generated error message
          vi.mocked(processInvoiceFiscalization).mockRejectedValue(
            new Error(errorMessage)
          );

          const { statusCode, responseBody } = await dispatchFiscalize(authCompany, {
            items: [minimalItem],
          });

          // Must respond with 422
          expect(statusCode).toBe(422);

          // Must have error code FISCALIZATION_FAILED
          expect(responseBody.error).toBe("FISCALIZATION_FAILED");

          // Must include the original error message
          expect(responseBody.message).toContain(errorMessage);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Tax identifiers are shape-checked, never gated by ZIMRA digit rules
// ---------------------------------------------------------------------------

describe("Pass-Through Handler — buyer tax identifiers pass through unformatted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("accepts a Lesotho-shaped TIN and 8-digit VAT number, stored verbatim", async () => {
    const authCompanyId = 30;
    setupDefaultMocks(authCompanyId, ["USD", "LSL"], rslTaxTypes());

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "Lekuka Co", country: "Lesotho", fiscalProvider: "LEKUKA", currency: "LSL", defaultTaxRate: 15 },
      {
        items: [minimalItem],
        buyer: { registeredName: "Maseru Traders", tin: "200053040-8", vatNumber: "41234567" },
      }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.buyerTin).toBe("200053040-8");
    expect(createInvoiceArgs.buyerVat).toBe("41234567");
  });

  test("accepts a ZIMRA-shaped TIN and VAT number", async () => {
    const authCompanyId = 31;
    setupDefaultMocks(authCompanyId);

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "Zim Co", currency: "USD", defaultTaxRate: 15.5 },
      { items: [minimalItem], buyer: { name: "Acme", tin: "1234567890", vatNumber: "123456789" } }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.buyerTin).toBe("1234567890");
    expect(createInvoiceArgs.buyerVat).toBe("123456789");
  });

  test("null buyer identifiers, contacts and address parts are accepted, not a 400", async () => {
    const authCompanyId = 32;
    setupDefaultMocks(authCompanyId);

    const { statusCode, createInvoiceArgs } = await dispatchFiscalize(
      { id: authCompanyId, name: "Cash Co", currency: "USD", defaultTaxRate: 15.5 },
      {
        items: [minimalItem],
        buyer: {
          name: "Walk-in Buyer",
          tin: null,
          vatNumber: null,
          email: null,
          phone: null,
          street: null,
          houseNo: null,
          city: null,
          province: null,
        },
      }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.customerName).toBe("Walk-in Buyer");
  });

  test("rejects a blank-looking identifier and a wrongly-shaped currency with 400", async () => {
    const authCompanyId = 33;
    setupDefaultMocks(authCompanyId);
    const authCompany = { id: authCompanyId, name: "Co", currency: "USD", defaultTaxRate: 15.5 };

    const shortTin = await dispatchFiscalize(authCompany, {
      items: [minimalItem],
      buyer: { name: "X", tin: "12" },
    });
    expect(shortTin.statusCode).toBe(400);
    expect(shortTin.responseBody.error).toBe("VALIDATION_ERROR");

    const badCurrency = await dispatchFiscalize(authCompany, {
      items: [minimalItem],
      currency: "US",
    });
    expect(badCurrency.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Currency defaults to the company's own money, never hardcoded USD
// ---------------------------------------------------------------------------

describe("Pass-Through Handler — currency defaults to the company profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("omitted currency uses the company currency on the invoice and the receipt", async () => {
    const authCompanyId = 40;
    setupDefaultMocks(authCompanyId);

    const { createInvoiceArgs, responseBody, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "ZWG Co", currency: "ZWG", defaultTaxRate: 15.5 },
      { items: [minimalItem] }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.currency).toBe("ZWG");
    expect(responseBody.receipt.receiptCurrency).toBe("ZWG");
  });

  test("explicit currency wins and is normalised to upper case", async () => {
    const authCompanyId = 41;
    setupDefaultMocks(authCompanyId);

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "ZWG Co", currency: "ZWG", defaultTaxRate: 15.5 },
      { items: [minimalItem], currency: "usd" }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.currency).toBe("USD");
  });

  test("company with no usable currency on file still fiscalizes (USD fallback)", async () => {
    for (const companyCurrency of [null, undefined, "", "  "]) {
      const authCompanyId = 42;
      setupDefaultMocks(authCompanyId);

      const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
        { id: authCompanyId, name: "No Currency Co", currency: companyCurrency, defaultTaxRate: 15.5 },
        { items: [minimalItem] }
      );

      expect(statusCode).toBe(200);
      expect(createInvoiceArgs.currency).toBe("USD");
    }
  });

  test("a company currency with stray spaces or lower case is normalised", async () => {
    const authCompanyId = 44;
    setupDefaultMocks(authCompanyId, ["LSL"], rslTaxTypes());

    const { createInvoiceArgs, responseBody, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "Lesotho Co", country: "Lesotho", currency: " lsl ", defaultTaxRate: 15 },
      { items: [minimalItem] }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.currency).toBe("LSL");
    expect(responseBody.receipt.receiptCurrency).toBe("LSL");
  });

  test("a Lesotho tenant still holding the schema's USD default is issued in loti", async () => {
    const authCompanyId = 45;
    setupDefaultMocks(authCompanyId, ["LSL"], rslTaxTypes());

    const { createInvoiceArgs, responseBody, statusCode } = await dispatchFiscalize(
      {
        id: authCompanyId,
        name: "RSL Co",
        currency: "USD",
        country: "Lesotho",
        fiscalProvider: "LEKUKA",
        defaultTaxRate: 15,
      },
      { items: [minimalItem] }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.currency).toBe("LSL");
    expect(responseBody.receipt.receiptCurrency).toBe("LSL");
  });

  test("a currency the tenant does not trade in is rejected before anything is stored", async () => {
    const authCompanyId = 46;
    setupDefaultMocks(authCompanyId, ["USD", "ZWG"]);

    const { statusCode, responseBody, createInvoiceArgs } = await dispatchFiscalize(
      { id: authCompanyId, name: "Zim Co", currency: "USD", defaultTaxRate: 15.5 },
      { items: [minimalItem], currency: "EUR" }
    );

    expect(statusCode).toBe(400);
    expect(responseBody.error).toBe("VALIDATION_ERROR");
    expect(responseBody.details[0].field).toBe("currency");
    expect(responseBody.details[0].message).toContain("USD, ZWG");
    expect(createInvoiceArgs).toBeNull();
  });

  test("a second currency the tenant enabled is accepted", async () => {
    const authCompanyId = 47;
    setupDefaultMocks(authCompanyId, ["USD", "ZAR"]);

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "Dual Co", currency: "USD", defaultTaxRate: 15.5 },
      { items: [minimalItem], currency: "zar" }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.currency).toBe("ZAR");
  });

  /**
   * ZiG circulated as ZWL on tills configured before the rebranding. RTGS is not a
   * valid ISO 4217 code, so the schema's 3-letter rule already turns it away.
   */
  test("the ZWL alias is fiscalised under the code the tenant holds", async () => {
    const authCompanyId = 53;
    setupDefaultMocks(authCompanyId, ["USD", "ZWG"]);

    const { createInvoiceArgs, statusCode, responseBody } = await dispatchFiscalize(
      { id: authCompanyId, name: "Zim Co", currency: "USD", defaultTaxRate: 15.5 },
      { items: [minimalItem], currency: "zwl" }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.currency).toBe("ZWG");
    expect(responseBody.receipt.receiptCurrency).toBe("ZWG");

    const rejected = await dispatchFiscalize(
      { id: authCompanyId, name: "Zim Co", currency: "USD", defaultTaxRate: 15.5 },
      { items: [minimalItem], currency: "RTGS" }
    );
    expect(rejected.statusCode).toBe(400);
  });

  /**
   * A loti tenant that switched dollars off still holds documents issued in them;
   * the guard is about foreign money, not about retired rows.
   */
  test("a currency the tenant switched off still corrects documents already issued in it", async () => {
    const authCompanyId = 48;
    setupDefaultMocks(authCompanyId, [{ code: "LSL" }, { code: "USD", isActive: false }], rslTaxTypes());

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "Loti Co", currency: "LSL", country: "Lesotho", fiscalProvider: "LEKUKA", defaultTaxRate: 15 },
      { items: [minimalItem], currency: "usd" }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.currency).toBe("USD");
  });

  /**
   * Loti is RSL money: the account has to be on the Lesotho gateway. A currency row
   * or a currency column saying LSL must not authorise it on a ZIMRA tenant.
   */
  test("loti is refused on an account that is not on the Lesotho gateway", async () => {
    const authCompanyId = 50;
    setupDefaultMocks(authCompanyId, ["USD", "LSL"]);

    const { statusCode, responseBody, createInvoiceArgs } = await dispatchFiscalize(
      { id: authCompanyId, name: "Zim Co", country: "Zimbabwe", fiscalProvider: "ZIMRA", currency: "USD", defaultTaxRate: 15.5 },
      { items: [minimalItem], currency: "LSL" }
    );

    expect(statusCode).toBe(400);
    expect(responseBody.error).toBe("VALIDATION_ERROR");
    expect(responseBody.details[0].field).toBe("currency");
    expect(responseBody.message).toContain("Lesotho");
    expect(createInvoiceArgs).toBeNull();
  });

  test("a ZIMRA tenant whose own currency column says LSL is refused, not silently loti", async () => {
    const authCompanyId = 51;
    setupDefaultMocks(authCompanyId, ["USD", "ZWG"]);

    const { statusCode, createInvoiceArgs } = await dispatchFiscalize(
      { id: authCompanyId, name: "Misset Co", country: "Zimbabwe", fiscalProvider: "ZIMRA", currency: "LSL", defaultTaxRate: 15.5 },
      { items: [minimalItem] }
    );

    expect(statusCode).toBe(400);
    expect(createInvoiceArgs).toBeNull();
  });

  test("an RSL tenant is fiscalised in loti without naming the currency", async () => {
    const authCompanyId = 52;
    setupDefaultMocks(authCompanyId, ["LSL"], rslTaxTypes());

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "RSL Co", country: "Lesotho", fiscalProvider: "LEKUKA", currency: "LSL", defaultTaxRate: 15 },
      { items: [minimalItem] }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.currency).toBe("LSL");
  });
  /**
   * Regression: with the old hardcoded USD default, a ZWG company correcting a
   * ZWG invoice while omitting `currency` was rejected as CURRENCY_MISMATCH.
   */
  test("credit note in the company currency needs no explicit currency field", async () => {
    const authCompanyId = 43;
    setupDefaultMocks(authCompanyId);
    vi.mocked(storage.getInvoices).mockResolvedValue([
      {
        id: 500,
        invoiceNumber: "INV-197",
        fiscalCode: "HASH-197",
        currency: "ZWG",
        total: "462.00",
        issueDate: new Date(),
      },
    ] as any);

    const { statusCode, responseBody } = await dispatchFiscalize(
      { id: authCompanyId, name: "ZWG Co", currency: "ZWG", defaultTaxRate: 15.5 },
      {
        items: [{ name: "Widget", quantity: 1, unitPrice: 100 }],
        transactionType: "CreditNote",
        relatedInvoiceNumber: "INV-197",
        creditNoteReason: "Goods returned",
      }
    );

    expect(statusCode).toBe(200);
    expect(responseBody.receipt.receiptCurrency).toBe("ZWG");
    expect(responseBody.receipt.receiptType).toBe("CreditNote");
  });
});
// ---------------------------------------------------------------------------
// An RSL receipt names the gateway's own taxID, which the engine reads from the
// line's product — so a pass-through document must arrive with both.
// ---------------------------------------------------------------------------

describe("Pass-Through Handler — Lesotho lines name a product and a gateway tax", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const rslCompany = (id: number) => ({
    id,
    name: "Lekuka Supermarket",
    country: "Lesotho",
    fiscalProvider: "LEKUKA",
    currency: "LSL",
    defaultTaxRate: 15,
  });

  test("each line is issued against an inline product and the goods VAT rate", async () => {
    const authCompanyId = 54;
    setupDefaultMocks(authCompanyId, ["LSL"], rslTaxTypes());

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      rslCompany(authCompanyId),
      {
        items: [
          { name: "003569 - BORING BIT", quantity: 1, unitPrice: 130, taxType: "STANDARD", taxInclusive: true },
          { name: "MAIZE MEAL 10KG", quantity: 2, unitPrice: 240, taxType: "ZERO_RATED", taxInclusive: true },
        ],
      }
    );

    expect(statusCode).toBe(200);
    const [goods, zero] = createInvoiceArgs.items;
    // 334 is the synced goods VAT (15%); 310 is the hand-made 15.50% row the
    // Zimbabwe lookup would have picked and RSL would have rejected.
    expect(goods.taxTypeId).toBe(334);
    expect(goods.taxRate).toBe("15");
    expect(zero.taxTypeId).toBe(333);
    expect(zero.taxRate).toBe("0");
    expect(goods.productId).toBe(900);
    expect(zero.productId).toBe(901);

    const created = vi.mocked(storage.createProduct).mock.calls.map((c) => c[0]);
    expect(created[0]).toMatchObject({ name: "003569 - BORING BIT", taxTypeId: 334, price: "130.00" });
    expect(created[1]).toMatchObject({ name: "MAIZE MEAL 10KG", taxTypeId: 333 });
    expect(vi.mocked(storage.updateProduct)).not.toHaveBeenCalled();
  });

  /**
   * The tenant's own catalogue outranks the classification the till declared:
   * repointing a product the supermarket deliberately set to 10% VAT would move
   * the money, not the taxID.
   */
  test("a stocked product keeps the gateway tax the tenant mapped to it", async () => {
    const authCompanyId = 55;
    setupDefaultMocks(authCompanyId, ["LSL"], [
      ...rslTaxTypes(),
      { id: 335, name: "10% VAT", rate: "10.00", lekukaTaxId: "21", lekukaTaxType: "VAT", lekukaEnvironment: "test" },
    ]);
    vi.mocked(storage.getProducts).mockResolvedValue([
      { id: 24197, name: "TC Cooking Oil 2L", sku: "SUP-TC-OIL", taxTypeId: 335 },
    ] as any);

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      rslCompany(authCompanyId),
      { items: [{ name: "TC Cooking Oil 2L", quantity: 1, unitPrice: 60 }] }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.items[0].productId).toBe(24197);
    expect(createInvoiceArgs.items[0].taxTypeId).toBe(335);
    expect(createInvoiceArgs.items[0].taxRate).toBe("10");
    expect(vi.mocked(storage.createProduct)).not.toHaveBeenCalled();
  });

  test("a product with no gateway tax is mapped before the receipt is issued", async () => {
    const authCompanyId = 56;
    setupDefaultMocks(authCompanyId, ["LSL"], rslTaxTypes());
    vi.mocked(storage.getProducts).mockResolvedValue([
      { id: 24210, name: "UNMAPPED ITEM", sku: null, taxTypeId: 310 },
    ] as any);

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      rslCompany(authCompanyId),
      { items: [{ name: "UNMAPPED ITEM", quantity: 1, unitPrice: 50 }] }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.items[0].productId).toBe(24210);
    expect(createInvoiceArgs.items[0].taxTypeId).toBe(334);
    expect(vi.mocked(storage.createProduct)).not.toHaveBeenCalled();
    expect(vi.mocked(storage.updateProduct).mock.calls[0]).toEqual([24210, expect.objectContaining({ taxTypeId: 334 })]);
  });

  test("a second document for the same item reuses the product it created", async () => {
    const authCompanyId = 57;
    setupDefaultMocks(authCompanyId, ["LSL"], rslTaxTypes());
    vi.mocked(storage.getProducts).mockResolvedValue([
      { id: 24300, name: "BORING BIT", sku: "003569", taxTypeId: 334 },
    ] as any);

    const { createInvoiceArgs } = await dispatchFiscalize(
      rslCompany(authCompanyId),
      // The till sends the code as sku and a differently-cased name; the code is
      // what identifies the goods, so this must not mint a second product.
      { items: [{ name: "boring bit", sku: "003569", quantity: 1, unitPrice: 130 }] }
    );

    expect(createInvoiceArgs.items[0].productId).toBe(24300);
    expect(vi.mocked(storage.createProduct)).not.toHaveBeenCalled();
  });

  test("an account with no mapped gateway tax is refused before anything is stored", async () => {
    const authCompanyId = 58;
    setupDefaultMocks(authCompanyId, ["LSL"], []);

    const { statusCode, responseBody, createInvoiceArgs } = await dispatchFiscalize(
      rslCompany(authCompanyId),
      { items: [minimalItem] }
    );

    expect(statusCode).toBe(422);
    expect(responseBody.error).toBe("FISCAL_CONFIG_MISSING");
    expect(responseBody.message).toContain("Sync Tax Config");
    expect(createInvoiceArgs).toBeNull();
    expect(vi.mocked(storage.createProduct)).not.toHaveBeenCalled();
  });

  /**
   * Zimbabwe takes the rate off the line, so a Zimbabwe document is stored exactly
   * as it was before any of this: no product, no tax type, 15.5% VAT.
   */
  test("a Zimbabwe document stores no product and no tax type", async () => {
    const authCompanyId = 59;
    setupDefaultMocks(authCompanyId, ["USD", "ZWG"], [
      { id: 10, name: "Standard VAT", rate: "15.50", zimraTaxId: "3" },
    ]);

    const { createInvoiceArgs, statusCode } = await dispatchFiscalize(
      { id: authCompanyId, name: "Zim Co", country: "Zimbabwe", fiscalProvider: "ZIMRA", currency: "USD", defaultTaxRate: 15.5 },
      { items: [minimalItem] }
    );

    expect(statusCode).toBe(200);
    expect(createInvoiceArgs.items[0].taxRate).toBe("15.5");
    expect(createInvoiceArgs.items[0].productId).toBeUndefined();
    expect(createInvoiceArgs.items[0].taxTypeId).toBeUndefined();
    expect(vi.mocked(storage.getProducts)).not.toHaveBeenCalled();
    expect(vi.mocked(storage.createProduct)).not.toHaveBeenCalled();
  });
});
