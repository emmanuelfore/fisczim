/**
 * Route-level guards on the SOP read-and-sign API.
 *
 * Same shape as payroll-routes.test.ts: the shipped express router is driven over real
 * HTTP, so the middleware chain, the zod schemas, the status codes and the refusal bodies
 * are the ones that ship. Only the database is replaced - every read answers from a queue
 * scripted per table, and every read records the SQL its WHERE clause rendered to.
 *
 * That matters here more than anywhere: the configured remote Postgres is a production
 * tenant book, and a read-and-sign workflow is the kind of thing a real person's
 * disciplinary record ends up resting on. So every assertion sits on a refusal branch or
 * on a scripted read, and nothing is ever written for real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import express from "express";
import type { Express } from "express";
import { createServer, request as nodeRequest, type Server } from "http";
import { vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

/** A queued batch that throws instead of returning rows, for constraint violations. */
class Failing {
  constructor(public error: any) {}
}

const state = {
  queues: new Map<string, any[][]>(),
  reads: [] as { table: string; sql: string; params: any[] }[],
  writes: [] as { op: string; table: string; values?: any }[],
  permissions: new Set<string>(),
  user: { id: "user-1", isSuperAdmin: false } as any,
  /**
   * The SOP router reads `company_users` on every request to confirm the account belongs
   * to the company in the URL, so membership answers from here rather than from a queue
   * each test would have to refill. Set it to null to drive a stranger.
   */
  membership: { role: "member" } as any,
};

/**
 * Script the rows each successive read of a table answers, in call order. Pass `fail(rows)`
 * where a write must hit a unique index instead of succeeding.
 */
function script(table: string, ...batches: any[][]) {
  state.queues.set(table, batches);
}

/** The next read or insert of `table` throws, so the route's own catch is what is tested. */
function fail(table: string, error: any) {
  const queue = state.queues.get(table) ?? [];
  queue.push([new Failing(error)] as any);
  state.queues.set(table, queue);
}

function uniqueViolation(constraint: string) {
  return Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
    code: "23505",
    constraint,
  });
}

function nextBatch(table: string): any[] {
  const queue = state.queues.get(table);
  if (!queue || queue.length === 0) {
    return table === "company_users" && state.membership ? [state.membership] : [];
  }
  const batch = queue.shift()!;
  if (batch.length === 1 && batch[0] instanceof Failing) throw batch[0].error;
  return batch;
}

function tableNameOf(table: any): string {
  const name = table?.[Symbol.for("drizzle:Name")] ?? table?.[Symbol.for("drizzle:OriginalName")];
  if (typeof name === "string") return name;
  if (typeof table?.getTableName === "function") return table.getTableName();
  return String(table?.name ?? table);
}

function readSqlFor(table: string): string[] {
  return state.reads.filter((read) => read.table === table).map((read) => read.sql);
}

function readParamsFor(table: string): string[] {
  return state.reads
    .filter((read) => read.table === table)
    .flatMap((read) => read.params)
    .map((param) => String(param));
}

function writesFor(table: string) {
  return state.writes.filter((write) => write.table === table);
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

/** UPDATE, INSERT and DELETE record themselves the moment they are opened. */
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

// Hoisted, and only its closures touch `state`, so the mock factory can run while the
// import graph is still being evaluated.
function makeFakeDb(): any {
  return {
    select: vi.fn(() => selectChain()),
    update: vi.fn((target: any) => writeChain(tableNameOf(target), "update")),
    insert: vi.fn((target: any) => writeChain(tableNameOf(target), "insert")),
    delete: vi.fn((target: any) => writeChain(tableNameOf(target), "delete")),
    transaction: vi.fn((fn: any) => fn(makeFakeDb())),
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
  // The mount path the shipped server uses, so req.params.companyId is real. /sop is
  // registered ahead of the payroll router's payroll.view gate, which is why its own
  // membership guard and requireSopViewer are what these tests drive.
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
            /* non-JSON bodies stay raw */
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

const SOP = "/api/companies/12/payroll/sop";

const PUBLISHED_DOC = {
  id: 5,
  companyId: 12,
  code: "FIN-PAY-01",
  title: "Month-end payroll close",
  category: "PAYROLL",
  version: 2,
  status: "PUBLISHED",
  body: "Lock the run, file the return, tell nobody before ZIMRA.",
  effectiveDate: "2025-09-01",
  requiresExam: true,
  acknowledgementDays: 14,
  departmentId: 3,
  departmentName: "Finance",
  branchId: 1,
  branchName: "Head office",
  authorNote: null,
  publishedBy: "user-9",
  publishedAt: "2025-09-02T08:00:00.000Z",
  publishedByName: "Tine Chiwese",
  supersededById: null,
  createdAt: new Date("2025-09-01T08:00:00.000Z"),
  updatedAt: new Date("2025-09-02T08:00:00.000Z"),
};

const DRAFT_DOC = { ...PUBLISHED_DOC, id: 7, status: "DRAFT", publishedAt: null, publishedBy: null, publishedByName: null };

/** Five questions, so a score is a whole number of marks per answer. */
function questions(overrides: Partial<Record<number, any>> = {}) {
  return [1, 2, 3, 4, 5].map((n) => ({
    id: 20 + n,
    companyId: 12,
    sopId: 5,
    question: `Question ${n}`,
    options: ["wrong", "right"],
    correctIndex: 1,
    explanation: `Why ${n} is right`,
    questionOrder: n,
    ...(overrides[n] ?? {}),
  }));
}

function answersFor(count: number, wrongIndexes: number[] = []) {
  return [1, 2, 3, 4, 5]
    .slice(0, count)
    .map((n) => ({ questionId: 20 + n, selectedIndex: wrongIndexes.includes(n) ? 0 : 1 }));
}

const ACCOUNT = [{ name: "Tine Chiwese", username: "tine" }];

beforeEach(() => {
  state.queues.clear();
  state.reads = [];
  state.writes = [];
  state.permissions = new Set(["payroll.view", "payroll.write", "payroll.approve"]);
  state.user = { id: "user-1", isSuperAdmin: false };
  state.membership = { role: "member" };
});

describe("the library list", () => {
  test("carries the counts, the reader's own signature and the tab totals", async () => {
    script(
      "hr_sop_documents",
      [
        { ...DRAFT_DOC, id: 8, code: "ACC-01", version: 1 },
        { ...PUBLISHED_DOC, id: 5 },
        { ...PUBLISHED_DOC, id: 6, status: "SUPERSEDED", version: 1 },
      ],
      [
        { status: "PUBLISHED", count: 1 },
        { status: "DRAFT", count: 1 },
        { status: "SUPERSEDED", count: 1 },
      ],
    );
    script("hr_sop_readers", [
      { sopId: 5, userId: "user-1" },
      { sopId: 5, userId: "user-2" },
      { sopId: 8, userId: "user-1" },
    ]);
    script("hr_sop_acknowledgements", [
      {
        sopId: 5,
        userId: "user-1",
        acknowledgedAt: "2025-09-03T09:00:00.000Z",
        signatureName: "Tine Chiwese",
        examScore: "80.00",
        examPassed: true,
      },
    ]);

    const { status, body } = await call("GET", `${SOP}/documents`);

    expect(status).toBe(200);
    // PUBLISHED first, then DRAFT, then the retired version - the order a manager works in.
    expect(body.documents.map((doc: any) => `${doc.code} v${doc.version} ${doc.status}`)).toEqual([
      "FIN-PAY-01 v2 PUBLISHED",
      "ACC-01 v1 DRAFT",
      "FIN-PAY-01 v1 SUPERSEDED",
    ]);
    expect(body.totals).toEqual({ draft: 1, published: 1, superseded: 1, archived: 0 });

    const published = body.documents.find((doc: any) => doc.status === "PUBLISHED");
    expect(published.readerCount).toBe(2);
    expect(published.signedCount).toBe(1);
    expect(published.myAcknowledgement).toMatchObject({
      signatureName: "Tine Chiwese",
      examScore: 80,
      examPassed: true,
    });
    // The list is a browse screen, not the document: no markdown in the payload.
    expect(published).not.toHaveProperty("body");
    expect(published).toMatchObject({ departmentName: "Finance", branchName: "Head office", publishedByName: "Tine Chiwese" });

    const draft = body.documents.find((doc: any) => doc.code === "ACC-01");
    expect(draft.signedCount).toBe(0);
    expect(draft.myAcknowledgement).toBeNull();
  });

  test("a requester without payroll.write is only shown the versions people signed", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [], []);

    const { status } = await call("GET", `${SOP}/documents`);

    expect(status).toBe(200);
    const listQuery = readSqlFor("hr_sop_documents")[0];
    expect(listQuery).toContain('"hr_sop_documents"."company_id"');
    expect(listQuery).toContain('"hr_sop_documents"."status"');
    expect(readParamsFor("hr_sop_documents")).toEqual(expect.arrayContaining(["PUBLISHED", "SUPERSEDED"]));
    expect(readParamsFor("hr_sop_documents")).not.toContain("DRAFT");
  });
});

describe("the answer key waits for the signature", () => {
  test("an unsigned reader gets the questions without correctIndex or explanation", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_questions", questions());
    script("hr_sop_readers", [{ userId: "user-1" }, { userId: "user-2" }]);
    script("hr_sop_acknowledgements", []);

    const { status, body } = await call("GET", `${SOP}/documents/5`);

    expect(status).toBe(200);
    expect(body.questions).toHaveLength(5);
    expect(body.questions[0]).toMatchObject({ id: 21, question: "Question 1", questionOrder: 1 });
    expect(body.questions[0]).not.toHaveProperty("correctIndex");
    expect(body.questions[0]).not.toHaveProperty("explanation");
    expect(body.readerCount).toBe(2);
    expect(body.signedCount).toBe(0);
    expect(body.coverage).toEqual({ required: 2, signed: 0, outstanding: 2 });
    expect(body.myAcknowledgement).toBeNull();
  });

  test("a payroll writer gets the full rows, because they set the marking", async () => {
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_questions", questions());
    script("hr_sop_readers", []);
    script("hr_sop_acknowledgements", []);

    const { status, body } = await call("GET", `${SOP}/documents/5`);

    expect(status).toBe(200);
    expect(body.questions[0]).toMatchObject({ correctIndex: 1, explanation: "Why 1 is right" });
  });

  test("a reader who has signed can see what they got wrong", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_questions", questions());
    script("hr_sop_readers", [{ userId: "user-1" }]);
    script("hr_sop_acknowledgements", [
      {
        userId: "user-1",
        acknowledgedAt: "2025-09-03T09:00:00.000Z",
        signatureName: "Tine Chiwese",
        examScore: "80.00",
        examPassed: true,
      },
    ]);

    const { status, body } = await call("GET", `${SOP}/documents/5`);

    expect(status).toBe(200);
    expect(body.questions[0]).toHaveProperty("correctIndex", 1);
    expect(body.myAcknowledgement).toMatchObject({ examScore: 80, signatureName: "Tine Chiwese" });
    expect(body.signedCount).toBe(1);
    expect(body.coverage).toEqual({ required: 1, signed: 1, outstanding: 0 });
  });
});

describe("publish refuses an unfinished version, by name", () => {
  test("empty body", async () => {
    script("hr_sop_documents", [{ ...DRAFT_DOC, body: "   \n ", requiresExam: false }]);
    script("hr_sop_readers", [{ userId: "user-1" }]);

    const { status, body } = await call("POST", `${SOP}/documents/7/publish`, {});

    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("Publish refused");
    expect(body.message).toContain("the body text is empty");
    expect(body.missing).toEqual(["the body text is empty"]);
    expect(writesFor("hr_sop_documents")).toHaveLength(0);
  });

  test("no readers", async () => {
    script("hr_sop_documents", [{ ...DRAFT_DOC, requiresExam: false }]);
    script("hr_sop_readers", []);

    const { status, body } = await call("POST", `${SOP}/documents/7/publish`, {});

    expect(status).toBe(400);
    expect(body.message).toContain("no readers are assigned");
    expect(writesFor("hr_sop_documents")).toHaveLength(0);
  });

  test("an exam with no questions", async () => {
    script("hr_sop_documents", [DRAFT_DOC]);
    script("hr_sop_readers", [{ userId: "user-1" }]);
    script("hr_sop_questions", []);

    const { status, body } = await call("POST", `${SOP}/documents/7/publish`, {});

    expect(status).toBe(400);
    expect(body.missing).toEqual(["an exam is required but no questions are set"]);
    expect(writesFor("hr_sop_documents")).toHaveLength(0);
  });

  test("several missing pieces are all named at once", async () => {
    script("hr_sop_documents", [{ ...DRAFT_DOC, body: "", requiresExam: false }]);
    script("hr_sop_readers", []);
    script("hr_sop_questions", []);

    const { status, body } = await call("POST", `${SOP}/documents/7/publish`, {});

    expect(status).toBe(400);
    expect(body.missing).toHaveLength(2);
    expect(body.missing).toContain("the body text is empty");
    expect(body.missing).toContain("no readers are assigned");
  });

  test("publishing from a draft is an approval decision, not a clerical one", async () => {
    state.permissions = new Set(["payroll.view", "payroll.write"]);

    const { status, body } = await call("POST", `${SOP}/documents/7/publish`, {});

    expect(status).toBe(403);
    expect(body.error).toBe("FORBIDDEN");
    expect(state.writes).toHaveLength(0);
  });

  test("a complete draft publishes and retires the version it replaces", async () => {
    script(
      "hr_sop_documents",
      // the draft, the previous published row, the supersede update, the publish update
      [{ ...DRAFT_DOC, body: "Lock the run first.", requiresExam: false }],
      [{ id: 6 }],
      [],
      [{ ...PUBLISHED_DOC, id: 7, status: "PUBLISHED", publishedBy: "user-1", publishedAt: new Date() }],
    );
    script("hr_sop_readers", [{ userId: "user-1" }, { userId: "user-2" }]);

    const { status, body } = await call("POST", `${SOP}/documents/7/publish`, {});

    expect(status).toBe(200);
    expect(body.supersededId).toBe(6);
    expect(body.document).toMatchObject({ id: 7, status: "PUBLISHED", code: "FIN-PAY-01", version: 2 });

    const supersede = writesFor("hr_sop_documents").find((write: any) => write.op === "update" && write.values?.status === "SUPERSEDED");
    // The old row points forward at the new one, so history reads both ways.
    expect(supersede?.values?.supersededById).toBe(7);
    const publish = writesFor("hr_sop_documents").find((write: any) => write.values?.status === "PUBLISHED");
    expect(publish?.values?.publishedBy).toBe("user-1");
    // Every mutating route leaves an audit trail.
    expect(writesFor("audit_logs").length).toBeGreaterThan(0);
  });
});

describe("a published version is immutable", () => {
  test("editing it is refused, and nothing is written", async () => {
    script("hr_sop_documents", [PUBLISHED_DOC]);

    const { status, body } = await call("PUT", `${SOP}/documents/5`, { title: "Rewritten history" });

    expect(status).toBe(409);
    expect(body.message).toBe("Published versions are immutable; issue a new version.");
    expect(writesFor("hr_sop_documents")).toHaveLength(0);
  });

  test("so is adding a question to it", async () => {
    script("hr_sop_documents", [PUBLISHED_DOC]);

    const { status, body } = await call("POST", `${SOP}/documents/5/questions`, {
      question: "Too late?",
      options: ["yes", "no"],
      correctIndex: 0,
    });

    expect(status).toBe(409);
    expect(body.message).toBe("Published versions are immutable; issue a new version.");
    expect(writesFor("hr_sop_questions")).toHaveLength(0);
  });

  test("and so is changing who was asked to sign it", async () => {
    script("hr_sop_documents", [PUBLISHED_DOC]);

    const { status, body } = await call("POST", `${SOP}/documents/5/readers`, { userIds: ["user-2"] });

    expect(status).toBe(409);
    expect(body.message).toBe("Published versions are immutable; issue a new version.");
    expect(writesFor("hr_sop_readers")).toHaveLength(0);
  });

  test("only a draft can be deleted", async () => {
    script("hr_sop_documents", [PUBLISHED_DOC]);

    const { status, body } = await call("DELETE", `${SOP}/documents/5`);

    expect(status).toBe(409);
    expect(body.message).toContain("Only a DRAFT version can be deleted");
    expect(writesFor("hr_sop_documents")).toHaveLength(0);
  });
});

describe("signing means typing your own name", () => {
  test("a signature that is not the account holder's name is refused", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_readers", [{ id: 9, userId: "user-1" }]);
    script("users", ACCOUNT);

    const { status, body } = await call("POST", `${SOP}/documents/5/acknowledge`, {
      signatureName: "Tine's Twin",
      answers: answersFor(5),
    });

    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("Sign with the name on your account.");
    expect(writesFor("hr_sop_acknowledgements")).toHaveLength(0);
  });

  test("the name on the account still matches when it is only cased differently", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [{ ...PUBLISHED_DOC, requiresExam: false }]);
    script("hr_sop_readers", [{ id: 9, userId: "user-1" }]);
    script("users", ACCOUNT);
    script("hr_sop_acknowledgements", [], [{ id: 3, sopId: 5, userId: "user-1", examScore: null, examPassed: null }]);

    const { status, body } = await call("POST", `${SOP}/documents/5/acknowledge`, { signatureName: "  TINE CHIWESE " });

    expect(status).toBe(201);
    expect(body.id).toBe(3);
    const insert = writesFor("hr_sop_acknowledgements").find((write: any) => write.op === "insert");
    expect(insert?.values.signatureName).toBe("TINE CHIWESE");
    // No exam, so nothing to score: the column is honestly empty, not zero.
    expect(insert?.values.examScore).toBeNull();
    expect(insert?.values.examPassed).toBeNull();
    expect(body.examScore).toBeNull();
  });

  test("someone who is not on the reader list cannot sign, whoever they name", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_readers", []);

    const { status, body } = await call("POST", `${SOP}/documents/5/acknowledge`, {
      signatureName: "Tine Chiwese",
      answers: answersFor(5),
    });

    expect(status).toBe(403);
    expect(body.message).toBe("You are not a reader on this version.");
    expect(writesFor("hr_sop_acknowledgements")).toHaveLength(0);
    // The reader test is scoped to this company's list, not just to the person.
    expect(readSqlFor("hr_sop_readers")[0]).toContain('"hr_sop_readers"."company_id"');
  });

  test("a draft or a retired version is not open for signatures", async () => {
    script("hr_sop_documents", [DRAFT_DOC]);

    const { status, body } = await call("POST", `${SOP}/documents/7/acknowledge`, { signatureName: "Tine Chiwese" });

    expect(status).toBe(409);
    expect(body.message).toContain("current: DRAFT");
    expect(writesFor("hr_sop_acknowledgements")).toHaveLength(0);
  });
});

describe("the exam is the signature's price", () => {
  test("below the pass mark nothing is recorded and the score comes back", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_readers", [{ id: 9, userId: "user-1" }]);
    script("users", ACCOUNT);
    script("hr_sop_acknowledgements", []);
    script("hr_sop_questions", questions());

    const { status, body } = await call("POST", `${SOP}/documents/5/acknowledge`, {
      signatureName: "Tine Chiwese",
      answers: answersFor(5, [4, 5]),
    });

    expect(status).toBe(422);
    expect(body.error).toBe("EXAM_NOT_PASSED");
    expect(body.score).toBe(60);
    expect(body.passMark).toBe(80);
    expect(body.incorrectQuestionIds).toEqual([24, 25]);
    expect(writesFor("hr_sop_acknowledgements")).toHaveLength(0);
  });

  test("an unanswered question is refused before any marking", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_readers", [{ id: 9, userId: "user-1" }]);
    script("users", ACCOUNT);
    script("hr_sop_acknowledgements", []);
    script("hr_sop_questions", questions());

    const { status, body } = await call("POST", `${SOP}/documents/5/acknowledge`, {
      signatureName: "Tine Chiwese",
      answers: answersFor(3),
    });

    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("2 of 5");
    expect(writesFor("hr_sop_acknowledgements")).toHaveLength(0);
  });

  test("at the pass mark the signature is recorded with the score", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_readers", [{ id: 9, userId: "user-1" }]);
    script("users", ACCOUNT);
    script("hr_sop_acknowledgements", [], [{ id: 4, sopId: 5, userId: "user-1", examScore: "80.00", examPassed: true }]);
    script("hr_sop_questions", questions());

    const { status, body } = await call("POST", `${SOP}/documents/5/acknowledge`, {
      signatureName: "Tine Chiwese",
      answers: answersFor(5, [5]),
    });

    expect(status).toBe(201);
    expect(body.examScore).toBe(80);
    expect(body.examPassed).toBe(true);
    const insert = writesFor("hr_sop_acknowledgements").find((write: any) => write.op === "insert");
    expect(insert?.values.examScore).toBe("80.00");
    expect(insert?.values.userId).toBe("user-1");
    expect(insert?.values.sopId).toBe(5);
  });
});

describe("one signature per person per version", () => {
  test("a second signature on the same version is a 409 the client can show", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [{ ...PUBLISHED_DOC, requiresExam: false }]);
    script("hr_sop_readers", [{ id: 9, userId: "user-1" }]);
    script("users", ACCOUNT);
    script("hr_sop_acknowledgements", []);
    fail("hr_sop_acknowledgements", uniqueViolation("hr_sop_acknowledgements_sop_user_key"));

    const { status, body } = await call("POST", `${SOP}/documents/5/acknowledge`, { signatureName: "Tine Chiwese" });

    // A unique index is a refusal about data, not a server fault.
    expect(status).toBe(409);
    expect(body.error).toBe("SOP_ALREADY_SIGNED");
    expect(body.message).toBe("You have already signed this version.");
  });

  test("and the common case is caught on the read, before an insert is even tried", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [{ ...PUBLISHED_DOC, requiresExam: false }]);
    script("hr_sop_readers", [{ id: 9, userId: "user-1" }]);
    script("users", ACCOUNT);
    script("hr_sop_acknowledgements", [{ id: 2 }]);

    const { status, body } = await call("POST", `${SOP}/documents/5/acknowledge`, { signatureName: "Tine Chiwese" });

    expect(status).toBe(409);
    expect(body.message).toBe("You have already signed this version.");
    expect(writesFor("hr_sop_acknowledgements")).toHaveLength(0);
  });
});

describe("another company's document does not exist here", () => {
  test("not on the edit path", async () => {
    script("hr_sop_documents", []);

    const { status } = await call("PUT", `${SOP}/documents/999`, { title: "Not mine" });

    expect(status).toBe(404);
    expect(writesFor("hr_sop_documents")).toHaveLength(0);
    // The lookup proves ownership by company as well as by id.
    expect(readSqlFor("hr_sop_documents")[0]).toContain('"hr_sop_documents"."company_id"');
    expect(readSqlFor("hr_sop_documents")[0]).toContain('"hr_sop_documents"."id"');
  });

  test("not on the read path, and a draft is invisible to a reader", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", []);
    const missing = await call("GET", `${SOP}/documents/999`);
    expect(missing.status).toBe(404);

    script("hr_sop_documents", [DRAFT_DOC]);
    const draftAsReader = await call("GET", `${SOP}/documents/7`);
    expect(draftAsReader.status).toBe(404);
    expect(draftAsReader.body).not.toHaveProperty("questions");
  });

  test("not on the child rows either: a question of another document cannot be deleted", async () => {
    script("hr_sop_documents", [DRAFT_DOC]);
    script("hr_sop_questions", []);

    const { status, body } = await call("DELETE", `${SOP}/documents/7/questions/4242`);

    expect(status).toBe(404);
    expect(body.message).toBe("Question not found for this document");
    expect(writesFor("hr_sop_questions")).toHaveLength(0);
    const childLookup = readSqlFor("hr_sop_questions")[0];
    expect(childLookup).toContain('"hr_sop_questions"."company_id"');
    expect(childLookup).toContain('"hr_sop_questions"."sop_id"');
  });

  test("and the coverage sheet is a management view", async () => {
    state.permissions = new Set(["payroll.view"]);
    script("hr_sop_documents", [PUBLISHED_DOC]);

    const { status, body } = await call("GET", `${SOP}/documents/5/coverage`);

    expect(status).toBe(403);
    expect(body.error).toBe("FORBIDDEN");
  });
});

describe("drafting a version", () => {
  test("a code already at version 1 is refused with the code and version named", async () => {
    script("hr_sop_documents", [{ id: 5 }]);

    const { status, body } = await call("POST", `${SOP}/documents`, {
      code: "FIN-PAY-01",
      title: "Month-end payroll close",
    });

    expect(status).toBe(409);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("FIN-PAY-01");
    expect(body.message).toContain("version 1");
    expect(writesFor("hr_sop_documents")).toHaveLength(0);
  });

  test("a department from another company is refused before the insert", async () => {
    script("departments", []);

    const { status, body } = await call("POST", `${SOP}/documents`, {
      code: "FIN-PAY-02",
      title: "Bank reconciliation",
      departmentId: 99,
    });

    expect(status).toBe(400);
    expect(body.message).toContain("does not belong to this company");
    expect(writesFor("hr_sop_documents")).toHaveLength(0);
  });

  test("a signature window of more than a year is rejected", async () => {
    const { status, body } = await call("POST", `${SOP}/documents`, {
      code: "FIN-PAY-03",
      title: "Petty cash",
      acknowledgementDays: 400,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(state.writes).toHaveLength(0);
  });

  test("an exam question with one option is not a question", async () => {
    const { status, body } = await call("POST", `${SOP}/documents/7/questions`, {
      question: "Only one choice?",
      options: ["just this"],
      correctIndex: 0,
    });

    expect(status).toBe(400);
    expect(body.message).toContain("at least 2 options");
    expect(state.writes).toHaveLength(0);
  });

  test("and a correctIndex outside the option list is refused", async () => {
    script("hr_sop_documents", [DRAFT_DOC]);
    script("hr_sop_questions", []);

    const { status, body } = await call("POST", `${SOP}/documents/7/questions`, {
      question: "Pick one",
      options: ["a", "b", "c"],
      correctIndex: 3,
    });

    expect(status).toBe(400);
    expect(body.message).toContain("one of the 3 options");
    expect(writesFor("hr_sop_questions")).toHaveLength(0);
  });

  test("a reader who is not a user of this company names the offenders", async () => {
    script("hr_sop_documents", [DRAFT_DOC]);
    // The guard's own membership read takes the first batch, the reader check the next.
    script("company_users", [{ role: "member" }], [{ userId: "user-1" }]);

    const { status, body } = await call("POST", `${SOP}/documents/7/readers`, {
      userIds: ["user-1", "user-404", "user-405"],
    });

    expect(status).toBe(400);
    expect(body.message).toContain("user-404");
    expect(body.message).toContain("user-405");
    expect(writesFor("hr_sop_readers")).toHaveLength(0);
  });

  test("an empty reader list saves, but publish refuses it", async () => {
    script("hr_sop_documents", [DRAFT_DOC]);

    const saved = await call("POST", `${SOP}/documents/7/readers`, { userIds: [] });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ readerCount: 0 });
    // The replace is one transaction: the old list goes, and nothing partial is left.
    expect(writesFor("hr_sop_readers").some((write: any) => write.op === "delete")).toBe(true);
  });

  test("a reissue is a new draft at the next version, with the questions copied forward", async () => {
    script(
      "hr_sop_documents",
      // the version being reissued, no open draft for the code, the highest version, the insert
      [PUBLISHED_DOC],
      [],
      [{ maxVersion: 2 }],
      [{ ...DRAFT_DOC, id: 9, version: 3 }],
    );
    // The source bank, then the copy lands in the new version's own rows.
    script("hr_sop_questions", questions(), []);

    const { status, body } = await call("POST", `${SOP}/documents/5/new-version`, {});

    expect(status).toBe(201);
    expect(body.id).toBe(9);
    const insert = writesFor("hr_sop_documents").find((write: any) => write.op === "insert");
    expect(insert?.values.version).toBe(3);
    expect(insert?.values.status).toBe("DRAFT");
    // A signature belongs to a version, so a new version starts with no date and no
    // publisher: it has not been agreed yet.
    expect(insert?.values.effectiveDate).toBeNull();
    expect(insert?.values.publishedAt).toBeUndefined();
    const questionCopy = writesFor("hr_sop_questions").find((write: any) => write.op === "insert");
    expect(Array.isArray(questionCopy?.values)).toBe(true);
    expect(questionCopy?.values).toHaveLength(5);
    expect(questionCopy?.values[0].sopId).toBe(9);
    expect(questionCopy?.values[0].correctIndex).toBe(1);
  });

  test("a second draft of a code that is already being drafted is refused", async () => {
    script("hr_sop_documents", [PUBLISHED_DOC], [{ id: 9, version: 3 }]);

    const { status, body } = await call("POST", `${SOP}/documents/5/new-version`, {});

    expect(status).toBe(409);
    expect(body.message).toContain("Version 3 of FIN-PAY-01 is already being drafted");
    expect(writesFor("hr_sop_documents").filter((write: any) => write.op === "insert")).toHaveLength(0);
  });
});

/**
 * The module is only worth having if the person on the shop floor can reach it. /sop is
 * mounted ahead of the payroll.view gate, so these are the branches that gate replaced:
 * a named reader with no payroll rights of any kind, and a stranger from another company.
 */
describe("a reader with no payroll permissions", () => {
  beforeEach(() => {
    state.permissions = new Set();
    state.membership = { role: "member" };
  });

  test("still sees the versions waiting on their signature", async () => {
    script("hr_sop_readers", [{
      id: 5,
      code: "FIN-PAY-01",
      title: "Month-end payroll close",
      category: "PAYROLL",
      version: 2,
      status: "PUBLISHED",
      effectiveDate: "2025-09-01",
      requiresExam: true,
      acknowledgementDays: 14,
      publishedAt: new Date("2025-09-02T08:00:00.000Z"),
      signedAt: null,
    }]);
    script("hr_sop_acknowledgements", []);

    const { status, body } = await call("GET", `${SOP}/my`);

    expect(status).toBe(200);
    expect(body.pending).toHaveLength(1);
    expect(body.pending[0].code).toBe("FIN-PAY-01");
    expect(body.signed).toHaveLength(0);
  });

  test("still opens the version they were named on, without the answer key", async () => {
    script("hr_sop_documents", [PUBLISHED_DOC]);
    script("hr_sop_questions", questions());
    script("hr_sop_readers", [{ userId: "user-1" }]);
    script("hr_sop_acknowledgements", []);

    const { status, body } = await call("GET", `${SOP}/documents/5`);

    expect(status).toBe(200);
    expect(body.document.title).toBe("Month-end payroll close");
    expect(body.questions[0].correctIndex).toBeUndefined();
    expect(body.questions[0].explanation).toBeUndefined();
  });

  test("is refused the library, where drafts and who-has-not-signed live", async () => {
    const { status, body } = await call("GET", `${SOP}/documents`);

    expect(status).toBe(403);
    expect(body.message).toContain("Payroll view permission required");
    expect(state.reads.filter((read) => read.table === "hr_sop_documents")).toHaveLength(0);
  });

  test("and an account that is not in this company is turned away before a read", async () => {
    state.membership = null;

    const { status, body } = await call("GET", `${SOP}/my`);

    expect(status).toBe(403);
    expect(body.message).toContain("not a member of this company");
    expect(state.reads.filter((read) => read.table === "hr_sop_readers")).toHaveLength(0);
  });
});
