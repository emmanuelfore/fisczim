/**
 * Quotation money is recomputed from tenant-owned catalogue data, never from
 * the totals in the request. The real storage methods run against a table-
 * scripted fake db so the assertions cover the rows actually handed to Drizzle.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

import { products, quotationItems, quotations, taxTypes } from "@shared/schema";

const state = vi.hoisted(() => ({
  rows: new Map<string, any[][]>(),
  writes: [] as Array<{ op: string; table: string; values: any }>,
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
    where() { return chain; },
    orderBy() { return chain; },
    limit() { return chain; },
    then(ok: any, err?: any) { return Promise.resolve(nextBatch(table)).then(ok, err); },
    catch(err: any) { return Promise.resolve(nextBatch(table)).catch(err); },
  };
  return chain;
}

function writeChain(table: string, op: string): any {
  const entry = { op, table, values: undefined as any };
  state.writes.push(entry);
  const chain: any = {
    values(values: any) { entry.values = values; return chain; },
    set(values: any) { entry.values = values; return chain; },
    where() { return chain; },
    returning() { return thenableOf(nextBatch(table)); },
    then(ok: any, err?: any) { return Promise.resolve(nextBatch(table)).then(ok, err); },
    catch(err: any) { return Promise.resolve(nextBatch(table)).catch(err); },
  };
  return chain;
}

function fakeDb(): any {
  return {
    select: vi.fn(() => selectChain()),
    insert: vi.fn((table: any) => writeChain(tableNameOf(table), "insert")),
    update: vi.fn((table: any) => writeChain(tableNameOf(table), "update")),
    delete: vi.fn((table: any) => writeChain(tableNameOf(table), "delete")),
    transaction: vi.fn(async (fn: any) => fn(fakeDb())),
  };
}

vi.mock("../db.js", () => ({ db: fakeDb() }));

const { storage } = await import("../storage.js");

beforeEach(() => {
  state.rows.clear();
  state.writes = [];
});

const quotationInput = {
  companyId: 21,
  customerId: 3,
  status: "draft",
  taxInclusive: false,
  subtotal: "1.00",
  taxAmount: "0.00",
  total: "1.00",
  items: [{
    productId: 11,
    description: "Generator",
    quantity: "2",
    unitPrice: "10.00",
    taxRate: "0",
    taxTypeId: 4,
    lineTotal: "1.00",
  }],
};

describe("quotation capture", () => {
  test("a product from another tenant is refused before any insert", async () => {
    script(products, []);

    await expect(storage.createQuotation(quotationInput as any)).rejects.toThrow(/does not belong to this company/i);
    expect(state.writes).toHaveLength(0);
  });

  test("client totals and tax rates are replaced by company-owned values", async () => {
    script(products, [{ id: 11, taxRate: "15.50", taxTypeId: 4 }]);
    script(taxTypes, [{ id: 4, rate: "15.50" }]);
    script(quotations, [], [{ id: 9, quotationNumber: "QT-001" }]);
    script(quotationItems, [{}]);

    await storage.createQuotation(quotationInput as any);

    const header = state.writes.find(w => w.table === tableNameOf(quotations) && w.op === "insert");
    const line = state.writes.find(w => w.table === tableNameOf(quotationItems) && w.op === "insert");
    expect(header?.values).toMatchObject({
      subtotal: "20.00",
      taxAmount: "3.10",
      total: "23.10",
    });
    expect(line?.values).toEqual([expect.objectContaining({
      quantity: "2",
      unitPrice: "10.00",
      taxRate: "15.50",
      lineTotal: "20.00",
    })]);
  });
});

describe("approved quotations are immutable", () => {
  test("a commercial edit is refused inside the storage transaction", async () => {
    script(quotations, [{ id: 9, companyId: 21, status: "approved" }]);

    await expect(storage.updateQuotation(9, { items: quotationInput.items } as any))
      .rejects.toThrow(/can no longer be edited/i);
    expect(state.writes.filter(w => w.op === "update")).toHaveLength(0);
  });
});
