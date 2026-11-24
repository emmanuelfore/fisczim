/**
 * Focused tests for the single authoritative invoice gate shared by
 * `POST /api/v1/invoices` and `POST /api/v1/fiscalize`.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

const { mockDbChain } = vi.hoisted(() => {
  const mockDbChain = {
    _result: [] as any[],
    select() { return this; },
    from() { return this; },
    where() { return this; },
    orderBy() { return this; },
    insert() { return this; },
    values() { return this; },
    returning() { return Promise.resolve([{ id: 1 }]); },
    update() { return this; },
    set() { return this; },
    then(resolve: (value: any[]) => any) {
      return Promise.resolve(this._result).then(resolve);
    },
  };
  return { mockDbChain };
});

vi.mock("../../../db.js", () => ({ db: mockDbChain }));

vi.mock("../../../storage.js", () => ({
  storage: {
    createInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    createAuditLog: vi.fn(async () => ({})),
  },
}));

vi.mock("../../../lib/approval-gate.js", () => ({
  requireApprovalOrContinue: vi.fn(),
}));

vi.mock("../../../lib/departmental.js", () => ({
  resolveInvoiceAnalytics: vi.fn(),
}));

vi.mock("../../../lib/fiscalization.js", () => ({
  processInvoiceFiscalization: vi.fn(),
}));

import { storage } from "../../../storage.js";
import { requireApprovalOrContinue } from "../../../lib/approval-gate.js";
import { resolveInvoiceAnalytics } from "../../../lib/departmental.js";
import { processInvoiceFiscalization } from "../../../lib/fiscalization.js";
import {
  assertDeclaredTotals,
  assertEditableDraft,
  createAuthoritativeInvoice,
  fiscalizeIssuedInvoice,
  type InvoiceContext,
} from "../invoice-authority.js";

function context(overrides: Partial<InvoiceContext["principal"]> = {}): InvoiceContext {
  return {
    companyId: 1,
    company: { id: 1 },
    principal: {
      userId: "11111111-1111-4111-8111-111111111111",
      isSuperAdmin: false,
      isApiKey: false,
      ...overrides,
    },
  };
}

function input() {
  return {
    invoiceNumber: "INV-1",
    customerId: null,
    issueDate: new Date(),
    dueDate: new Date(),
    currency: "USD",
    taxInclusive: false,
    paymentMethod: "CASH",
    transactionType: "FiscalInvoice",
    subtotal: 100,
    taxAmount: 15,
    total: 115,
    discountAmount: 0,
    items: [
      {
        description: "Item",
        quantity: "1",
        unitPrice: "100",
        taxRate: "15",
        lineTotal: "100",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbChain._result = [];
  vi.mocked(requireApprovalOrContinue).mockResolvedValue({ requiresApproval: false, request: null } as any);
  vi.mocked(resolveInvoiceAnalytics).mockResolvedValue(null as any);
  vi.mocked(storage.createInvoice).mockResolvedValue({
    id: 1,
    invoiceNumber: "INV-1",
    total: "115.00",
  } as any);
  vi.mocked(storage.updateInvoice).mockResolvedValue({} as any);
  vi.mocked(processInvoiceFiscalization).mockResolvedValue({ fiscalCode: "FC123" } as any);
});

describe("authoritative create gate", () => {
  test("rejects client totals that disagree with server arithmetic", () => {
    expect(() =>
      assertDeclaredTotals({ subtotal: 1, taxAmount: 2, total: 999 }, { subtotal: 100, taxAmount: 15, total: 115 })
    ).toThrow(expect.objectContaining({ code: "AMOUNT_MISMATCH", statusCode: 422 }));
  });

  test("an approval submission creates no invoice", async () => {
    vi.mocked(requireApprovalOrContinue).mockResolvedValue({
      requiresApproval: true,
      request: { id: "approval-1" },
    } as any);

    const result = await createAuthoritativeInvoice(context(), input());

    expect(result.kind).toBe("approval");
    expect(storage.createInvoice).not.toHaveBeenCalled();
    expect(requireApprovalOrContinue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invoice_issue", companyId: 1 }),
    );
  });

  test("a second active invoice for the same sales order is refused with 409", async () => {
    mockDbChain._result = [{ id: 9, invoiceNumber: "INV-9", status: "issued" }];

    await expect(
      createAuthoritativeInvoice(context(), { ...input(), salesOrderId: 42 })
    ).rejects.toMatchObject({ code: "DUPLICATE_SALES_ORDER_INVOICE", statusCode: 409 });

    expect(storage.createInvoice).not.toHaveBeenCalled();
  });

  test("resolved department and cost centre are written to the invoice", async () => {
    vi.mocked(resolveInvoiceAnalytics).mockResolvedValue({ departmentId: 7, costCenterId: 9 } as any);

    await createAuthoritativeInvoice(context(), input());

    expect(storage.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        status: "issued",
        departmentId: 7,
        costCenterId: 9,
      }),
    );
  });

  test("an API key without a user principal fails closed instead of bypassing approval", async () => {
    await expect(
      createAuthoritativeInvoice(context({ userId: null, isApiKey: true }), input())
    ).rejects.toMatchObject({ code: "APPROVAL_PRINCIPAL_REQUIRED", statusCode: 403 });

    expect(storage.createInvoice).not.toHaveBeenCalled();
  });
});

describe("draft-only mutation guard", () => {
  test("refuses issued and fiscalized invoices", async () => {
    await expect(
      assertEditableDraft(1, { id: 1, status: "issued" })
    ).rejects.toMatchObject({ code: "INVOICE_NOT_EDITABLE", statusCode: 422 });

    await expect(
      assertEditableDraft(1, { id: 1, status: "draft", fiscalCode: "FC1" })
    ).rejects.toMatchObject({ code: "INVOICE_ALREADY_FISCALIZED", statusCode: 422 });
  });

  test("refuses a draft that already has a posted journal or payment", async () => {
    mockDbChain._result = [{ id: 5 }];

    await expect(
      assertEditableDraft(1, { id: 1, status: "draft" })
    ).rejects.toMatchObject({ code: "INVOICE_HAS_POSTINGS", statusCode: 409 });
  });
});

describe("retryable fiscalization", () => {
  test("a device failure leaves durable state and never deletes the invoice", async () => {
    vi.mocked(processInvoiceFiscalization).mockRejectedValue(new Error("ZIMRA device offline"));

    const outcome = await fiscalizeIssuedInvoice(context(), 1);

    expect(outcome).toMatchObject({ status: "retry_pending" });
    expect((outcome as any).error).toContain("ZIMRA device offline");
    expect(storage.deleteInvoice).not.toHaveBeenCalled();
    expect(storage.updateInvoice).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ fdmsStatus: "Pending" }),
    );
  });
});
