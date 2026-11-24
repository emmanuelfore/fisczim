/**
 * CRM enquiry -> quotation capture, plus the deferred approval executors.
 *
 * The real router/executor code is driven with a table-scripted fake db, so the
 * assertions cover the values actually handed to Drizzle and to the approval
 * gate — including the dimensions that must survive an approval round trip.
 */
import express from "express";
import { createServer } from "http";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  queues: new Map<string, any[][]>(),
  writes: [] as Array<{ op: string; table: string; values?: any }>,
  gatePayloads: [] as any[],
  approvalRequired: false,
  quotationData: undefined as any,
}));

function tableNameOf(table: any): string {
  return table?.[Symbol.for("drizzle:Name")] ?? String(table?.name ?? table);
}

function script(table: string, ...batches: any[][]) {
  state.queues.set(table, batches);
}

function nextBatch(table: string): any[] {
  const queue = state.queues.get(table);
  return queue?.length ? queue.shift()! : [];
}

function thenableOf(rows: any[]) {
  return {
    then: (ok: any, err?: any) => Promise.resolve(rows).then(ok, err),
    catch: (err: any) => Promise.resolve(rows).catch(err),
  };
}

function selectChain(): any {
  let table = "unknown";
  const chain: any = {
    from(target: any) { table = tableNameOf(target); return chain; },
    innerJoin() { return chain; },
    leftJoin() { return chain; },
    rightJoin() { return chain; },
    where() { return chain; },
    groupBy() { return chain; },
    orderBy() { return chain; },
    limit() { return chain; },
    offset() { return chain; },
    for() { return chain; },
    execute() { return Promise.resolve(nextBatch(table)); },
    then(ok: any, err?: any) { return Promise.resolve(nextBatch(table)).then(ok, err); },
    catch(err: any) { return Promise.resolve(nextBatch(table)).catch(err); },
  };
  return chain;
}

function writeChain(table: string, op: string): any {
  const entry: { op: string; table: string; values?: any } = { op, table };
  state.writes.push(entry);
  const chain: any = {
    set(values: any) { entry.values = values; return chain; },
    values(values: any) { entry.values = values; return chain; },
    onConflictDoNothing() { return chain; },
    onConflictDoUpdate() { return chain; },
    where() { return chain; },
    returning() { return thenableOf(nextBatch(table)); },
    then(ok: any, err?: any) { return Promise.resolve(nextBatch(table)).then(ok, err); },
    catch(err: any) { return Promise.resolve(nextBatch(table)).catch(err); },
  };
  return chain;
}

function makeFakeDb(): any {
  return {
    select: vi.fn(() => selectChain()),
    update: vi.fn((target: any) => writeChain(tableNameOf(target), "update")),
    insert: vi.fn((target: any) => writeChain(tableNameOf(target), "insert")),
    delete: vi.fn((target: any) => writeChain(tableNameOf(target), "delete")),
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (fn: any) => fn(makeFakeDb())),
    query: {},
  };
}

vi.mock("../db.js", () => ({ db: makeFakeDb() }));

vi.mock("../lib/permissions.js", () => ({
  userHasPermission: vi.fn(async () => true),
}));

vi.mock("../lib/approval-policies.js", () => ({
  resolveActionAccess: vi.fn(async () => ({ allowed: true, requiresApproval: false })),
}));

vi.mock("../lib/approvals.js", () => ({
  approveRequest: vi.fn(async () => ({})),
  createApprovalRequest: vi.fn(async () => ({ id: 1 })),
  rejectRequest: vi.fn(async () => ({})),
}));

vi.mock("../lib/approval-gate.js", () => ({
  requireApprovalOrContinue: vi.fn(async (input: any) => {
    state.gatePayloads.push(input.payload);
    return state.approvalRequired
      ? { requiresApproval: true as const, request: { id: 1 } }
      : { requiresApproval: false as const, request: null };
  }),
}));

vi.mock("../lib/lead-capture.js", () => ({
  captureLead: vi.fn(async () => ({})),
  ensureStages: vi.fn(async () => {}),
  findPriorEnquiry: vi.fn(async () => undefined),
  linkCustomer: vi.fn(async () => {}),
}));

vi.mock("../lib/commissions.js", () => ({
  accrueVehicleCommission: vi.fn(async () => {}),
  applyCommissionDecision: vi.fn(async () => {}),
  computeCommissionAmounts: vi.fn(() => ({})),
  consumePendingPenalties: vi.fn(async () => 0),
  getCommissionSettings: vi.fn(async () => null),
  netOf: vi.fn((value: any) => value),
  penaliseLateTask: vi.fn(async () => {}),
  pendingPenaltyTotal: vi.fn(() => 0),
  resolveCommissionRule: vi.fn(() => undefined),
  settingsForClient: vi.fn(async () => null),
  sweepOverdueTaskPenalties: vi.fn(async () => {}),
  taskResponseDeadline: vi.fn(() => new Date()),
  workingPolicyOf: vi.fn(() => undefined),
}));

vi.mock("../storage.js", () => ({
  storage: {
    createQuotation: vi.fn(async (data: any) => {
      state.quotationData = data;
      return { id: 1, quotationNumber: "QT-1" };
    }),
    assertCustomerCreditWithinLimit: vi.fn(async () => {}),
  },
}));

vi.mock("../lib/approved-invoice-fiscalization.js", () => ({
  enqueueApprovedInvoiceFiscalization: vi.fn(async () => {}),
}));

const { createCrmRouter } = await import("../routes/crm.js");
const { createVehiclesRouter } = await import("../routes/vehicles.js");
const { executeDeferredApprovalAction } = await import("../lib/approval-executors.js");

const enquiry = {
  id: 5,
  companyId: 21,
  branchId: 2,
  customerId: 3,
  name: "A Customer",
  phone: null,
  email: null,
  interest: "generator",
};
const quotationRow = {
  id: 9,
  companyId: 21,
  branchId: 2,
  customerId: 3,
  quotationNumber: "QT-1",
  subtotal: "10.00",
  taxAmount: "0.00",
  total: "10.00",
  notes: "Raised from CRM enquiry: generator",
};
const body = {
  items: [{ productId: 11, description: "Generator", quantity: 1, unitPrice: 10, taxRate: 0 }],
};
const pass = (_req: any, _res: any, next: any) => next();

let app: express.Express;

beforeEach(() => {
  state.queues.clear();
  state.writes = [];
  state.gatePayloads = [];
  state.approvalRequired = false;
  state.quotationData = undefined;

  app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: "u1", isSuperAdmin: false };
    next();
  });
  app.use("/api", createCrmRouter(pass, pass));
  app.use("/api", createVehiclesRouter(pass, pass));
});

async function request(method: string, path: string, payload?: any) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const port = (server.address() as any).port;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: payload ? { "content-type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const quotationWrites = () => state.writes.filter((w) => w.table === "quotations" && w.op === "insert");

describe("vehicle imports and CRM handoff", () => {
  const vehicle = { id: 7, companyId: 21, status: "available", stage: "cleared", accountingModel: "agent" };
  const url = "/api/companies/21/vehicles/7";

  test("a new reservation cannot overwrite an existing reservation", async () => {
    script("vehicles", [{ ...vehicle, status: "reserved", customerId: 3 }]);
    const result = await request("POST", `${url}/reserve`, { customerId: 4 });
    expect(result.status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });

  test("a reservation requires a company-owned customer", async () => {
    script("vehicles", [vehicle]);
    script("customers", []);
    const result = await request("POST", `${url}/reserve`, { customerId: 4 });
    expect(result.status).toBe(400);
    expect(state.writes).toHaveLength(0);
  });

  test("agreement terms are locked once a vehicle has an invoice", async () => {
    script("vehicles", [{ ...vehicle, customerId: 3, invoiceId: 13 }]);
    const result = await request("POST", `${url}/agreement`, {
      agreedPrice: 2000, months: 4, startDate: "2026-11-24",
    });
    expect(result.status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });

  test("agency handover records agreement completion and one delivery event", async () => {
    const agreement = { id: 9, status: "draft", accountingModel: "agent", feeRecognition: "on_collection" };
    const completed = { ...agreement, status: "completed", handoverAt: new Date("2026-11-24") };
    const event = { id: 2, vehicleId: 7, stage: "delivered" };
    script("vehicles", [vehicle], [], [{ ...vehicle, status: "delivered", stage: "delivered" }]);
    script("vehicle_sales_agreements", [agreement], [completed], [completed]);
    script("vehicle_stage_events", [event], [event]);

    expect((await request("POST", `${url}/agreement/handover`, {})).status).toBe(200);
    expect((await request("POST", `${url}/stage`, { stage: "delivered" })).body).toMatchObject(event);
    expect(state.writes.filter((write) => write.table === "vehicle_stage_events")).toHaveLength(1);
    expect(state.writes.find((write) => write.table === "vehicles")?.values)
      .toMatchObject({ stage: "delivered", status: "delivered" });
  });

  test("agreement list reports collected funds and balance in the agreement currency", async () => {
    const agreement = { id: 9, agreedPrice: "2000", currency: "ZWG", exchangeRate: "20" };
    script("vehicle_sales_agreements", [{ agreement, vehicle }]);
    script("payments", [{ vehicleId: 7, amount: "25", exchangeRate: "1" }]);
    const result = await request("GET", "/api/companies/21/agreements");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject([{ collected: 500, balance: 1500 }]);
  });

  test("retrying a completed CRM conversion reuses the customer without adding activity", async () => {
    const lead = { ...enquiry, customerId: null, assignedTo: null, phone: null, email: null };
    const linked = { ...lead, customerId: 12 };
    script("enquiries", [lead], [], [], [linked], [linked], [linked]);
    script("customers", [{ id: 12 }]);
    const url = "/api/companies/21/crm/enquiries/5/convert";
    expect((await request("POST", url)).body).toMatchObject({ customerId: 12 });
    expect((await request("POST", url)).body).toMatchObject({ customerId: 12 });
    expect(state.writes.filter((write) => write.table === "customers")).toHaveLength(1);
    expect(state.writes.filter((write) => write.table === "enquiry_activities")).toHaveLength(1);
  });
});

describe("CRM enquiry to quotation", () => {
  test("configured tenant without resolvable dimensions is rejected before an insert", async () => {
    script("enquiries", [enquiry]);
    script("products", [{ id: 11 }], []); // ownership check, then no product dimensions
    script("departments", [{ id: 7, costCenterId: null }]);
    script("cost_centers", []);

    const result = await request("POST", "/api/companies/21/crm/enquiries/5/quotation", body);
    expect(result.status).toBe(400);
    expect(quotationWrites()).toHaveLength(0);
    expect(state.gatePayloads).toHaveLength(0);
  });

  test("legacy tenants with no configured dimensions keep nullable values", async () => {
    script("products", [{ id: 11 }], []);
    script("departments", []);
    script("cost_centers", []);
    script("quotations", [], [quotationRow]);
    script("enquiries", [enquiry], [{ ...enquiry }]);

    const result = await request("POST", "/api/companies/21/crm/enquiries/5/quotation", body);
    expect(result.status).toBe(201);
    expect(quotationWrites()[0].values).toMatchObject({
      departmentId: null,
      costCenterId: null,
      locationId: null,
    });
    expect(state.gatePayloads[0].quotationData).toMatchObject({
      departmentId: null,
      costCenterId: null,
      locationId: null,
    });
  });

  test("product and location dimensions are persisted and sent to the approval gate", async () => {
    script("products", [{ id: 11 }], [{ id: 11, departmentId: 7, costCenterId: 8 }]);
    script("inventory_locations", [{ id: 6 }]); // location ownership validation
    script("departments", [{ id: 7, costCenterId: 8 }]);
    script("cost_centers", [{ id: 8 }]);
    script("quotations", [], [quotationRow]); // number allocation, then insert
    script("enquiries", [enquiry], [{ ...enquiry }]);

    const result = await request("POST", "/api/companies/21/crm/enquiries/5/quotation", {
      ...body,
      locationId: 6,
    });
    expect(result.status).toBe(201);

    expect(quotationWrites()).toHaveLength(1);
    expect(quotationWrites()[0].values).toMatchObject({ departmentId: 7, costCenterId: 8, locationId: 6 });
    expect(state.gatePayloads).toHaveLength(1);
    expect(state.gatePayloads[0].quotationData).toMatchObject({ departmentId: 7, costCenterId: 8, locationId: 6 });
  });
});

describe("deferred approval execution", () => {
  test("quotation creation keeps the captured analytical dimensions", async () => {
    script("departments", [{ id: 7, costCenterId: 8 }]);
    script("cost_centers", [{ id: 8 }]);

    const result = await executeDeferredApprovalAction("quotation", 21, {
      quotationData: {
        customerId: 3,
        departmentId: 7,
        costCenterId: 8,
        locationId: 6,
        subtotal: "10.00",
        taxAmount: "0.00",
        total: "10.00",
      },
      items: [],
    }, "u1");

    expect(result.quotationId).toBe(1);
    expect(state.quotationData).toMatchObject({ departmentId: 7, costCenterId: 8, locationId: 6 });
  });

  test("sales order creation persists the dimensions carried in its payload", async () => {
    script("departments", [{ id: 7, costCenterId: 8 }]);
    script("cost_centers", [{ id: 8 }]);
    script("sales_orders", [{ id: 12, orderNumber: "SO-1" }]);

    const result = await executeDeferredApprovalAction("sales_order", 21, {
      orderData: {
        customerId: 3,
        departmentId: 7,
        costCenterId: 8,
        locationId: 6,
        orderNumber: "SO-1",
        subtotal: "10.00",
        taxAmount: "0.00",
        total: "10.00",
      },
      items: [],
    }, "u1");

    expect(result.salesOrderId).toBe(12);
    const insert = state.writes.find((w) => w.op === "insert" && w.table === "sales_orders");
    expect(insert?.values).toMatchObject({ departmentId: 7, costCenterId: 8, locationId: 6 });
  });
});
