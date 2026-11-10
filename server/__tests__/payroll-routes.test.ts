/**
 * Route-level guards on the payroll API.
 *
 * These drive the real express router over HTTP, so the middleware chain, the
 * zod schemas, the status codes and the refusal bodies are the shipped ones.
 * Only the database is replaced: every read is answered from a queue scripted per
 * table, and every read records the SQL its WHERE clause renders to. The tests
 * then assert on the refusal branch rather than writing, because the configured
 * database holds live tenant books.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import express from "express";
import type { Express } from "express";
import { createServer, request as nodeRequest, type Server } from "http";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

const state = {
  queues: new Map<string, any[][]>(),
  reads: [] as { table: string; sql: string; params: any[] }[],
  writes: [] as { op: string; table: string }[],
  permissions: new Set<string>(),
  user: { id: "user-1", isSuperAdmin: false } as any,
};

/**
 * Script the rows each successive read of a table answers, in call order.
 * Every argument after the table is one batch, so `script("payroll_runs", [run])`
 * hands the first run lookup a single-row array.
 */
function script(table: string, ...batches: any[][]) {
  state.queues.set(table, batches);
}

function nextBatch(table: string): any[] {
  const queue = state.queues.get(table);
  return queue && queue.length > 0 ? queue.shift()! : [];
}

function tableNameOf(table: any): string {
  const name = table?.[Symbol.for("drizzle:Name")] ?? table?.[Symbol.for("drizzle:OriginalName")];
  if (typeof name === "string") return name;
  if (typeof table?.getTableName === "function") return table.getTableName();
  return String(table?.name ?? table);
}

function relationTableName(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function readSqlFor(table: string): string[] {
  return state.reads.filter((read) => read.table === table).map((read) => read.sql);
}

/** The values bound into a table's queries, so a date bound can be checked. */
function readParamsFor(table: string): string[] {
  return state.reads
    .filter((read) => read.table === table)
    .flatMap((read) => read.params)
    .map((param) => String(param));
}

function recordRead(table: string, cond: any) {
  const query = dialect.sqlToQuery(cond);
  state.reads.push({ table, sql: query.sql, params: query.params ?? [] });
}

function selectChain(): any {
  let table = "unknown";
  const chain: any = {
    from(target: any) {
      table = tableNameOf(target);
      return chain;
    },
    innerJoin() { return chain; },
    leftJoin() { return chain; },
    rightJoin() { return chain; },
    fullJoin() { return chain; },
    where(cond: any) {
      recordRead(table, cond);
      return chain;
    },
    orderBy() { return chain; },
    groupBy() { return chain; },
    having() { return chain; },
    limit() { return chain; },
    offset() { return chain; },
    for() { return chain; },
    execute() { return Promise.resolve(nextBatch(table)); },
    then(onOk: any, onErr?: any) { return Promise.resolve(nextBatch(table)).then(onOk, onErr); },
    catch(onErr: any) { return Promise.resolve(nextBatch(table)).catch(onErr); },
  };
  return chain;
}

/** UPDATE and INSERT record themselves the moment they are opened. */
function writeChain(table: string, op: string): any {
  const entry: any = { op, table, values: undefined };
  state.writes.push(entry);
  const chain: any = {
    set(values: any) { chain.lastValues = values; entry.values = values; return chain; },
    values(row: any) { chain.lastValues = row; entry.values = row; return chain; },
    onConflictDoNothing() { return chain; },
    onConflictDoUpdate() { return chain; },
    where(cond: any) {
      recordRead(table, cond);
      return chain;
    },
    returning() { return Promise.resolve(nextBatch(table)); },
    then(onOk: any, onErr?: any) { return Promise.resolve(nextBatch(table)).then(onOk, onErr); },
  };
  return chain;
}

// Hoisted, and only its closures touch `state`, so the mock factory can run
// while the import graph is still being evaluated.
function makeFakeDb(): any {
  return {
    select: vi.fn(() => selectChain()),
    update: vi.fn((target: any) => writeChain(tableNameOf(target), "update")),
    insert: vi.fn((target: any) => writeChain(tableNameOf(target), "insert")),
    delete: vi.fn((target: any) => writeChain(tableNameOf(target), "delete")),
    transaction: vi.fn((fn: any) => fn(makeFakeDb())),
    // db.query.<relation>.findFirst/findMany reads the same scripted queue as the
    // table it is named for.
    query: new Proxy({} as Record<string, any>, {
      get(_target, key: string) {
        const table = relationTableName(key);
        return {
          findFirst: () => Promise.resolve(nextBatch(table)[0]),
          findMany: () => Promise.resolve(nextBatch(table)),
        };
      },
    }),
  };
}

vi.mock("../db.js", () => ({ db: makeFakeDb() }));

vi.mock("../lib/permissions.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    userHasPermission: vi.fn(async (_userId: any, _companyId: number, permission: string) =>
      state.permissions.has(permission)
    ),
  };
});

import payrollRouter from "../api/v1/payroll.js";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = state.user;
    req.isAuthenticated = () => true;
    next();
  });
  // The mount path the shipped server uses, so req.params.companyId is real.
  app.use("/api/companies/:companyId/payroll", payrollRouter);
  return app;
}

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer(buildApp());
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  port = (server.address() as any).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function call(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req = nodeRequest(
      { host: "127.0.0.1", port, path, method, headers: body ? { "content-type": "application/json" } : {} },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) headers[key] = String(value);
          let parsed: any = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            /* CSV and text bodies stay raw */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed, headers });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** Every reporting route reads the country first, then the employer's own row. */
function scriptZimbabweEmployer() {
  script("companies", [{ country: "Zimbabwe" }], [{ id: 12, name: "Test Books", bpNumber: "BP999999", country: "Zimbabwe" }]);
}

const LOCKED_USD_RUN = {
  id: 40,
  companyId: 12,
  status: "LOCKED",
  currency: "USD",
  runType: "REGULAR",
  periodStart: "2025-09-01",
  periodEnd: "2025-09-30",
  totalGross: "1000.00",
};

beforeEach(() => {
  state.queues.clear();
  state.reads = [];
  state.writes = [];
  state.permissions = new Set(["payroll.view", "payroll.write", "payroll.approve"]);
  state.user = { id: "user-1", isSuperAdmin: false };
});

describe("statutory exports refuse the returns a market does not file", () => {
  test("P2 is refused for a tenant whose payroll does not charge the AIDS levy", async () => {
    script("companies", [{ country: "Lesotho" }]);

    const { status, body } = await call("GET", "/api/companies/12/payroll/exports/p2?month=2025-09");

    expect(status).toBe(422);
    expect(body.error).toBe("REPORT_NOT_APPLICABLE");
    expect(body.message).toMatch(/not a .* return/);
    // Nothing past the refusal is read or written.
    expect(readSqlFor("payroll_runs")).toHaveLength(0);
    expect(state.writes).toHaveLength(0);
  });

  test("ITF16 is refused for the same tenant", async () => {
    script("companies", [{ country: "Lesotho" }]);

    const { status, body } = await call("GET", "/api/companies/12/payroll/exports/itf16?taxYear=2025");

    expect(status).toBe(422);
    expect(body.error).toBe("REPORT_NOT_APPLICABLE");
  });

  test("a tenant that does file P2 still gets its return", async () => {
    scriptZimbabweEmployer();
    script("payroll_runs", [LOCKED_USD_RUN]);
    script("payroll_run_employees", [
      {
        id: 7,
        payrollRunId: 40,
        employeeId: 3,
        grossSalary: "1000.00",
        paye: "150.00",
        aidsLevy: "10.00",
        nssaEmployee: "30.00",
        nssaEmployer: "30.00",
        netSalary: "780.00",
        snapshotData: JSON.stringify({
          taxableIncome: "1000.00",
          payeRaw: "150.00",
          payeAfterCredit: "150.00",
          aidsLevy: "10.00",
          nssaEmployee: "30.00",
        }),
        employee: {
          id: 3,
          nationalId: "98-1-2345678",
          zimraTaxNumber: "200053040",
          nssaNumber: "NSSA1",
          joiningDate: "2024-01-02",
          firstName: "Alice",
          lastName: "Test",
        },
      },
    ]);

    const { status, body } = await call("GET", "/api/companies/12/payroll/exports/p2?month=2025-09");

    expect(status).toBe(200);
    expect(body).toMatchObject({
      month: "2025-09",
      currency: "USD",
      employeeCount: 1,
      totalGross: "1000.00",
      totalPaye: "150.00",
      totalAids: "10.00",
      totalRemittable: "160.00",
    });
  });
});

describe("a return is filed in one currency at a time", () => {
  test("a month holding both USD and ZiG runs is refused with the currencies named", async () => {
    scriptZimbabweEmployer();
    script("payroll_runs", [
      { id: 40, status: "LOCKED", currency: "USD", periodStart: "2025-09-01", periodEnd: "2025-09-30" },
      { id: 41, status: "LOCKED", currency: "ZiG", periodStart: "2025-09-01", periodEnd: "2025-09-30" },
    ]);
    script("payroll_run_employees", [], []);

    const { status, body } = await call("GET", "/api/companies/12/payroll/exports/p2?month=2025-09");

    expect(status).toBe(422);
    expect(body.error).toBe("MIXED_CURRENCY_PAYROLL");
    expect(body.currencies).toEqual(["USD", "ZiG"]);
  });

  test("asking for one currency puts the filter in the query instead of the refusal", async () => {
    scriptZimbabweEmployer();
    script("payroll_runs", [LOCKED_USD_RUN]);
    script("payroll_run_employees", []);

    const { status } = await call("GET", "/api/companies/12/payroll/exports/p2?month=2025-09&currency=USD");

    expect(status).toBe(200);
    const runQuery = readSqlFor("payroll_runs")[0];
    expect(runQuery).toContain('"payroll_runs"."currency"');
    expect(runQuery).toContain('"payroll_runs"."status"');
  });

  test("without the parameter the run lookup is not currency filtered", async () => {
    scriptZimbabweEmployer();
    script("payroll_runs", []);

    const { status, body } = await call("GET", "/api/companies/12/payroll/exports/p2?month=2025-09");

    // A period with no locked runs is refused as not fit to file before the
    // currency question even arises.
    expect(status).toBe(422);
    expect(body.error).toBe("STATUTORY_REPORT_NOT_FIT_TO_FILE");
    expect(readSqlFor("payroll_runs")[0]).not.toContain('"payroll_runs"."currency"');
  });
});

describe("a bank file is a payment instruction", () => {
  test.each([["DRAFT"], ["PENDING_APPROVAL"], ["REVERSED"]])(
    "a run in %s state cannot be exported for payment",
    async (statusName) => {
      script("companies", [{ id: 12, name: "Test Books", country: "Zimbabwe" }]);
      script("payroll_runs", [{ id: 40, companyId: 12, status: statusName, currency: "USD", periodStart: "2025-09-01" }]);

      const { status, body } = await call("GET", "/api/companies/12/payroll/runs/40/bank-export");

      expect(status).toBe(422);
      expect(body.error).toBe("RUN_NOT_PAYABLE");
      expect(body.message).toContain(`This run is ${statusName}`);
    }
  );

  test("a run belonging to another company is not found at all", async () => {
    script("companies", [{ id: 12, name: "Test Books", country: "Zimbabwe" }]);
    script("payroll_runs", []);

    const { status } = await call("GET", "/api/companies/12/payroll/runs/4040/bank-export");

    expect(status).toBe(404);
  });
});

describe("payroll run states cannot be skipped or repeated", () => {
  test("locking a draft run is refused until it is approved", async () => {
    script("payroll_runs", [{ id: 40, companyId: 12, status: "DRAFT" }]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/runs/40/lock", {});

    expect(status).toBe(422);
    expect(body.error).toBe("NOT_APPROVED");
    expect(state.writes).toHaveLength(0);
  });

  test("a locked run cannot be locked again", async () => {
    script("payroll_runs", [{ id: 40, companyId: 12, status: "LOCKED" }]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/runs/40/lock", {});

    expect(status).toBe(409);
    expect(body.error).toBe("ALREADY_LOCKED");
    expect(state.writes).toHaveLength(0);
  });

  test("a reversed run is never locked again", async () => {
    script("payroll_runs", [{ id: 40, companyId: 12, status: "REVERSED" }]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/runs/40/lock", {});

    expect(status).toBe(409);
    expect(body.error).toBe("RUN_REVERSED");
  });

  test("only a locked run can be reversed", async () => {
    script("payroll_runs", [{ id: 40, companyId: 12, status: "APPROVED" }]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/runs/40/reverse", {});

    expect(status).toBe(409);
    expect(body.error).toBe("STATE_ERROR");
    expect(body.message).toContain("current: APPROVED");
    expect(state.writes).toHaveLength(0);
  });
});

describe("earning type configuration", () => {
  const NEW_TYPE = { code: "TRANSPORT", name: "Transport Allowance" };

  test("a second type with a code that already exists is refused", async () => {
    script("payroll_earning_types", [{ id: 1, companyId: null }]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/earning-types", NEW_TYPE);

    expect(status).toBe(409);
    expect(body.error).toBe("DUPLICATE_CODE");
    expect(state.writes).toHaveLength(0);
  });

  test("a built-in template row is read-only for every tenant", async () => {
    script("payroll_earning_types", [{ id: 1, companyId: null, code: "BASIC" }]);

    const { status, body } = await call("PATCH", "/api/companies/12/payroll/earning-types/1", { name: "Rewritten" });

    expect(status).toBe(422);
    expect(body.error).toBe("SYSTEM_TYPE_READ_ONLY");
    expect(state.writes).toHaveLength(0);
  });

  test("another tenant's earning type is not even findable", async () => {
    script("payroll_earning_types", []);

    const { status } = await call("PATCH", "/api/companies/12/payroll/earning-types/99", { name: "Mine" });

    expect(status).toBe(404);
    expect(state.writes).toHaveLength(0);
    // The lookup proves ownership by company as well as by id.
    expect(readSqlFor("payroll_earning_types")[0]).toContain('"payroll_earning_types"."company_id"');
  });

  test("a taxable percentage outside 0-100 is rejected before any write", async () => {
    const { status, body } = await call("POST", "/api/companies/12/payroll/earning-types", {
      ...NEW_TYPE,
      taxablePercentage: 150,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(state.writes).toHaveLength(0);
  });

  test("a user without payroll approval cannot change type configuration", async () => {
    // Still holds payroll.view and payroll.write, so the request reaches the
    // approval gate on the route itself instead of the read guard.
    state.permissions = new Set(["payroll.view", "payroll.write"]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/earning-types", NEW_TYPE);

    expect(status).toBe(403);
    expect(body.error).toBe("FORBIDDEN");
    expect(state.writes).toHaveLength(0);
  });

  test("no payroll permission at all is refused before any table is read", async () => {
    state.permissions = new Set();

    const { status, body } = await call("GET", "/api/companies/12/payroll/earning-types");

    expect(status).toBe(403);
    expect(body.error).toBe("FORBIDDEN");
    expect(state.writes).toHaveLength(0);
  });

  test("a request with no signed-in user is unauthorized, not defaulted", async () => {
    state.user = {};

    const { status, body } = await call("GET", "/api/companies/12/payroll/earning-types");

    expect(status).toBe(401);
    expect(body.error).toBe("UNAUTHORIZED");
  });
});

describe("deduction type configuration", () => {
  test("a duplicate deduction code is refused", async () => {
    script("payroll_deduction_types", [{ id: 2, companyId: 12 }]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/deduction-types", {
      code: "NSSA",
      name: "NSSA Employee",
    });

    expect(status).toBe(409);
    expect(body.error).toBe("DUPLICATE_CODE");
    expect(state.writes).toHaveLength(0);
  });

  test("a rate above 100 percent is rejected", async () => {
    const { status, body } = await call("POST", "/api/companies/12/payroll/deduction-types", {
      code: "GARNISH",
      name: "Garnishment",
      employeeRate: "120",
    });

    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(state.writes).toHaveLength(0);
  });
});

describe("the filing calendar is a read", () => {
  test("GET /statutory-remittances saves nothing on its way out", async () => {
    script("payroll_runs", []);
    script("payroll_remittances", []);
    script("companies", [{ country: "Zimbabwe" }]);

    const { status, body } = await call("GET", "/api/companies/12/payroll/statutory-remittances?months=3");

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(state.writes).toHaveLength(0);
  });
});

describe("a pay period is a real date range, in the currency the market pays", () => {
  test("February ends on the 28th, not on a date that does not exist", async () => {
    scriptZimbabweEmployer();
    script("payroll_runs", []);

    const { status } = await call("GET", "/api/companies/12/payroll/exports/p2?month=2025-02");

    // `${month}-31` used to be the upper bound; binding it made every February
    // and 30-day-month return fail in the database rather than return nothing.
    expect(status).toBe(422);
    expect(readParamsFor("payroll_runs")).toContain("2025-02-28");
    expect(readParamsFor("payroll_runs")).not.toContain("2025-02-31");
  });

  test("a run in a currency the market does not pay is refused", async () => {
    script("companies", [{ country: "Zimbabwe" }]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/runs", {
      periodStart: "2025-09-01",
      periodEnd: "2025-09-30",
      currency: "LSL",
    });

    expect(status).toBe(422);
    expect(body.error).toBe("UNSUPPORTED_PAYROLL_CURRENCY");
    expect(body.currencies).toEqual(["USD", "ZiG", "SPLIT"]);
    expect(state.writes).toHaveLength(0);
  });

  test("a second live run over the same period is refused with the run named", async () => {
    script("companies", [{ country: "Zimbabwe" }]);
    script("payroll_runs", [
      { id: 39, companyId: 12, status: "LOCKED", currency: "USD", runType: "REGULAR", periodStart: "2025-09-01", periodEnd: "2025-09-30", branchId: null },
    ]);

    const { status, body } = await call("POST", "/api/companies/12/payroll/runs", {
      periodStart: "2025-09-01",
      periodEnd: "2025-09-30",
      currency: "USD",
    });

    expect(status).toBe(409);
    expect(body.error).toBe("DUPLICATE_PAYROLL_RUN");
    expect(body.existingRunId).toBe(39);
    expect(state.writes).toHaveLength(0);
  });
});

describe("payslip adjustments", () => {
  test("a locked run is closed to adjustment", async () => {
    script("companies", [{ country: "Zimbabwe" }]);
    script("payroll_runs", [{ id: 40, companyId: 12, status: "LOCKED" }]);

    const { status, body } = await call("PUT", "/api/companies/12/payroll/runs/40/adjustments", {
      employeeId: 3,
      allowances: [{ name: "Transport", amount: 50 }],
    });

    expect(status).toBe(409);
    expect(body.error).toBe("STATE_ERROR");
    expect(state.writes).toHaveLength(0);
  });

  test("an engine-calculated deduction cannot be typed in by hand", async () => {
    script("companies", [{ country: "Zimbabwe" }]);
    script("payroll_runs", [{ id: 40, companyId: 12, status: "DRAFT" }]);
    script("payroll_run_employees", [{ id: 7, payrollRunId: 40, employeeId: 3, grossSalary: "1000.00", netSalary: "800.00" }]);

    const { status, body } = await call("PUT", "/api/companies/12/payroll/runs/40/adjustments", {
      employeeId: 3,
      deductions: [{ name: "Tax", amount: 150, deductionType: "PAYE" }],
    });

    expect(status).toBe(400);
    expect(body.error).toBe("RESERVED_DEDUCTION_TYPE");
    // Refused before the transaction opened, so nothing was posted.
    expect(state.writes).toHaveLength(0);
  });
});


// --- 22. STAFF FILE, NUMBERING AND VACANCY ROUTES -------------------------
//
// These are the routes that decide what a company's payroll file has to contain,
// how its staff are numbered and whether an approved post can be shrunk below the
// people sitting in it. All three are policy edges the UI cannot police by itself.

describe("payroll settings", () => {
  test("refuses a document type the product does not track and writes nothing", async () => {
    script("payroll_company_settings", []);
    const res = await call("PATCH", "/api/companies/12/payroll/settings", {
      requiredDocumentTypes: ["CONTRACT", "BIRTH_CERTIFICATE"],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("BIRTH_CERTIFICATE");
    expect(state.writes).toHaveLength(0);
  });

  test("upserts a numbering policy and upper-cases the prefix", async () => {
    script("payroll_company_settings", [], [{ id: 3, companyId: 12, staffNumberPrefix: "FS", staffNumberDigits: 4, staffNumberNext: 8 }]);
    const res = await call("PATCH", "/api/companies/12/payroll/settings", {
      staffNumberPrefix: "fs",
      staffNumberDigits: 4,
      staffNumberNext: 8,
      requiredDocumentTypes: ["contract"],
      expiryWarningDays: 45,
    });
    expect(res.status).toBe(200);
    const write = state.writes.find((w: any) => w.table === "payroll_company_settings");
    expect(write?.op).toBe("insert");
    expect(write?.values.staffNumberPrefix).toBe("FS");
    expect(write?.values.requiredDocumentTypes).toEqual(["CONTRACT"]);
    expect(write?.values.expiryWarningDays).toBe(45);
  });

  test("will not let the warning window be set beyond a year", async () => {
    const res = await call("PATCH", "/api/companies/12/payroll/settings", { expiryWarningDays: 900 });
    expect(res.status).toBe(400);
    expect(state.writes).toHaveLength(0);
  });
});

describe("staff file documents", () => {
  test("rejects an untracked document type before touching the table", async () => {
    const res = await call("POST", "/api/companies/12/payroll/employees/7/documents", {
      documentType: "PASSPORT",
      fileName: "passport.pdf",
      fileUrl: "/uploads/staff-files/x.pdf",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("not a document this product tracks");
    expect(state.writes.filter((w: any) => w.table === "employee_documents")).toHaveLength(0);
  });

  test("rejects a malformed expiry date rather than storing it", async () => {
    script("employees", [{ id: 7 }]);
    const res = await call("POST", "/api/companies/12/payroll/employees/7/documents", {
      documentType: "CONTRACT",
      fileName: "contract.pdf",
      fileUrl: "/uploads/staff-files/c.pdf",
      expiryDate: "31/12/2025",
    });
    expect(res.status).toBe(400);
    expect(state.writes.filter((w: any) => w.table === "employee_documents")).toHaveLength(0);
  });

  test("reports a missing required document and an expired one", async () => {
    const expired = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    script("employees", [{ id: 1, employeeNumber: "0001", firstName: "Tine", lastName: "Chiwese", status: "ACTIVE" }]);
    script("employee_documents", [
      { id: 9, employeeId: 1, documentType: "CONTRACT", fileName: "c.pdf", fileUrl: "/uploads/c.pdf", expiryDate: expired, hardCopyOnFile: false, notes: null },
    ]);
    const res = await call("GET", "/api/companies/12/payroll/staff-file/summary");
    expect(res.status).toBe(200);
    const row = res.body.employees[0];
    // Nothing configured, so the shipped default file applies: contract, ID, NSSA.
    expect(row.fileStatus.missing).toEqual(expect.arrayContaining(["ID_COPY", "NSSA"]));
    expect(row.fileStatus.expired).toContain("CONTRACT");
    expect(row.fileStatus.complete).toBe(false);
    expect(res.body.totals.expiredDocuments).toBe(1);
    expect(res.body.totals.missingHardCopies).toBe(1);
    expect(res.body.expiringDocuments[0].documentType).toBe("CONTRACT");
  });
});

describe("month-end checklist", () => {
  test("blocks a period with no run and a file missing its documents", async () => {
    script("payroll_company_settings", []);
    script("employees", [{ id: 1, employeeNumber: "0001", firstName: "Tine", lastName: "Chiwese" }]);
    script("employee_documents", []);
    script("payroll_runs", [], []);
    script("employee_salary_changes", []);
    script("employee_contracts", []);
    script("payroll_remittances", []);

    const res = await call("GET", "/api/companies/12/payroll/month-end-checklist?period=2025-09");
    expect(res.status).toBe(200);
    expect(res.body.period).toBe("2025-09");
    expect(res.body.summary.readyToClose).toBe(false);
    expect(res.body.summary.blockers).toBe(1);

    const byId = Object.fromEntries(res.body.items.map((item: any) => [item.id, item]));
    expect(byId.PERIOD_RUN_EXISTS.severity).toBe("BLOCK");
    expect(byId.STAFF_FILE_COMPLETE.severity).toBe("WARN");
    expect(byId.STAFF_FILE_COMPLETE.count).toBe(1);
    // A blocker always outranks a warning, whatever order the checks were built in.
    expect(res.body.items[0].severity).toBe("BLOCK");
  });

  test("escalates to a blocker when a document has lapsed", async () => {
    const expired = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    script("payroll_company_settings", []);
    script("employees", [{ id: 1, employeeNumber: "0001", firstName: "Tine", lastName: "Chiwese" }]);
    script("employee_documents", [
      { id: 9, employeeId: 1, documentType: "CONTRACT", fileName: "c.pdf", fileUrl: "/uploads/c.pdf", expiryDate: expired, hardCopyOnFile: true, notes: null },
    ]);
    script("payroll_runs", [], [{ id: 40, status: "LOCKED", periodStart: "2025-09-01", periodEnd: "2025-09-30", currency: "USD" }]);
    script("employee_salary_changes", []);
    script("employee_contracts", []);
    script("payroll_remittances", []);

    const res = await call("GET", "/api/companies/12/payroll/month-end-checklist?period=2025-09");
    const byId = Object.fromEntries(res.body.items.map((item: any) => [item.id, item]));
    expect(byId.DOCUMENTS_UNEXPIRED.severity).toBe("BLOCK");
    expect(byId.PERIOD_RUN_EXISTS.severity).toBe("OK");
    expect(res.body.summary.blockers).toBe(1);
  });
});

describe("positions and vacancies", () => {
  test("refuses to approve fewer posts than the people already holding one", async () => {
    script("positions", [{ id: 5, companyId: 12 }]);
    script("employees", [{ headcount: 3 }]);

    const res = await call("PUT", "/api/companies/12/payroll/positions/5", {
      title: "Accounts Clerk",
      approvedHeadcount: 2,
      isActive: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("3 people still hold");
    expect(state.writes.filter((w: any) => w.table === "positions")).toHaveLength(0);
  });

  test("reads the string false as false, not as true", async () => {
    script("positions", [{ id: 5, companyId: 12 }], [{ id: 5, title: "Accounts Clerk", isActive: false }]);
    script("employees", [{ headcount: 0 }]);

    const res = await call("PUT", "/api/companies/12/payroll/positions/5", {
      title: "Accounts Clerk",
      approvedHeadcount: 1,
      isActive: "false",
    });
    expect(res.status).toBe(200);
    const write = state.writes.find((w: any) => w.table === "positions" && w.op === "update");
    expect(write?.values.isActive).toBe(false);
  });

  test("will not assign another company's position, branch or department", async () => {
    script("branches", [{ id: 1, name: "Head office", code: "HQ" }]);
    script("departments", []);
    script("positions", []);
    script("employee_contracts", []);
    script("employees", []);

    const res = await call("POST", "/api/companies/12/payroll/employees", {
      firstName: "Tine",
      lastName: "Chiwese",
      nationalId: "22222222",
      positionId: 99,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("does not belong to this company");
    expect(state.writes.filter((w: any) => w.table === "employees")).toHaveLength(0);
  });
});
