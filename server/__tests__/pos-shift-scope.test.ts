/**
 * A POS shift id does not identify a shift.
 *
 * `pos_shifts` has no primary key in the live database — migrations/0084 had to leave it
 * out because companies 21 and 91 both hold a shift with id 1 — so every query that
 * addresses a shift by id alone can read, or write, another tenant's row. These tests
 * render the SQL the shift helpers and the company resolver actually build and assert the
 * owning company is in it, plus that a refusal performs no write at all. Nothing connects
 * to a database, so no real till's books can change.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const render = (cond: any) => dialect.sqlToQuery(cond).sql;

const state = {
  reads: [] as string[],
  writes: [] as { sql: string; values: any }[],
  queue: [] as any[],
  memberships: [] as any[],
};

const nextRows = () => state.queue.shift() ?? [];

function thenableOf(rows: any[]) {
  const chain: any = {
    limit: () => chain,
    offset: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    for: () => chain,
    then: (onOk: any, onErr?: any) => Promise.resolve(rows).then(onOk, onErr),
    catch: (onErr: any) => Promise.resolve(rows).catch(onErr),
  };
  return chain;
}

function selectChain(): any {
  const chain: any = {
    from: () => chain,
    // A join predicate carries its own scoping, so record it like a WHERE: ownership
    // proved in the ON clause is as binding as one proved in the filter.
    innerJoin: (_table: any, cond: any) => {
      state.reads.push(render(cond));
      return chain;
    },
    leftJoin: (_table: any, cond: any) => {
      state.reads.push(render(cond));
      return chain;
    },
    having: () => chain,
    where: (cond: any) => {
      state.reads.push(render(cond));
      return thenableOf(nextRows());
    },
  };
  return chain;
}

function updateChain(): any {
  let matched: any[] = [];
  return {
    set: (values: any) => {
      const chain: any = {
        from: () => chain,
        where: (cond: any) => {
          state.writes.push({ sql: render(cond), values });
          matched = nextRows();
          return chain;
        },
        returning: () => thenableOf(matched),
      };
      return chain;
    },
  };
}

vi.mock("../db.js", () => {
  const query = {
    posShifts: {
      findFirst: vi.fn(async ({ where }: any = {}) => {
        state.reads.push(render(where));
        return nextRows()[0];
      }),
    },
  };

  return {
    db: {
      select: vi.fn(() => selectChain()),
      update: vi.fn(() => updateChain()),
      insert: vi.fn(() => ({ values: (v: any) => {
        state.writes.push({ sql: "INSERT", values: v });
        return { returning: () => thenableOf([{ id: 1, companyId: 21 }]) };
      } })),
      query,
      transaction: vi.fn((fn: any) => fn({
        select: () => selectChain(),
        insert: vi.fn(() => ({ values: (v: any) => {
          state.writes.push({ sql: "INSERT", values: v });
          return { returning: () => thenableOf([{ id: 5 }]) };
        } })),
        update: vi.fn(() => updateChain()),
        query,
      })),
    },
  };
});

// checkCompanyAccess() and getCompanies() are the two membership facts the resolver needs;
// scripting them keeps this about tenancy rather than about the users table.
vi.mock("../storage.js", () => ({
  storage: {
    getCompanies: vi.fn(async () => state.memberships),
    getCompany: vi.fn(async (id: number) => ({ id, name: `co-${id}`, cfg1: true })),
  },
}));

import { endPosShift, addPosTransaction, getShiftTransactions } from "../lib/pos.js";
import { resolveShiftCompanyId } from "../lib/pos-scope.js";

beforeEach(() => {
  state.reads = [];
  state.writes = [];
  state.queue = [];
  state.memberships = [{ id: 21, role: "cashier" }];
});

describe("closing a shift writes one tenant's row", () => {
  test("the update is filtered on the company the caller is acting for", async () => {
    state.queue = [[{ id: 1, companyId: 21 }]];

    await endPosShift(1, 21, 250, "closing", "sup-1");

    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].sql).toContain('"pos_shifts"."id"');
    expect(state.writes[0].sql).toContain('"pos_shifts"."company_id"');
  });

  test("a shift belonging to another company is not returned, so the caller gets nothing to echo", async () => {
    state.queue = [[]]; // no row matches id + company

    const shift = await endPosShift(1, 21, 250);

    expect(shift).toBeUndefined();
    expect(state.writes[0].sql).toContain('"pos_shifts"."company_id"');
  });
});

describe("drawer activity is only visible to the company that owns the shift", () => {
  test("payouts are read through the shift with its company attached", async () => {
    state.queue = [[]];

    await getShiftTransactions(1, 21);

    const [join, filter] = state.reads;
    expect(join).toContain('"pos_shifts"."company_id"');
    expect(filter).toContain('"pos_shift_transactions"."shift_id"');
  });

  test("a payout against another company's shift is refused before anything is written", async () => {
    state.queue = [[]]; // the company-scoped shift lookup finds nothing

    await expect(addPosTransaction(1, 21, "cashier-1", "PAYOUT", 40, "float top-up")).rejects.toThrow(/Shift not found/i);
    expect(state.writes).toHaveLength(0);
  });

  test("a payout on the caller's own shift still records the expense", async () => {
    state.queue = [[{ id: 1, companyId: 21, userId: "cashier-1" }], [{ currency: "USD", country: "Zimbabwe" }]];

    const transaction = await addPosTransaction(1, 21, "cashier-1", "PAYOUT", 40, "float top-up");

    expect(transaction).toBeTruthy();
    expect(state.reads[0]).toContain('"pos_shifts"."company_id"');
    expect(state.writes.map((w) => w.values.category)).toContain("POS Payout");
  });
});

describe("the company a shift route acts for", () => {
  const reqFor = (over: any = {}) => ({
    user: { id: "cashier-1", isSuperAdmin: false },
    params: {},
    query: {},
    body: {},
    headers: {},
    ...over,
  });

  test("a company named by the caller is used when they belong to it", async () => {
    expect(await resolveShiftCompanyId(reqFor({ query: { companyId: "21" } }), 1)).toBe(21);
  });

  test("naming someone else's company earns nothing, not even a lookup of their shift", async () => {
    state.memberships = [{ id: 21, role: "cashier" }];

    expect(await resolveShiftCompanyId(reqFor({ body: { companyId: "91" } }), 1)).toBeUndefined();
    expect(state.reads).toHaveLength(0);
  });

  test("the web client's X-Company-ID header is honoured", async () => {
    expect(await resolveShiftCompanyId(reqFor({ headers: { "x-company-id": "21" } }), 1)).toBe(21);
  });

  test("an API key cannot be pointed at a company other than its own", async () => {
    const req = reqFor({ headers: { "x-company-id": "91" }, apiKeyCompanyId: 21 });

    expect(await resolveShiftCompanyId(req, 1)).toBeUndefined();
  });

  test("with nothing named, one owned shift decides the company", async () => {
    state.queue = [[{ companyId: 21 }]];

    expect(await resolveShiftCompanyId(reqFor(), 1)).toBe(21);
    expect(state.reads[0]).toContain('"pos_shifts"."company_id"');
  });

  test("with nothing named and two of the caller's companies holding that id, it is refused", async () => {
    state.memberships = [{ id: 21, role: "cashier" }, { id: 91, role: "cashier" }];
    state.queue = [[{ companyId: 21 }, { companyId: 91 }]];

    expect(await resolveShiftCompanyId(reqFor(), 1)).toBeUndefined();
  });

  test("an unauthenticated caller has no company", async () => {
    const req = reqFor({ user: undefined });

    expect(await resolveShiftCompanyId(req, 1)).toBeUndefined();
    expect(state.reads).toHaveLength(0);
  });
});
