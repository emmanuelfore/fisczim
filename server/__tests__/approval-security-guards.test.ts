/**
 * Write-time guards for deferred approvals.
 *
 * Approval payloads are persisted JSON and can be approved long after capture,
 * so the executor must re-prove the source document at execution time. These
 * tests drive the real executor with a table-scripted fake db; no tenant rows
 * are read or written.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  approvalRequests,
  invoices,
  purchaseOrders,
  purchaseRequisitions,
  salesOrderItems,
  salesOrders,
  salesPickListItems,
  salesPickLists,
  supplierBillMatches,
  supplierInvoices,
} from "@shared/schema";

const state = vi.hoisted(() => ({
  rows: new Map<unknown, any[]>(),
  invoiceWrites: [] as any[],
  supplierPaymentWrites: [] as any[],
}));

function rowsFor(table: unknown): any[] {
  return state.rows.get(table) ?? [];
}

function thenableOf(rows: any[]) {
  return {
    then: (ok: any, err?: any) => Promise.resolve(rows).then(ok, err),
    catch: (err: any) => Promise.resolve(rows).catch(err),
  };
}

function selectChain() {
  let table: unknown;
  const chain: any = {
    from(target: unknown) {
      table = target;
      return chain;
    },
    where() {
      return chain;
    },
    for() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    limit(max?: number) {
      const rows = rowsFor(table);
      return thenableOf(typeof max === "number" ? rows.slice(0, max) : rows);
    },
    then(ok: any, err?: any) {
      return Promise.resolve(rowsFor(table)).then(ok, err);
    },
    catch(err: any) {
      return Promise.resolve(rowsFor(table)).catch(err);
    },
  };
  return chain;
}

vi.mock("../db.js", () => ({
  db: {
    select: vi.fn(() => selectChain()),
    transaction: vi.fn(async (run: (tx: any) => Promise<unknown>) => run({ select: () => selectChain() })),
    update: vi.fn(() => ({ set: () => ({ where: () => ({ returning: () => thenableOf([]) }) }) })),
  },
}));

vi.mock("../storage.js", () => ({
  storage: {
    assertCustomerCreditWithinLimit: vi.fn(async () => {}),
    createInvoice: vi.fn(async (data: any) => {
      state.invoiceWrites.push(data);
      return { id: 99, invoiceNumber: "INV-99" };
    }),
    createSupplierPayment: vi.fn(async (data: any) => {
      state.supplierPaymentWrites.push(data);
      return { id: 55 };
    }),
  },
}));

vi.mock("../lib/departmental.js", () => ({
  requireDepartmentalDimensions: vi.fn(async () => null),
  resolveInvoiceAnalytics: vi.fn(async () => null),
}));

vi.mock("../lib/approved-invoice-fiscalization.js", () => ({
  enqueueApprovedInvoiceFiscalization: vi.fn(async () => {}),
}));

const { storage } = await import("../storage.js");
const { assertSupplierBillPayable, createInvoiceFromApproval, executeDeferredApprovalAction } =
  await import("../lib/approval-executors.js");

beforeEach(() => {
  state.rows.clear();
  state.invoiceWrites = [];
  state.supplierPaymentWrites = [];
  vi.mocked(storage.createSupplierPayment).mockReset();
  vi.mocked(storage.createSupplierPayment).mockImplementation(async (data: any) => {
    state.supplierPaymentWrites.push(data);
    return { id: 55 } as any;
  });
});

const bill = {
  id: 12,
  companyId: 21,
  invoiceNumber: "BILL-12",
  transactionType: "Invoice",
  status: "POSTED",
  paidAmount: "0.00",
  totalAmount: "100.00",
};

describe("supplier bills are re-proved before cash is released", () => {
  test("a cancelled bill cannot be paid", async () => {
    state.rows.set(supplierInvoices, [{ ...bill, status: "CANCELLED" }]);

    await expect(assertSupplierBillPayable(21, 12)).rejects.toThrow(/cancelled and cannot be paid/i);
  });

  test("a bill still awaiting invoice approval cannot be paid", async () => {
    state.rows.set(supplierInvoices, [bill]);
    state.rows.set(approvalRequests, [{ status: "pending" }]);

    await expect(assertSupplierBillPayable(21, 12)).rejects.toThrow(/not approved for payment/i);
  });

  test("a bill with a failed three-way match cannot be paid", async () => {
    state.rows.set(supplierInvoices, [bill]);
    state.rows.set(supplierBillMatches, [{ status: "QTY_MISMATCH", approvalStatus: "NOT_REQUIRED" }]);

    await expect(assertSupplierBillPayable(21, 12)).rejects.toThrow(/match and cannot be paid/i);
  });

  test("an approved, open, matched bill remains payable", async () => {
    state.rows.set(supplierInvoices, [bill]);
    state.rows.set(supplierBillMatches, [{ status: "MATCHED", approvalStatus: "NOT_REQUIRED" }]);

    await expect(assertSupplierBillPayable(21, 12)).resolves.toBeUndefined();
  });
});

describe("deferred supplier payments allocate bills exactly once", () => {
  test("allocated payments post every bill inside the payment transaction", async () => {
    state.rows.set(supplierInvoices, [{ ...bill, totalAmount: "60.00" }]);
    const writes = { allocations: [] as any[], billUpdates: [] as any[] };

    vi.mocked(storage.createSupplierPayment).mockImplementationOnce(async (data: any, options: any) => {
      state.supplierPaymentWrites.push(data);
      expect(options?.skipInvoiceUpdate).toBe(true);
      await options.onAfterInsert({
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => [{ ...bill, totalAmount: "60.00" }] }),
          }),
        }),
        insert: () => ({
          values: (value: any) => {
            writes.allocations.push(value);
            return Promise.resolve();
          },
        }),
        update: () => ({
          set: (value: any) => {
            writes.billUpdates.push(value);
            return { where: async () => {} };
          },
        }),
      }, 55);
      return { id: 55 } as any;
    });

    await executeDeferredApprovalAction("payment_execution", 21, {
      supplierPaymentData: {
        companyId: 21,
        supplierId: 4,
        supplierInvoiceId: 12,
        amount: "60.00",
        currency: "USD",
        paymentDate: new Date("2026-01-01").toISOString(),
        method: "Bank",
        reference: "PAY-1",
      },
      allocations: [{ supplierInvoiceId: 12, amount: 60 }],
    }, "approver-1");

    expect(state.supplierPaymentWrites[0].supplierInvoiceId).toBe(12);
    expect(writes.allocations).toEqual([{
      companyId: 21,
      supplierPaymentId: 55,
      supplierInvoiceId: 12,
      amount: "60.00",
    }]);
    expect(writes.billUpdates).toEqual([{ paidAmount: "60.00", status: "paid" }]);
  });
});

const invoiceData = {
  salesOrderId: 7,
  customerId: 3,
  total: "0.00",
  issueDate: new Date("2026-01-01").toISOString(),
  dueDate: new Date("2026-01-08").toISOString(),
  currency: "USD",
  transactionType: "FiscalInvoice",
};
const items = [{ salesOrderItemId: 11, quantity: 5, unitPrice: 10, taxRate: 0, lineTotal: 50 }];

function scriptDispatchedOrder(pickListStatus = "DISPATCHED", pickedQuantity = "5") {
  state.rows.set(invoices, []);
  state.rows.set(salesOrders, [{
    id: 7,
    companyId: 21,
    orderNumber: "SO-7",
    status: "confirmed",
    approvalStatus: "approved",
  }]);
  state.rows.set(salesPickLists, [{
    id: 3,
    companyId: 21,
    salesOrderId: 7,
    status: pickListStatus,
  }]);
  state.rows.set(salesPickListItems, [{
    pickListId: 3,
    salesOrderItemId: 11,
    pickedQuantity,
  }]);
  state.rows.set(salesOrderItems, [{
    id: 11,
    salesOrderId: 7,
    quantity: "10",
    invoicedQuantity: "0",
  }]);
}

const payload = () => ({
  invoiceData,
  items,
  fulfilmentSnapshot: { pickListId: 3 },
});

describe("sales-order invoices are revalidated at approval time", () => {
  test("a pick list that is no longer dispatched fails before any invoice write", async () => {
    scriptDispatchedOrder("DRAFT");

    await expect(createInvoiceFromApproval(21, payload(), "approver-1"))
      .rejects.toThrow(/not DISPATCHED/i);
    expect(state.invoiceWrites).toHaveLength(0);
  });

  test("picked quantities that no longer cover the invoice fail cleanly", async () => {
    scriptDispatchedOrder("DISPATCHED", "2");

    await expect(createInvoiceFromApproval(21, payload(), "approver-1"))
      .rejects.toThrow(/picked\/dispatched/i);
    expect(state.invoiceWrites).toHaveLength(0);
  });

  test("a still-valid fulfilment issues the persisted invoice lines", async () => {
    scriptDispatchedOrder();

    await createInvoiceFromApproval(21, payload(), "approver-1");

    expect(state.invoiceWrites).toHaveLength(1);
    expect(state.invoiceWrites[0].items).toEqual(items);
  });
});

describe("purchase requisition approval retries", () => {
  test("returns the purchase order already linked to the requisition without inserting another", async () => {
    state.rows.set(purchaseRequisitions, [{ id: 9, companyId: 21, status: "CONVERTED", purchaseOrderId: 45 }]);
    state.rows.set(purchaseOrders, [{ id: 45, companyId: 21, poNumber: "PO-45" }]);
    await expect(executeDeferredApprovalAction("purchase_order", 21, {
      requisitionId: 9,
      purchaseOrderData: { poNumber: "PO-45" },
      items: [],
    }, "reviewer")).resolves.toMatchObject({ purchaseOrderId: 45, poNumber: "PO-45" });
  });
});
