/**
 * Tenant and approval controls for the customer-flow router.
 *
 * The router is mounted at both /api and /api/customer-flow, and most of its
 * routes address records by a global id. These tests exercise the real router
 * (with a stubbed db/storage) through both mounts and assert that ownership is
 * resolved from the authenticated user, that id filters also carry company_id,
 * and that fulfilment/approval writes are refused where they must be.
 */
import express from "express";
import { createServer } from "http";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  memberships: [] as any[],
  companies: new Map<number, any>(),
  user: { id: "u1", isSuperAdmin: false } as any,
  apiKeyCompanyId: undefined as number | undefined,
  canApprove: true,
  quoteQueue: [] as any[],
  orderQueue: [] as any[],
  orderListQueue: [] as any[][],
  selectQueue: [] as any[][],
  selectChains: [] as any[],
  reads: [] as any[],
  writes: [] as any[],
}));

const dialect = new PgDialect();
const render = (condition: any): string => condition ? dialect.sqlToQuery(condition).sql : "";

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
      conditions: [] as any[],
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: (condition: any) => {
        chain.conditions.push(condition);
        state.reads.push(condition);
        return chain;
      },
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (ok: any, err?: any) => Promise.resolve(state.selectQueue.shift() ?? []).then(ok, err),
      catch: (err: any) => Promise.resolve(state.selectQueue.shift() ?? []).catch(err),
    };
    state.selectChains.push(chain);
    return chain;
  }

  function updateChain(conditionReceiver: (condition: any) => void) {
    return {
      set: (values: any) => {
        const chain: any = {
          where: (condition: any) => {
            conditionReceiver(condition);
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
        return { returning: () => thenableOf([{ id: 1, companyId: values.companyId }]) };
      },
    };
  }

  const query = {
    quotations: {
      findFirst: vi.fn(async ({ where }: any = {}) => {
        state.reads.push(where);
        return state.quoteQueue.shift() ?? undefined;
      }),
    },
    salesOrders: {
      findFirst: vi.fn(async ({ where }: any = {}) => {
        state.reads.push(where);
        return state.orderQueue.shift() ?? undefined;
      }),
      findMany: vi.fn(async ({ where }: any = {}) => {
        state.reads.push(where);
        return state.orderListQueue.shift() ?? [];
      }),
    },
    products: { findFirst: vi.fn(async () => undefined) },
    customers: { findFirst: vi.fn(async () => undefined) },
    customerProducts: { findFirst: vi.fn(async () => undefined), findMany: vi.fn(async () => []) },
    salesOrderSettings: { findFirst: vi.fn(async () => undefined) },
    layBySchedules: { findFirst: vi.fn(async () => undefined) },
    stockReservations: { findMany: vi.fn(async () => []) },
    compoundProducts: { findFirst: vi.fn(async () => undefined), findMany: vi.fn(async () => []) },
  };

  const makeDb = () => ({
    query,
    select: vi.fn(() => selectChain()),
    update: vi.fn(() => updateChain(() => {})),
    insert: vi.fn(() => insertChain()),
    delete: vi.fn(() => updateChain(() => {})),
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (fn: any) => fn(makeDb())),
  });

  return { db: makeDb() };
});

vi.mock("../storage.js", () => ({
  storage: {
    getCompanies: vi.fn(async () => state.memberships),
    getCompany: vi.fn(async (id: number) => state.companies.get(id) ?? { id, name: `co-${id}`, cfg1: true }),
    getCompanyMembership: vi.fn(async () => undefined),
    getApprovalRequests: vi.fn(async () => []),
    getUser: vi.fn(async (id: string) => ({ id })),
    getSystemAccountCode: vi.fn(async () => "CODE"),
    postToLedger: vi.fn(async () => {}),
  },
}));

vi.mock("../lib/permissions.js", () => ({
  userHasPermission: vi.fn(async () => state.canApprove),
}));

vi.mock("../lib/approval-policies.js", () => ({
  assertCanApproveType: vi.fn(async () => {
    if (!state.canApprove) throw new Error("You do not have permission to approve this request");
  }),
}));

vi.mock("../lib/approval-gate.js", () => ({
  requireApprovalOrContinue: vi.fn(async () => ({ requiresApproval: false, request: null })),
}));

const { createCustomerFlowRouter, resolveCustomerFlowCompany, isBlockedForFulfilment, isApprovedQuotationStatus } =
  await import("../routes/customer-flow.js");

let app: express.Express;

beforeEach(() => {
  state.memberships = [{ id: 21, role: "member" }];
  state.companies = new Map([[21, { id: 21, name: "co-21", cfg1: true }]]);
  state.user = { id: "u1", isSuperAdmin: false };
  state.apiKeyCompanyId = undefined;
  state.canApprove = true;
  state.quoteQueue = [];
  state.orderQueue = [];
  state.orderListQueue = [];
  state.selectQueue = [];
  state.selectChains = [];
  state.reads = [];
  state.writes = [];

  app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => true;
    req.user = state.user;
    req.apiKeyCompanyId = state.apiKeyCompanyId;
    next();
  });
  const requireAuth = (req: any, res: any, next: any) => (req.isAuthenticated() ? next() : res.status(401).end());
  const router = createCustomerFlowRouter(requireAuth);
  // The same router instance is deliberately mounted twice, as in routes.ts.
  app.use("/api", router);
  app.use("/api/customer-flow", router);
});

async function request(method: string, path: string, body?: any) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const port = (server.address() as any).port;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const reqFor = (over: any = {}) => ({
  user: state.user,
  apiKeyCompanyId: state.apiKeyCompanyId,
  params: {},
  query: {},
  body: {},
  headers: {},
  ...over,
});

describe("company resolution", () => {
  test("an explicitly named company is used only when the user belongs to it", async () => {
    expect(await resolveCustomerFlowCompany(reqFor({ query: { companyId: "21" } }))).toBe(21);
    expect(await resolveCustomerFlowCompany(reqFor({ body: { companyId: "91" } }))).toBeUndefined();
    expect(await resolveCustomerFlowCompany(reqFor({ headers: { "x-company-id": "91" } }))).toBeUndefined();
    expect(await resolveCustomerFlowCompany(reqFor({ query: { companyId: "abc" } }))).toBeUndefined();
    expect(await resolveCustomerFlowCompany(reqFor({ query: { companyId: [] } }))).toBeUndefined();
  });

  test("a single membership is inferred, multiple memberships are not guessed", async () => {
    expect(await resolveCustomerFlowCompany(reqFor())).toBe(21);
    state.memberships = [{ id: 21 }, { id: 91 }];
    expect(await resolveCustomerFlowCompany(reqFor())).toBeUndefined();
    expect(await resolveCustomerFlowCompany(reqFor({ query: { companyId: "91" } }))).toBe(91);
  });

  test("an API key cannot be redirected to another tenant", async () => {
    state.apiKeyCompanyId = 21;
    expect(await resolveCustomerFlowCompany(reqFor({ query: { companyId: "91" } }))).toBeUndefined();
    expect(await resolveCustomerFlowCompany(reqFor())).toBe(21);
  });
});

describe("quotation conversion", () => {
  const approvedQuote = {
    id: 5,
    companyId: 21,
    customerId: 3,
    subtotal: "10.00",
    taxAmount: "0.00",
    total: "10.00",
    status: "approved",
    items: [{ id: 7, productId: 9, description: "x", quantity: "1", unitPrice: "10", taxRate: "0", lineTotal: "10" }],
  };

  test("a draft-like quotation cannot be converted on either mount", async () => {
    for (const prefix of ["/api", "/api/customer-flow"]) {
      state.quoteQueue = [{ ...approvedQuote, status: "draft" }];
      const result = await request("POST", `${prefix}/sales-orders/from-quotation`, { quotationId: 5 });
      expect(result.status).toBe(400);
    }
    expect(state.writes).toHaveLength(0);
  });

  test("a foreign quotation id is not found and the quote lookup is company-scoped", async () => {
    const result = await request("POST", "/api/sales-orders/from-quotation", { quotationId: 5, companyId: 91 });
    expect(result.status).toBe(403);
    expect(state.reads).toHaveLength(0);

    state.quoteQueue = [undefined];
    await request("POST", "/api/sales-orders/from-quotation", { quotationId: 5 });
    expect(state.reads).toHaveLength(1);
    const sql = render(state.reads[0]);
    expect(sql).toContain('"quotations"."id"');
    expect(sql).toContain('"quotations"."company_id"');
  });

  test("an approved quotation converts using the verified company", async () => {
    state.quoteQueue = [approvedQuote];
    const result = await request("POST", "/api/customer-flow/sales-orders/from-quotation", { quotationId: 5 });
    expect(result.status).toBe(201);
    expect(state.writes.some((w) => w.kind === "insert" && w.values.companyId === 21)).toBe(true);
    const quoteUpdate = state.writes.find((w) => w.kind === "update" && render(w.condition).includes('"quotations"'));
    expect(quoteUpdate).toBeTruthy();
    expect(render(quoteUpdate.condition)).toContain('"quotations"."company_id"');
  });
});

describe("fulfilment approval gate", () => {
  test("pending and rejected orders cannot be picked, confirmed, dispatched or invoiced", async () => {
    for (const approvalStatus of ["pending", "rejected"]) {
      for (const [method, path, body] of [
        ["POST", "/api/sales-orders/1/pick-list", {}],
        ["POST", "/api/sales-orders/1/pick-list/confirm", {}],
        ["POST", "/api/sales-orders/1/dispatch", {}],
        ["POST", "/api/invoices/from-sales-order", { salesOrderId: 1 }],
      ] as const) {
        state.orderQueue = [{ id: 1, companyId: 21, approvalStatus, status: "confirmed", items: [] }];
        const result = await request(method, path, body);
        expect(result.status, `${method} ${path} ${approvalStatus}`).toBe(403);
        expect(state.writes).toHaveLength(0);
      }
    }
  });

  test("legacy and approved orders are not blocked", () => {
    expect(isBlockedForFulfilment({ approvalStatus: undefined })).toBe(false);
    expect(isBlockedForFulfilment({ approvalStatus: "none" })).toBe(false);
    expect(isBlockedForFulfilment({ approvalStatus: "approved" })).toBe(false);
    expect(isApprovedQuotationStatus("approved")).toBe(true);
    expect(isApprovedQuotationStatus("accepted")).toBe(true);
    expect(isApprovedQuotationStatus("draft")).toBe(false);
  });

  test("pick list writes are constrained through their company-owned parent", async () => {
    const order = { id: 1, companyId: 21, locationId: 8, approvalStatus: "approved", status: "confirmed", items: [{
      id: 2, productId: 9, description: "x", quantity: "2", invoicedQuantity: "0", pickedQuantity: "0",
    }] };
    const pickList = { id: 3, salesOrderId: 1, locationId: 8, status: "DRAFT" };
    // loadPickList is called both before and after the update.
    state.orderQueue = [order, { ...order }];
    state.selectQueue = [
      [], [pickList], [{ id: 4, salesOrderItemId: 2, pickedQuantity: "0" }], [], [],
      [], [{ ...pickList }], [{ id: 4, salesOrderItemId: 2, pickedQuantity: "1" }], [], [],
    ];
    const result = await request("POST", "/api/sales-orders/1/pick-list", { items: [{ salesOrderItemId: 2, quantity: 1 }] });
    expect(result.status).toBe(200);
    const itemUpdate = state.writes.find((w) => render(w.condition).includes('"sales_pick_list_items"'));
    expect(itemUpdate).toBeTruthy();
    // The id equality alone is not enough; the update must also carry a scoped
    // subquery as the `in (...)` value.
    expect(render(itemUpdate.condition)).toContain('"sales_pick_list_items"."pick_list_id" in');

    const params: any[] = [];
    const collect = (node: any, depth = 0) => {
      if (!node || depth > 6) return;
      if (node.constructor?.name === "Param") params.push(node);
      const chunks = node.queryChunks ?? node.getSQL?.().queryChunks ?? [];
      for (const chunk of Array.isArray(chunks) ? chunks : []) collect(chunk, depth + 1);
    };
    collect(itemUpdate.condition);
    const subquery = params.find((p) => p.value && typeof p.value.where === "function")?.value;
    expect(subquery).toBeTruthy();
    expect(subquery.conditions.some((condition: any) => render(condition).includes('"sales_pick_lists"."company_id"'))).toBe(true);
  });
});

describe("sales order reads, patches and approvals", () => {
  test("an arbitrary companyId is refused on the list endpoint", async () => {
    for (const prefix of ["/api", "/api/customer-flow"]) {
      const forbidden = await request("GET", `${prefix}/sales-orders?companyId=91`);
      expect(forbidden.status).toBe(403);
      expect(state.reads).toHaveLength(0);
    }

    const allowed = await request("GET", "/api/sales-orders?companyId=21");
    expect(allowed.status).toBe(200);
    expect(state.reads).toHaveLength(1);
    expect(render(state.reads[0])).toContain('"sales_orders"."company_id"');
  });

  test("a patch cannot overwrite approvalStatus and is company-scoped", async () => {
    state.orderQueue = [{ id: 1, companyId: 21, status: "draft", notes: null, items: [] }];
    const result = await request("PATCH", "/api/sales-orders/1", { approvalStatus: "approved", notes: "hello" });
    expect(result.status).toBe(200);
    const update = state.writes.find((w) => w.kind === "update" && render(w.condition).includes('"sales_orders"'));
    expect(update).toBeTruthy();
    expect(update.values.approvalStatus).toBeUndefined();
    expect(render(update.condition)).toContain('"sales_orders"."company_id"');
  });

  test("approval requires permission, a different reviewer and a scoped update", async () => {
    state.canApprove = false;
    state.orderQueue = [{ id: 1, companyId: 21, approvalStatus: "pending", status: "awaiting_deposit" }];
    const forbidden = await request("POST", "/api/sales-orders/1/approve", { action: "approve" });
    expect(forbidden.status).toBe(403);
    expect(state.writes).toHaveLength(0);

    state.canApprove = true;
    state.orderQueue = [{ id: 1, companyId: 21, approvalStatus: "pending", status: "awaiting_deposit", createdBy: "u1" }];
    const selfApproval = await request("POST", "/api/sales-orders/1/approve", { action: "approve" });
    expect(selfApproval.status).toBe(403);
    expect(state.writes).toHaveLength(0);

    state.orderQueue = [{ id: 1, companyId: 21, approvalStatus: "pending", status: "awaiting_deposit", createdBy: "u2" }];
    const allowed = await request("POST", "/api/customer-flow/sales-orders/1/approve", { action: "approve" });
    expect(allowed.status).toBe(200);
    const update = state.writes.find((w) => w.kind === "update");
    expect(update.values.approvalStatus).toBe("approved");
    expect(render(update.condition)).toContain('"sales_orders"."company_id"');
  });
});
