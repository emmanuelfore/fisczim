/**
 * Focused controls for POST /api/invoices/from-sales-order.
 *
 * This route builds a customer document from a dispatched sales order, so it
 * must use the same invoice_issue gate as the direct invoice route and must
 * never post GL/stock rows while an approval is pending. The persisted sales
 * order lines are the only source of the approval amount.
 */
import express from "express";
import { createServer } from "http";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1", isSuperAdmin: false } as any,
  memberships: [] as any[],
  order: null as any,
  selectQueue: [] as any[][],
  writes: [] as any[],
  ledgerPosts: [] as any[],
  transactionCalls: 0,
  gate: { requiresApproval: false, request: null as any },
}));

function thenableOf(rows: any[]) {
  return {
    then: (ok: any, err?: any) => Promise.resolve(rows).then(ok, err),
    catch: (err: any) => Promise.resolve(rows).catch(err),
    finally: (fn: any) => Promise.resolve(rows).finally(fn),
  };
}

vi.mock("../db.js", () => {
  function selectChain() {
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: (condition: any) => { chain.condition = condition; return chain; },
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (ok: any, err?: any) => Promise.resolve(state.selectQueue.shift() ?? []).then(ok, err),
      catch: (err: any) => Promise.resolve(state.selectQueue.shift() ?? []).catch(err),
    };
    return chain;
  }

  function updateChain() {
    return {
      set: (values: any) => {
        const chain: any = {
          where: (condition: any) => {
            state.writes.push({ kind: "update", values, condition });
            return chain;
          },
          then: (ok: any, err?: any) => Promise.resolve([]).then(ok, err),
        };
        return chain;
      },
    };
  }

  function insertChain() {
    return {
      values: (values: any) => {
        state.writes.push({ kind: "insert", values });
        return {
          returning: () => thenableOf([{
            id: 101,
            invoiceNumber: "INV-TEST",
            issueDate: new Date(),
            ...values,
          }]),
        };
      },
    };
  }

  const makeDb = () => ({
    query: {
      salesOrders: {
        findFirst: vi.fn(async () => state.order),
      },
    },
    select: vi.fn(() => selectChain()),
    update: vi.fn(() => updateChain()),
    insert: vi.fn(() => insertChain()),
    execute: vi.fn(async () => {
      state.writes.push({ kind: "execute" });
      return { rows: [] };
    }),
    transaction: vi.fn(async (fn: any) => {
      state.transactionCalls += 1;
      return fn(makeDb());
    }),
  });

  return { db: makeDb() };
});

vi.mock("../storage.js", () => ({
  storage: {
    getCompanies: vi.fn(async () => state.memberships),
    getCompany: vi.fn(async (id: number) => ({ id, name: `co-${id}` })),
    getCompanyMembership: vi.fn(async () => undefined),
    getUser: vi.fn(async (id: string) => ({ id })),
    getSystemAccountCode: vi.fn(async (_companyId: number, key: string) => `CODE-${key}`),
    postToLedger: vi.fn(async (_companyId: number, entry: any) => {
      state.ledgerPosts.push(entry);
      return { id: 1 };
    }),
    createInvoice: vi.fn(async () => {
      throw new Error("createInvoice must not be called from the sales-order route");
    }),
  },
}));

vi.mock("../lib/permissions.js", () => ({
  userHasPermission: vi.fn(async () => true),
}));

vi.mock("../lib/approval-policies.js", () => ({
  assertCanApproveType: vi.fn(async () => {}),
}));

vi.mock("../lib/approval-gate.js", () => ({
  requireApprovalOrContinue: vi.fn(async () => state.gate),
}));

const { createCustomerFlowRouter } = await import("../routes/customer-flow.js");
const { requireApprovalOrContinue } = await import("../lib/approval-gate.js");
const { APPROVAL_TYPES } = await import("../../shared/permissions.js");

let app: express.Express;

const ORDER = {
  id: 1,
  companyId: 21,
  branchId: 2,
  customerId: 3,
  orderNumber: "SO-1",
  approvalStatus: "approved",
  status: "dispatched",
  departmentId: 12,
  costCenterId: 13,
  locationId: 8,
  items: [{
    id: 2,
    productId: 9,
    description: "Widget",
    quantity: "2",
    invoicedQuantity: "0",
    pickedQuantity: "2",
    unitPrice: "10.00",
    taxRate: "15",
    taxTypeId: null,
    product: { id: 9, sku: "W1", costPrice: "4.00" },
  }],
};
const PICK_LIST = { id: 3, salesOrderId: 1, locationId: 8, status: "DISPATCHED", deliveryNumber: "DN-1" };
const PICK_ITEMS = [{ id: 4, salesOrderItemId: 2, pickedQuantity: "2" }];

function queueDispatchedOrder(overrides: Partial<typeof ORDER> = {}) {
  state.order = { ...ORDER, ...overrides };
  // Route active-invoice check, then loadPickList: active invoice, pick list,
  // pick list items, stock rows, locations.
  state.selectQueue = [[], [], [PICK_LIST], [PICK_ITEMS], [], []];
}

beforeEach(() => {
  state.user = { id: "u1", isSuperAdmin: false };
  state.memberships = [{ id: 21, role: "member" }];
  state.order = null;
  state.selectQueue = [];
  state.writes = [];
  state.ledgerPosts = [];
  state.transactionCalls = 0;
  state.gate = { requiresApproval: false, request: null };
  vi.mocked(requireApprovalOrContinue).mockClear();

  app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = state.user;
    next();
  });
  const requireAuth = (req: any, res: any, next: any) => (req.user ? next() : res.status(401).end());
  app.use("/api", createCustomerFlowRouter(requireAuth));
});

async function request(body: any) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const port = (server.address() as any).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/invoices/from-sales-order`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const body = {
  salesOrderId: 1,
  itemsToInvoice: [{ salesOrderItemId: 2, quantityToInvoice: 2 }],
  // A client-supplied total must never reach the approval threshold decision.
  total: "0.01",
};

describe("invoicing from a dispatched sales order", () => {
  test("an approval-required result is 202 and performs no invoice, GL or stock write", async () => {
    state.gate = { requiresApproval: true, request: { id: 77 } };
    queueDispatchedOrder();

    const result = await request(body);
    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({
      requiresApproval: true,
      approvalId: 77,
      message: "Invoice issuance submitted for approval",
    });

    const gateInput: any = vi.mocked(requireApprovalOrContinue).mock.calls[0][0];
    expect(gateInput.type).toBe(APPROVAL_TYPES.INVOICE_ISSUE);
    // Authoritative total from persisted lines: 2 x 10.00 + 15% VAT = 23.00.
    expect(gateInput.amount).toBeCloseTo(23, 2);
    expect(gateInput.payload.invoiceData).toMatchObject({
      salesOrderId: 1,
      departmentId: 12,
      subtotal: "20.00",
      taxAmount: "3.00",
      total: "23.00",
    });
    expect(gateInput.payload.salesOrderSnapshot).toMatchObject({ id: 1, orderNumber: "SO-1" });
    expect(gateInput.payload.fulfilmentSnapshot).toMatchObject({ pickListId: 3, pickListStatus: "DISPATCHED" });

    expect(state.writes).toHaveLength(0);
    expect(state.transactionCalls).toBe(0);
    expect(state.ledgerPosts).toHaveLength(0);
  });

  test("a direct posting tags every GL line with the sales order department", async () => {
    state.gate = { requiresApproval: false, request: null };
    queueDispatchedOrder();

    const result = await request(body);
    expect(result.status).toBe(200);
    expect(state.transactionCalls).toBe(1);

    // Revenue entry (AR / sales / VAT) and COGS entry (COGS / inventory).
    expect(state.ledgerPosts).toHaveLength(2);
    for (const entry of state.ledgerPosts) {
      expect(entry.lines.length).toBeGreaterThan(0);
      for (const line of entry.lines) {
        expect(line).toMatchObject({ costCenterId: 13, departmentId: 12 });
      }
    }
    expect(state.ledgerPosts[0].lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "DEBIT", amount: 23 }),
      expect.objectContaining({ type: "CREDIT", amount: 20 }),
      expect.objectContaining({ type: "CREDIT", amount: 3 }),
    ]));
    expect(state.ledgerPosts[1].lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "DEBIT", amount: 8 }),
      expect.objectContaining({ type: "CREDIT", amount: 8 }),
    ]));
  });

  test("the fulfilment check still runs before the approval gate", async () => {
    state.gate = { requiresApproval: true, request: { id: 77 } };
    state.order = ORDER;
    // Active invoice, then loadPickList sees a non-dispatched pick list.
    state.selectQueue = [[], [], [{ ...PICK_LIST, status: "PICKED" }], [PICK_ITEMS], [], []];

    const result = await request(body);
    expect(result.status).toBe(400);
    expect(vi.mocked(requireApprovalOrContinue)).not.toHaveBeenCalled();
    expect(state.writes).toHaveLength(0);
  });
});
