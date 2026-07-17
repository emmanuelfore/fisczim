import { db } from "../db.js";
import { eq, and, sql } from "drizzle-orm";
import {
  productionRuns,
  billOfMaterials,
  bomItems,
  manufacturingRoutings,
  manufacturingRoutingOperations,
  manufacturingWorkCenters,
  standardCosts,
  manufacturingMaterialTransactions,
  timeConfirmations,
  products,
} from "../../shared/schema.js";

/**
 * Snapshot planned costs for a production run at creation time
 * Calculates planned material, labor, and overhead costs from BOM, routing, and standard costs
 * For SIMPLE type: Skip BOM logic, planned costs are zero (manual tracking)
 */
export async function snapshotPlannedCosts(productionRunId, bomId, routingId) {
  try {
    const run = await db.select().from(productionRuns).where(eq(productionRuns.id, productionRunId)).limit(1);
    if (!run.length) throw new Error("Production run not found");

    // For SIMPLE type, skip BOM costing - costs are tracked manually via material transactions
    if (run[0].type === "SIMPLE") {
      await db
        .update(productionRuns)
        .set({
          plannedMaterialCost: "0",
          plannedLaborCost: "0",
          plannedOverheadCost: "0",
        })
        .where(eq(productionRuns.id, productionRunId));

      return {
        plannedMaterialCost: 0,
        plannedLaborCost: 0,
        plannedOverheadCost: 0,
        totalPlannedCost: 0,
      };
    }

    const plannedQty = Number(run[0].plannedQuantity);
    let plannedMaterialCost = 0;
    let plannedLaborCost = 0;
    let plannedOverheadCost = 0;

    // Calculate planned material cost from BOM
    if (bomId) {
      const bomLines = await db
        .select({ line: bomItems, product: products })
        .from(bomItems)
        .leftJoin(products, eq(bomItems.componentProductId, products.id))
        .where(eq(bomItems.bomId, bomId));

      for (const { line, product } of bomLines) {
        const qtyNeeded = Number(line.quantity) * plannedQty;
        const scrapFactor = 1 + (Number(line.scrapPercentage || 0) / 100);
        const actualQty = qtyNeeded * scrapFactor;
        
        // Use standard cost if available, otherwise product cost price
        const [stdCost] = await db
          .select()
          .from(standardCosts)
          .where(and(
            eq(standardCosts.productId, line.componentProductId),
            eq(standardCosts.companyId, run[0].companyId)
          ))
          .limit(1);

        const unitCost = stdCost ? Number(stdCost.materialCost) : Number(product?.costPrice || 0);
        plannedMaterialCost += actualQty * unitCost;
      }
    }

    // Calculate planned labor and overhead costs from routing
    if (routingId) {
      const operations = await db
        .select({ op: manufacturingRoutingOperations, wc: manufacturingWorkCenters })
        .from(manufacturingRoutingOperations)
        .leftJoin(manufacturingWorkCenters, eq(manufacturingRoutingOperations.workCenterId, manufacturingWorkCenters.id))
        .where(eq(manufacturingRoutingOperations.routingId, routingId))
        .orderBy(manufacturingRoutingOperations.sequence);

      for (const { op, wc } of operations) {
        const setupTime = Number(op.setupTimeMinutes || 0) / 60; // Convert to hours
        const cycleTime = Number(op.cycleTimeMinutes || 0) / 60;
        const totalHours = setupTime + (cycleTime * plannedQty);
        
        const hourlyRate = Number(wc?.hourlyRate || 0);
        const overheadRate = Number(wc?.overheadRate || 0);

        plannedLaborCost += totalHours * hourlyRate;
        plannedOverheadCost += totalHours * overheadRate;
      }
    }

    // Update production run with planned costs
    await db
      .update(productionRuns)
      .set({
        plannedMaterialCost: plannedMaterialCost.toFixed(2),
        plannedLaborCost: plannedLaborCost.toFixed(2),
        plannedOverheadCost: plannedOverheadCost.toFixed(2),
      })
      .where(eq(productionRuns.id, productionRunId));

    return {
      plannedMaterialCost,
      plannedLaborCost,
      plannedOverheadCost,
      totalPlannedCost: plannedMaterialCost + plannedLaborCost + plannedOverheadCost,
    };
  } catch (error) {
    console.error("Error snapshotting planned costs:", error);
    throw error;
  }
}

/**
 * Accumulate actual material costs from material transactions
 * Called when materials are issued to a production run
 */
export async function accumulateMaterialCost(productionRunId) {
  try {
    // Sum all ISSUE transactions for this production run
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(${manufacturingMaterialTransactions.quantity}::numeric * ${manufacturingMaterialTransactions.unitCost}::numeric), 0)` })
      .from(manufacturingMaterialTransactions)
      .where(and(
        eq(manufacturingMaterialTransactions.productionRunId, productionRunId),
        eq(manufacturingMaterialTransactions.type, "ISSUE")
      ));

    const actualMaterialCost = Number(result?.total || 0);

    await db
      .update(productionRuns)
      .set({ actualMaterialCost: actualMaterialCost.toFixed(2) })
      .where(eq(productionRuns.id, productionRunId));

    return actualMaterialCost;
  } catch (error) {
    console.error("Error accumulating material cost:", error);
    throw error;
  }
}

/**
 * Accumulate actual labor costs from time confirmations
 * Called when time is confirmed against a production run
 */
export async function accumulateLaborCost(productionRunId) {
  try {
    // Sum all time confirmations for this production run
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(${timeConfirmations.laborCost}::numeric), 0)` })
      .from(timeConfirmations)
      .where(eq(timeConfirmations.productionRunId, productionRunId));

    const actualLaborCost = Number(result?.total || 0);

    await db
      .update(productionRuns)
      .set({ actualLaborCost: actualLaborCost.toFixed(2) })
      .where(eq(productionRuns.id, productionRunId));

    return actualLaborCost;
  } catch (error) {
    console.error("Error accumulating labor cost:", error);
    throw error;
  }
}

/**
 * Calculate and store cost variances (actual - planned)
 * Called when production run is completed or settled
 */
export async function calculateVariances(productionRunId) {
  try {
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, productionRunId));
    if (!run) throw new Error("Production run not found");

    const plannedMaterial = Number(run.plannedMaterialCost || 0);
    const plannedLabor = Number(run.plannedLaborCost || 0);
    const plannedOverhead = Number(run.plannedOverheadCost || 0);

    const actualMaterial = Number(run.actualMaterialCost || 0);
    const actualLabor = Number(run.actualLaborCost || 0);
    const actualOverhead = Number(run.actualOverheadCost || 0);

    const varianceMaterial = actualMaterial - plannedMaterial;
    const varianceLabor = actualLabor - plannedLabor;
    const varianceOverhead = actualOverhead - plannedOverhead;

    await db
      .update(productionRuns)
      .set({
        varianceMaterial: varianceMaterial.toFixed(2),
        varianceLabor: varianceLabor.toFixed(2),
        varianceOverhead: varianceOverhead.toFixed(2),
      })
      .where(eq(productionRuns.id, productionRunId));

    return {
      varianceMaterial,
      varianceLabor,
      varianceOverhead,
      totalVariance: varianceMaterial + varianceLabor + varianceOverhead,
    };
  } catch (error) {
    console.error("Error calculating variances:", error);
    throw error;
  }
}

/**
 * Build a cost summary for reporting
 * Returns planned vs actual costs with variances
 */
export async function buildCostSummary(productionRunId) {
  try {
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, productionRunId));
    if (!run) throw new Error("Production run not found");

    return {
      productionRunId,
      planned: {
        material: Number(run.plannedMaterialCost || 0),
        labor: Number(run.plannedLaborCost || 0),
        overhead: Number(run.plannedOverheadCost || 0),
        total: Number(run.plannedMaterialCost || 0) + Number(run.plannedLaborCost || 0) + Number(run.plannedOverheadCost || 0),
      },
      actual: {
        material: Number(run.actualMaterialCost || 0),
        labor: Number(run.actualLaborCost || 0),
        overhead: Number(run.actualOverheadCost || 0),
        total: Number(run.actualMaterialCost || 0) + Number(run.actualLaborCost || 0) + Number(run.actualOverheadCost || 0),
      },
      variance: {
        material: Number(run.varianceMaterial || 0),
        labor: Number(run.varianceLabor || 0),
        overhead: Number(run.varianceOverheadCost || 0),
        total: Number(run.varianceMaterial || 0) + Number(run.varianceLabor || 0) + Number(run.varianceOverheadCost || 0),
      },
    };
  } catch (error) {
    console.error("Error building cost summary:", error);
    throw error;
  }
}
