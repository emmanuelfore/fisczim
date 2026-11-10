/**
 * Tenant scope on the money paths.
 *
 * Bank reconciliation and the chart of accounts are addressed by row id, and a
 * statement line has no company column at all — ownership is only provable by
 * joining through its statement. These tests render the queries the storage layer
 * builds and assert that predicate is present, and that a rejected lookup performs
 * no write. Nothing here touches a database, so no real tenant's books can change.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = {
  selects: [] as { sql: string; rows: any[] }[],
  updates: [] as string[],
  queue: [] as any[],
};

const dialect = new PgDialect();

function renderWhere(cond: any): string {
  return dialect.sqlToQuery(cond).sql;
}

function nextRows() {
  return state.queue.shift() ?? [];
}

function thenableOf(rows: any[]) {
  const chain: any = {
    limit: () => chain,
    offset: () => chain,
    for: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    then: (onOk: any, onErr?: any) => Promise.resolve(rows).then(onOk, onErr),
    catch: (onErr: any) => Promise.resolve(rows).catch(onErr),
  };
  return chain;
}

// Every read is recorded with the SQL its WHERE clause renders to, then answered
// from the scripted queue, so a test controls exactly which row exists for whom.
function queryChain(): any {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    having: () => chain,
    where: (cond: any) => {
      const rows = nextRows();
      state.selects.push({ sql: renderWhere(cond), rows });
      return thenableOf(rows);
    },
  };
  return chain;
}

const selectMock = () => queryChain();

const updateMock = () => ({
  set: () => {
    const chain: any = {
      // An UPDATE ... FROM is how a ledger entry gets proved to be this company's, so the
      // chain has to survive the from() the storage layer hangs off it.
      from: () => chain,
      where: (cond: any) => {
        state.updates.push(renderWhere(cond));
        return chain;
      },
      returning: () => thenableOf([]),
    };
    return chain;
  },
});

vi.mock("../db.js", () => ({
  db: {
    select: vi.fn(() => selectMock()),
    update: vi.fn(() => updateMock()),
    insert: vi.fn(() => ({ values: () => ({ returning: () => thenableOf([]) }) })),
    transaction: vi.fn((fn: any) => fn({ select: () => selectMock(), update: () => updateMock() })),
  },
}));

import { storage } from "../storage.js";

beforeEach(() => {
  state.selects = [];
  state.updates = [];
  state.queue = [];
});

describe("statement lines are only readable by the company owning the statement", () => {
  test("a line request for someone else's statement reads nothing, not even the lines", async () => {
    state.queue = [[]]; // the ownership probe finds no statement for this company

    const lines = await storage.getBankStatementLines(99, 7);

    expect(lines).toEqual([]);
    expect(state.selects).toHaveLength(1);
    expect(state.selects[0].sql).toContain('"company_id"');
  });

  test("the owning company still gets its lines", async () => {
    state.queue = [[{ id: 7 }], [{ id: 1, amount: "10.00" }]];

    const lines = await storage.getBankStatementLines(12, 7);

    expect(lines).toEqual([{ id: 1, amount: "10.00" }]);
    expect(state.selects).toHaveLength(2);
    expect(state.selects[1].sql).toContain('"statement_id"');
  });
});

describe("chart of accounts reads are company scoped", () => {
  test("getAccountById filters on both the id and the company", async () => {
    state.queue = [[]];

    await storage.getAccountById(12, 5);

    expect(state.selects).toHaveLength(1);
    expect(state.selects[0].sql).toContain('"accounts"."id"');
    expect(state.selects[0].sql).toContain('"accounts"."company_id"');
  });
});

describe("manual bank reconciliation writes nothing it cannot justify", () => {
  test("a line from another tenant's statement is refused before any update", async () => {
    state.queue = [[]]; // line probe finds nothing owned by this company

    await expect(storage.reconcileBankLine(99, 4, 5)).rejects.toThrow(/not found for this company/i);
    expect(state.updates).toHaveLength(0);
  });

  test("a ledger entry from another tenant is refused before any update", async () => {
    state.queue = [[{ accountId: 5 }], []];

    await expect(storage.reconcileBankLine(12, 4, 5)).rejects.toThrow(/Ledger entry not found/i);
    expect(state.updates).toHaveLength(0);
  });

  test("the ledger entry is proved company-owned through its journal, not a column it does not have", async () => {
    state.queue = [[{ accountId: 5 }], []];

    await expect(storage.reconcileBankLine(12, 4, 5)).rejects.toThrow();
    expect(state.selects[1].sql).toContain('"journal_entries"."company_id"');
  });

  test("matching into a different bank account is refused", async () => {
    state.queue = [[{ accountId: 5 }], [{ accountId: 9 }]];

    await expect(storage.reconcileBankLine(12, 4, 5)).rejects.toThrow(/different bank account/i);
    expect(state.updates).toHaveLength(0);
  });

  test("a legitimate match still writes both sides", async () => {
    state.queue = [[{ accountId: 5 }], [{ accountId: 5 }]];

    await storage.reconcileBankLine(12, 4, 5);

    expect(state.updates).toHaveLength(2);
    expect(state.updates[0]).toContain('"id"');
  });

  test("clearing the ledger line names the company, because 692 ledger ids are shared", async () => {
    state.queue = [[{ accountId: 5 }], [{ accountId: 5 }]];

    await storage.reconcileBankLine(12, 4, 5);

    // ledger_entries has no primary key in the live database and an id can belong to two
    // tenants, so the write reaches the entry through the journal entry that says whose it is.
    expect(state.updates[1]).toContain('"ledger_entries"."id"');
    expect(state.updates[1]).toContain('"journal_entries"."company_id"');
  });
});

describe("auto-reconciliation is bounded to the caller's statement", () => {
  test("someone else's statement is refused before it can mark their lines cleared", async () => {
    state.queue = [[]];

    await expect(storage.autoReconcile(99, 7)).rejects.toThrow(/not found for this company/i);
    expect(state.updates).toHaveLength(0);
  });

  test("the statement probe is company scoped", async () => {
    state.queue = [[]];

    await expect(storage.autoReconcile(99, 7)).rejects.toThrow();
    expect(state.selects[0].sql).toContain('"company_id"');
  });
});
