/**
 * Production Costing Service
 *
 * Handles all cost calculation logic for production runs:
 * - Snapshot planned costs at creation (from standard_costs + routing)
 * - Accumulate actual costs from goods issues and time confirmations
 * - Calculate variances on completion
 * - Post variance GL entries on settlement
 */

import { db } from "../db";
import {
  productionRuns,
  standardCosts,
  billOfMaterials,
  bomLines,
  manufacturingRoutingOperations,
  manufacturingWorkCenters,
  goodsIssues,
  timeConfirmations,
  accounts,
  journalEntries,
  ledgerEntries,
} from "../../shared/schema";
import { eq, and, isNull, lte, or } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Planned Cost Snapshot
// ---------------------------------------------------------------------------

/**
 * Calculates and snapshots planned costs onto a production run at creation.
 * Sources:
 *   - Material: standard_costs.material_cost × BOM quantity for each component
 *   - Labor:    routing operation × work_center.cost_per_hour × cycle time
 *   - Overhead: routing operation × work_center.overhead_rate × cycle time
 */
export async function snapshotPlannedCosts(
  productionRunId: number,
  bomId: number,
  routingId: number | null | undefined,
  plannedQty: number
): Promise<{ materialCost: number; laborCost: number; overheadCost: number }> {
  // Get BOM lines
  const bom = await db.query.billOfMaterials.findFirst({
    where: eq(billOfMaterials.id, bomId),
    with: { lines: true },
  });

  if (!bom) return { materialCost: 0, laborCost: 0, overheadCost: 0 };

  const run = await db.query.productionRuns.findFirst({
    where: eq(productionRuns.id, productionRunId),
  });
  if (!run) return { materialCost: 0, laborCost: 0, overheadCost: 0 };

  const today = new Date().toISOString().split("T")[0];

  // --- Material cost: sum standard_cost × BOM qty × planned qty ---
  let materialCost = 0;
  for (const line of bom.lines) {
    const stdCost = await db.query.standardCosts.findFirst({
      where: and(
        eq(standardCosts.companyId, run.companyId),
        eq(standardCosts.productId, line.componentProductId),
        lte(standardCosts.effectiveFrom, today),
        or(isNull(standardCosts.effectiveTo), lte(standardCosts.effectiveTo, today))
      ),
    });
    if (stdCost) {
      const componentQty =
        parseFloat(line.quantity) *
        plannedQty *
        (1 + parseFloat(line.scrapPercentage) / 100);
      materialCost += parseFloat(stdCost.materialCost) * componentQty;
    }
  }

  // --- Labor + Overhead cost: sum routing operations ---
  let laborCost = 0;
  let overheadCost = 0;
  if (routingId) {
    const operations = await db.query.manufacturingRoutingOperations.findMany({
      where: eq(manufacturingRoutingOperations.routingId, routingId),
      with: { workCenter: true },
    });
    for (const op of operations) {
      if (!op.workCenter) continue;
      // cycle_time_minutes is per unit; convert to hours
      const cycleHours = (parseFloat(op.cycleTimeMinutes) * plannedQty) / 60;
      const setupHours = parseFloat(op.setupTimeMinutes) / 60;
      const totalHours = cycleHours + setupHours;
      laborCost += parseFloat(op.workCenter.costPerHour) * totalHours;
      overheadCost += parseFloat(op.workCenter.overheadRate) * totalHours;
    }
  }

  // Persist snapshot onto production run
  await db
    .update(productionRuns)
    .set({
      plannedMaterialCost: materialCost.toFixed(2),
      plannedLaborCost: laborCost.toFixed(2),
      plannedOverheadCost: overheadCost.toFixed(2),
    })
    .where(eq(productionRuns.id, productionRunId));

  return { materialCost, laborCost, overheadCost };
}

// ---------------------------------------------------------------------------
// Actual Cost Accumulation
// ---------------------------------------------------------------------------

/**
 * Re-calculates actual_material_cost from all goods_issues for a production run.
 * Called after each goods issue posting.
 */
export async function accumulateMaterialCost(productionRunId: number): Promise<number> {
  const issues = await db.query.goodsIssues.findMany({
    where: and(eq(goodsIssues.productionRunId, productionRunId)),
  });
  const total = issues.reduce((sum, issue) => {
    // Return lines (type === 'RETURN') should reduce cost
    const sign = issue.type === "RETURN" ? -1 : 1;
    return sum + sign * parseFloat(issue.totalCost ?? "0");
  }, 0);

  await db
    .update(productionRuns)
    .set({ actualMaterialCost: total.toFixed(2) })
    .where(eq(productionRuns.id, productionRunId));

  return total;
}

/**
 * Re-calculates actual_labor_cost and actual_overhead_cost from all
 * time_confirmations for a production run.
 * Called after each time confirmation posting.
 */
export async function accumulateLaborCost(
  productionRunId: number
): Promise<{ laborCost: number; overheadCost: number }> {
  const confirmations = await db.query.timeConfirmations.findMany({
    where: eq(timeConfirmations.productionRunId, productionRunId),
  });

  const laborCost = confirmations.reduce(
    (sum, tc) => sum + parseFloat(tc.laborCost ?? "0"),
    0
  );
  const overheadCost = confirmations.reduce(
    (sum, tc) => sum + parseFloat(tc.overheadCost ?? "0"),
    0
  );

  await db
    .update(productionRuns)
    .set({
      actualLaborCost: laborCost.toFixed(2),
      actualOverheadCost: overheadCost.toFixed(2),
    })
    .where(eq(productionRuns.id, productionRunId));

  return { laborCost, overheadCost };
}

// ---------------------------------------------------------------------------
// Variance Calculation (called on COMPLETE)
// ---------------------------------------------------------------------------

/**
 * Calculates variances = actual - planned and persists them.
 * Returns the variance breakdown.
 */
export async function calculateVariances(productionRunId: number): Promise<{
  varianceMaterial: number;
  varianceLabor: number;
  varianceOverhead: number;
}> {
  const { expenses } = await import("@shared/schema.js");
  const run = await db.query.productionRuns.findFirst({
    where: eq(productionRuns.id, productionRunId),
  });
  if (!run) return { varianceMaterial: 0, varianceLabor: 0, varianceOverhead: 0 };

  // Sum ad-hoc expenses
  const runExpenses = await db.select().from(expenses).where(eq(expenses.productionRunId, productionRunId));
  const expenseTotal = runExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount ?? "0"), 0);

  // Get clean labor & overhead from time confirmations
  const { laborCost, overheadCost } = await accumulateLaborCost(productionRunId);

  // We add the expenseTotal into the actual overhead cost for the variance calculation
  const totalActualOverhead = overheadCost + expenseTotal;

  const varianceMaterial =
    parseFloat(run.actualMaterialCost ?? "0") -
    parseFloat(run.plannedMaterialCost ?? "0");
  const varianceLabor =
    parseFloat(run.actualLaborCost ?? "0") -
    parseFloat(run.plannedLaborCost ?? "0");
  const varianceOverhead =
    totalActualOverhead -
    parseFloat(run.plannedOverheadCost ?? "0");

  await db
    .update(productionRuns)
    .set({
      actualOverheadCost: totalActualOverhead.toFixed(2),
      varianceMaterial: varianceMaterial.toFixed(2),
      varianceLabor: varianceLabor.toFixed(2),
      varianceOverhead: varianceOverhead.toFixed(2),
    })
    .where(eq(productionRuns.id, productionRunId));

  return { varianceMaterial, varianceLabor, varianceOverhead };
}

// ---------------------------------------------------------------------------
// Cost Summary (for API/UI)
// ---------------------------------------------------------------------------

export interface CostSummary {
  planned: { material: number; labor: number; overhead: number; total: number };
  actual: { material: number; labor: number; overhead: number; total: number };
  variance: { material: number; labor: number; overhead: number; total: number };
  variancePct: { material: number; labor: number; overhead: number; total: number };
}

export function buildCostSummary(run: {
  plannedMaterialCost: string | null;
  plannedLaborCost: string | null;
  plannedOverheadCost: string | null;
  actualMaterialCost: string | null;
  actualLaborCost: string | null;
  actualOverheadCost: string | null;
  varianceMaterial: string | null;
  varianceLabor: string | null;
  varianceOverhead: string | null;
}): CostSummary {
  const pMat = parseFloat(run.plannedMaterialCost ?? "0");
  const pLab = parseFloat(run.plannedLaborCost ?? "0");
  const pOvh = parseFloat(run.plannedOverheadCost ?? "0");
  const pTot = pMat + pLab + pOvh;

  const aMat = parseFloat(run.actualMaterialCost ?? "0");
  const aLab = parseFloat(run.actualLaborCost ?? "0");
  const aOvh = parseFloat(run.actualOverheadCost ?? "0");
  const aTot = aMat + aLab + aOvh;

  const vMat = parseFloat(run.varianceMaterial ?? "0");
  const vLab = parseFloat(run.varianceLabor ?? "0");
  const vOvh = parseFloat(run.varianceOverhead ?? "0");
  const vTot = vMat + vLab + vOvh;

  const safePct = (v: number, p: number) => (p === 0 ? 0 : Math.round((v / p) * 10000) / 100);

  return {
    planned: { material: pMat, labor: pLab, overhead: pOvh, total: pTot },
    actual: { material: aMat, labor: aLab, overhead: aOvh, total: aTot },
    variance: { material: vMat, labor: vLab, overhead: vOvh, total: vTot },
    variancePct: {
      material: safePct(vMat, pMat),
      labor: safePct(vLab, pLab),
      overhead: safePct(vOvh, pOvh),
      total: safePct(vTot, pTot),
    },
  };
}
