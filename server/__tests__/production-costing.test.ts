/**
 * Tests for the production costing engine (server/lib/productionCosting.ts).
 * The drizzle `db` module is fully mocked — no database required.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("../db.js", () => ({
  db: {
    query: {
      billOfMaterials: {},
      productionRuns: {},
      standardCosts: {},
      manufacturingRoutingOperations: {},
      goodsIssues: {},
      timeConfirmations: {},
    },
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

import { db } from "../db.js";
import {
  snapshotPlannedCosts,
  accumulateMaterialCost,
  accumulateLaborCost,
  calculateVariances,
  buildCostSummary,
} from "../lib/productionCosting.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  (db.update as any).mockImplementation(update);
  return { update, set, where };
}

function mockSelectRows(rows: any[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn(() => ({ where }));
  (db.select as any).mockImplementation(() => ({ from }));
  return { from, where };
}

const baseRun = {
  id: 1,
  companyId: 10,
  plannedMaterialCost: "100.00",
  plannedLaborCost: "50.00",
  plannedOverheadCost: "25.00",
  actualMaterialCost: "80.00",
  actualLaborCost: "40.00",
  actualOverheadCost: "30.00",
  varianceMaterial: null,
  varianceLabor: null,
  varianceOverhead: null,
};

// ---------------------------------------------------------------------------
// buildCostSummary (pure)
// ---------------------------------------------------------------------------

describe("buildCostSummary", () => {
  test("returns zeros for an empty run", () => {
    const s = buildCostSummary({
      plannedMaterialCost: null,
      plannedLaborCost: null,
      plannedOverheadCost: null,
      actualMaterialCost: null,
      actualLaborCost: null,
      actualOverheadCost: null,
      varianceMaterial: null,
      varianceLabor: null,
      varianceOverhead: null,
    });
    expect(s.planned.total).toBe(0);
    expect(s.actual.total).toBe(0);
    expect(s.variance.total).toBe(0);
    expect(s.variancePct.material).toBe(0);
  });

  test("computes totals and variance percentages", () => {
    const s = buildCostSummary({
      plannedMaterialCost: "100.00",
      plannedLaborCost: "50.00",
      plannedOverheadCost: "25.00",
      actualMaterialCost: "120.00",
      actualLaborCost: "45.00",
      actualOverheadCost: "30.00",
      varianceMaterial: "20.00",
      varianceLabor: "-5.00",
      varianceOverhead: "5.00",
    });
    expect(s.planned.total).toBe(175);
    expect(s.actual.total).toBe(195);
    expect(s.variance.total).toBe(20);
    expect(s.variancePct.material).toBe(20);
    expect(s.variancePct.labor).toBe(-10);
  });

  test("handles string-number edge cases gracefully", () => {
    const s = buildCostSummary({
      plannedMaterialCost: "abc",
      plannedLaborCost: "1,000",
      plannedOverheadCost: undefined as any,
      actualMaterialCost: "",
      actualLaborCost: null,
      actualOverheadCost: "10",
      varianceMaterial: null,
      varianceLabor: null,
      varianceOverhead: null,
    });
    expect(s.planned.material).toBe(0);
    expect(s.planned.total).toBe(1); // "abc" -> 0, "1,000" -> parseFloat stops at comma = 1
    expect(s.actual.overhead).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// snapshotPlannedCosts
// ---------------------------------------------------------------------------

describe("snapshotPlannedCosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns zeros when BOM is missing", async () => {
    (db.query.billOfMaterials as any).findFirst = vi.fn().mockResolvedValue(undefined);
    const result = await snapshotPlannedCosts(1, 999, null, 10);
    expect(result).toEqual({ materialCost: 0, laborCost: 0, overheadCost: 0 });
  });

  test("calculates material cost from standard costs, qty and scrap", async () => {
    (db.query.billOfMaterials as any).findFirst = vi.fn().mockResolvedValue({
      id: 5,
      companyId: 10,
      lines: [
        { id: 1, componentProductId: 100, quantity: "2", scrapPercentage: "10" },
        { id: 2, componentProductId: 200, quantity: "0.5", scrapPercentage: "0" },
      ],
    });
    (db.query.productionRuns as any).findFirst = vi.fn().mockResolvedValue({ id: 1, companyId: 10 });
    (db.query.standardCosts as any).findFirst = vi.fn(({ where }: any) => {
      // Resolve per component: product 100 -> 5.00, product 200 -> none
      return Promise.resolve(null);
    });
    // Mock per-call: first call returns standard cost for product 100, second returns undefined
    (db.query.standardCosts as any).findFirst
      .mockResolvedValueOnce({ materialCost: "5.00", laborCost: "1.00", overheadCost: "0.50" })
      .mockResolvedValueOnce(undefined);
    const { update, set, where } = mockUpdateChain();

    const result = await snapshotPlannedCosts(1, 5, null, 10);

    // component 1: 2 * 10 * 1.1 = 22 units * 5.00 = 110.00
    expect(result.materialCost).toBeCloseTo(110, 5);
    expect(result.laborCost).toBe(0);
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      plannedMaterialCost: "110.00",
      plannedLaborCost: "0.00",
      plannedOverheadCost: "0.00",
    });
    expect(where).toHaveBeenCalled();
  });

  test("calculates labor and overhead from routing operations", async () => {
    (db.query.billOfMaterials as any).findFirst = vi.fn().mockResolvedValue({
      id: 5,
      companyId: 10,
      lines: [],
    });
    (db.query.productionRuns as any).findFirst = vi.fn().mockResolvedValue({ id: 1, companyId: 10 });
    (db.query.manufacturingRoutingOperations as any).findMany = vi.fn().mockResolvedValue([
      {
        id: 1,
        cycleTimeMinutes: "6", // 6 min per unit -> 6*10/60 = 1 hour
        setupTimeMinutes: "60", // 1 hour setup
        workCenter: { costPerHour: "20.00", overheadRate: "5.00" },
      },
    ]);
    mockUpdateChain();

    const result = await snapshotPlannedCosts(1, 5, 3, 10);

    // totalHours = 1 + 1 = 2 -> labor 40, overhead 10
    expect(result.laborCost).toBeCloseTo(40, 5);
    expect(result.overheadCost).toBeCloseTo(10, 5);
  });
});

// ---------------------------------------------------------------------------
// accumulateMaterialCost
// ---------------------------------------------------------------------------

describe("accumulateMaterialCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sums issues and subtracts returns", async () => {
    (db.query.goodsIssues as any).findMany = vi.fn().mockResolvedValue([
      { type: "ISSUE", totalCost: "50.00" },
      { type: "ISSUE", totalCost: "25.00" },
      { type: "RETURN", totalCost: "10.00" },
    ]);
    const { set, where } = mockUpdateChain();

    const total = await accumulateMaterialCost(1);

    expect(total).toBe(65);
    expect(set).toHaveBeenCalledWith({ actualMaterialCost: "65.00" });
    expect(where).toHaveBeenCalled();
  });

  test("returns 0 with no issues", async () => {
    (db.query.goodsIssues as any).findMany = vi.fn().mockResolvedValue([]);
    mockUpdateChain();
    expect(await accumulateMaterialCost(1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// accumulateLaborCost
// ---------------------------------------------------------------------------

describe("accumulateLaborCost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sums labor and overhead from time confirmations", async () => {
    (db.query.timeConfirmations as any).findMany = vi.fn().mockResolvedValue([
      { laborCost: "30.00", overheadCost: "5.00" },
      { laborCost: "12.50", overheadCost: "2.50" },
    ]);
    const { set } = mockUpdateChain();

    const result = await accumulateLaborCost(1);

    expect(result).toEqual({ laborCost: 42.5, overheadCost: 7.5 });
    expect(set).toHaveBeenCalledWith({
      actualLaborCost: "42.50",
      actualOverheadCost: "7.50",
    });
  });
});

// ---------------------------------------------------------------------------
// calculateVariances
// ---------------------------------------------------------------------------

describe("calculateVariances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("variance = actual - planned, expenses folded into overhead", async () => {
    (db.query.productionRuns as any).findFirst = vi.fn().mockResolvedValue(baseRun);
    (db.query.timeConfirmations as any).findMany = vi.fn().mockResolvedValue([
      { laborCost: "40.00", overheadCost: "20.00" },
    ]);
    mockSelectRows([{ amount: "10.00" }]); // expenses
    const { set } = mockUpdateChain();

    const v = await calculateVariances(1);

    expect(v.varianceMaterial).toBe(-20); // 80 - 100
    expect(v.varianceLabor).toBe(-10); // 40 - 50
    expect(v.varianceOverhead).toBe(5); // (20 + 10) - 25
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        actualOverheadCost: "30.00",
        varianceMaterial: "-20.00",
        varianceLabor: "-10.00",
        varianceOverhead: "5.00",
      })
    );
  });

  test("returns zeros for a missing run", async () => {
    (db.query.productionRuns as any).findFirst = vi.fn().mockResolvedValue(undefined);
    expect(await calculateVariances(999)).toEqual({
      varianceMaterial: 0,
      varianceLabor: 0,
      varianceOverhead: 0,
    });
  });
});
