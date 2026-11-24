/**
 * Stock take completion is addressed by id, but the id is not authority.
 * These tests render the predicates the completion path builds so a caller
 * cannot post another tenant's variance, and confirm the row is scoped again
 * when it is finally marked complete.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { products, stockTakeItems, stockTakes } from "@shared/schema";

const dialect = new PgDialect();
const render = (cond: any) => dialect.sqlToQuery(cond).sql;

const state = vi.hoisted(() => ({
  rows: new Map<string, any[][]>(),
  reads: [] as string[],
  updates: [] as { sql: string; values: any }[],
}));

function tableNameOf(table: any): string {
  return table?.[Symbol.for("drizzle:Name")] ?? String(table?.name ?? table);
}

function script(table: any, ...batches: any[][]) {
  state.rows.set(tableNameOf(table), batches);
}

function nextBatch(table: string): any[] {
  const queue = state.rows.get(table);
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
    from(target: any) {
      table = tableNameOf(target);
      return chain;
    },
    innerJoin(_target: any, cond: any) {
      state.reads.push(render(cond));
      return chain;
    },
    where(cond: any) {
      state.reads.push(render(cond));
      return thenableOf(nextBatch(table));
    },
    orderBy() { return chain; },
    limit() { return chain; },
    then(ok: any, err?: any) { return Promise.resolve(nextBatch(table)).then(ok, err); },
    catch(err: any) { return Promise.resolve(nextBatch(table)).catch(err); },
  };
  return chain;
}

function updateChain(table: string): any {
  const entry = { sql: "", values: undefined as any };
  state.updates.push(entry);
  const chain: any = {
    set(values: any) { entry.values = values; return chain; },
    where(cond: any) { entry.sql = render(cond); return chain; },
    returning() { return thenableOf(nextBatch(table)); },
    then(ok: any, err?: any) { return Promise.resolve(nextBatch(table)).then(ok, err); },
    catch(err: any) { return Promise.resolve(nextBatch(table)).catch(err); },
  };
  return chain;
}

function fakeDb(): any {
  return {
    select: vi.fn(() => selectChain()),
    update: vi.fn((table: any) => updateChain(tableNameOf(table))),
    insert: vi.fn(() => ({ values: () => ({ returning: () => thenableOf([]) }) })),
    transaction: vi.fn(async (fn: any) => fn(fakeDb())),
  };
}

vi.mock("../db.js", () => ({ db: fakeDb() }));

const { processStockTake } = await import("../lib/inventory.js");
const { storage } = await import("../storage.js");

beforeEach(() => {
  state.rows.clear();
  state.reads = [];
  state.updates = [];
});

describe("stock take completion", () => {
  test("an id owned by another company cannot be completed", async () => {
    script(stockTakes, []);

    await expect(processStockTake(9, 91, "u1")).rejects.toThrow(/not found for this company/i);

    expect(state.updates).toHaveLength(0);
    expect(state.reads[0]).toContain('"stock_takes"."company_id"');
  });

  test("the completion write is scoped and draft-only", async () => {
    script(stockTakes,
      [{ id: 9, companyId: 21, status: "draft", branchId: null }],
      [{ id: 9 }],
    );
    script(stockTakeItems, []);

    await processStockTake(9, 21, "u1");

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values.status).toBe("completed");
    expect(state.updates[0].sql).toContain('"stock_takes"."company_id"');
    expect(state.updates[0].sql).toContain('"stock_takes"."status"');
  });

  test("completion lines are restricted to the company's products", async () => {
    script(stockTakes,
      [{ id: 9, companyId: 21, status: "draft", branchId: null }],
      [{ id: 9 }],
    );
    script(stockTakeItems, []);

    await processStockTake(9, 21, "u1");

    expect(state.reads.some((sql) => sql.includes('"products"."company_id"'))).toBe(true);
  });
});

describe("stock take reads", () => {
  test("getStockTake scopes both the header and its products", async () => {
    script(stockTakes, [{ id: 9, companyId: 21, status: "draft" }]);
    script(stockTakeItems, []);

    await storage.getStockTake(9, 21);

    expect(state.reads[0]).toContain('"stock_takes"."company_id"');
    expect(state.reads.some((sql) => sql.includes('"products"."company_id"'))).toBe(true);
  });
});
