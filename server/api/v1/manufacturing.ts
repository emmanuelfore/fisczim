import { Router } from "express";
import { storage } from "../../storage.js";
import { db } from "../../db.js";
import { eq, and, desc, lte, isNull, or, sql } from "drizzle-orm";
import {
  billOfMaterials, bomItems, productionRuns, productionRunConsumptions, products,
  manufacturingWorkCenters, manufacturingMachines, manufacturingRoutings,
  manufacturingRoutingOperations, manufacturingMaterialTransactions,
  manufacturingProductionNotes, manufacturingProductionAttachments,
  manufacturingProductionSchedules, manufacturingProductionScheduleLines,
  manufacturingMaterialReservations, manufacturingMrpRuns,
  manufacturingMaterialShortages, manufacturingMrpRecommendations,
  purchaseOrders, stockTransfers,
  timeConfirmations, standardCosts,
  inventoryLocations, inventoryLocationStocks, customerProducts, salesOrders,
  customerStock, goodsIssues, goodsReceipts,
} from "../../../shared/schema.js";
import {
  snapshotPlannedCosts,
  accumulateMaterialCost,
  accumulateLaborCost,
  calculateVariances,
  buildCostSummary,
} from "../../lib/productionCosting.js";

const router = Router({ mergeParams: true });

// ==========================================================================
// BOM
// ==========================================================================

router.get("/bom", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const boms = await db.select().from(billOfMaterials)
      .where(eq(billOfMaterials.companyId, companyId))
      .orderBy(desc(billOfMaterials.createdAt));
    res.json(boms);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/bom/:id", async (req, res) => {
  try {
    const bomId = Number(req.params.id);
    const companyId = Number((req.params as any).companyId);

    const [bom] = await db.select().from(billOfMaterials)
      .where(and(eq(billOfMaterials.id, bomId), eq(billOfMaterials.companyId, companyId)));
    if (!bom) return res.status(404).json({ message: "BOM not found" });

    const linesRows = await db.select({ line: bomItems, product: products })
      .from(bomItems)
      .leftJoin(products, eq(bomItems.componentProductId, products.id))
      .where(eq(bomItems.bomId, bomId));

    res.json({
      ...bom,
      lines: linesRows.map((r: any) => ({ ...r.line, componentProduct: r.product }))
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/bom", async (req, res) => {
  try {
    const created = await storage.createBillOfMaterial({
      ...req.body,
      companyId: Number((req.params as any).companyId)
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ==========================================================================
// PRODUCTION RUNS (primary entity, replaces /work-orders)
// ==========================================================================

router.get("/production-runs", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const rows = await db
      .select({ run: productionRuns, bom: billOfMaterials, product: products })
      .from(productionRuns)
      .innerJoin(billOfMaterials, eq(productionRuns.bomId, billOfMaterials.id))
      .leftJoin(products, eq(billOfMaterials.productId, products.id))
      .where(eq(productionRuns.companyId, companyId))
      .orderBy(desc(productionRuns.createdAt));

    res.json(rows.map((r: any) => ({ ...r.run, bom: r.bom, product: r.product })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/production-runs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = Number((req.params as any).companyId);

    const [runRow] = await db
      .select({ run: productionRuns, bom: billOfMaterials, product: products })
      .from(productionRuns)
      .innerJoin(billOfMaterials, eq(productionRuns.bomId, billOfMaterials.id))
      .leftJoin(products, eq(billOfMaterials.productId, products.id))
      .where(and(eq(productionRuns.id, id), eq(productionRuns.companyId, companyId)));

    if (!runRow) return res.status(404).json({ message: "Production run not found" });

    const consumptionsRow = await db
      .select({ consumption: productionRunConsumptions, product: products })
      .from(productionRunConsumptions)
      .leftJoin(products, eq(productionRunConsumptions.productId, products.id))
      .where(eq(productionRunConsumptions.productionRunId, id));

    const issuesRow = await db.select().from(goodsIssues)
      .where(eq(goodsIssues.productionRunId, id))
      .orderBy(desc(goodsIssues.postedAt));

    const receiptsRow = await db.select().from(goodsReceipts)
      .where(eq(goodsReceipts.productionRunId, id))
      .orderBy(desc(goodsReceipts.postedAt));

    const tcRow = await db.select().from(timeConfirmations)
      .where(eq(timeConfirmations.productionRunId, id))
      .orderBy(desc(timeConfirmations.postedAt));

    const costSummary = buildCostSummary(runRow.run);

    res.json({
      ...runRow.run,
      bom: runRow.bom,
      product: runRow.product,
      consumptions: consumptionsRow.map((r: any) => ({ ...r.consumption, product: r.product })),
      goodsIssues: issuesRow,
      goodsReceipts: receiptsRow,
      timeConfirmations: tcRow,
      costSummary,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/production-runs", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const body = { ...req.body, companyId };

    // Auto-set customerId from salesOrder if provided
    if (body.salesOrderId && !body.customerId) {
      const [so] = await db.select().from(salesOrders).where(eq(salesOrders.id, body.salesOrderId));
      if (so) body.customerId = so.customerId;
    }

    // Auto-fill artworkVersionSnapshot from customerProducts if not provided
    if (body.customerId && body.bomId && !body.artworkVersionSnapshot) {
      const bom = await db.query.billOfMaterials.findFirst({
        where: eq(billOfMaterials.id, body.bomId),
      });
      if (bom?.productId) {
        const cp = await db.query.customerProducts.findFirst({
          where: and(
            eq(customerProducts.customerId, body.customerId),
            eq(customerProducts.productId, bom.productId)
          ),
        });
        if (cp?.artworkVersion) body.artworkVersionSnapshot = cp.artworkVersion;
      }
    }

    const [created] = await db.insert(productionRuns).values(body).returning();

    // Snapshot planned costs (handles both RECIPE and SIMPLE types internally)
    await snapshotPlannedCosts(
      created.id,
      created.bomId!,
      created.routingId ?? undefined,
      parseFloat(created.plannedQuantity)
    );

    // Return with fresh costs
    const [updated] = await db.select().from(productionRuns).where(eq(productionRuns.id, created.id));
    res.status(201).json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// --- State transitions ---

router.post("/production-runs/:id/release", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, id));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    if (run.status !== "PLANNED") return res.status(400).json({ message: `Cannot release from status: ${run.status}` });

    const [updated] = await db.update(productionRuns)
      .set({ status: "RELEASED", updatedAt: new Date() })
      .where(eq(productionRuns.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/production-runs/:id/start", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, id));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    if (!["PLANNED", "RELEASED"].includes(run.status)) {
      return res.status(400).json({ message: `Cannot start from status: ${run.status}` });
    }

    const [updated] = await db.update(productionRuns)
      .set({ status: "IN_PROGRESS", plannedStart: new Date(), updatedAt: new Date() })
      .where(eq(productionRuns.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/production-runs/:id/complete", async (req, res) => {
  try {
    const userId = (req.user as any)?.id || "0";
    const productionRunId = Number(req.params.id);

    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, productionRunId));
    if (!run) return res.status(404).json({ message: "Production run not found" });

    const goodQty = req.body.goodQuantity !== undefined
      ? Number(req.body.goodQuantity)
      : (req.body.completedQuantity ? Number(req.body.completedQuantity) : Number(run.plannedQuantity));
      
    const rejectedQty = req.body.rejectedQuantity !== undefined 
      ? Number(req.body.rejectedQuantity) 
      : 0;

    const result = await storage.completeWorkOrder(productionRunId, goodQty, rejectedQty, userId);

    // Calculate and store variances
    await calculateVariances(productionRunId);

    res.json(result);
  } catch (err: any) {
    console.error("completeProductionRun error:", err);
    res.status(400).json({ message: err.message });
  }
});

router.post("/production-runs/:id/settle", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, id));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    if (run.status !== "COMPLETED") {
      return res.status(400).json({ message: `Cannot settle from status: ${run.status}` });
    }

    // Finalise variances before settling
    const variances = await calculateVariances(id);

    const [updated] = await db.update(productionRuns)
      .set({ status: "SETTLED", updatedAt: new Date() })
      .where(eq(productionRuns.id, id))
      .returning();

    res.json({ ...updated, variances });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// --- Goods Issues ---

router.post("/production-runs/:id/goods-issues", async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const createdBy = (req.user as any)?.id || null;
    const body = req.body;

    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, productionRunId));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    if (!["RELEASED", "IN_PROGRESS"].includes(run.status)) {
      return res.status(400).json({ message: `Cannot issue materials in status: ${run.status}` });
    }

    const qty = parseFloat(body.quantity);
    const unitCost = parseFloat(body.unitCost ?? "0");
    const totalCost = qty * unitCost;

    // Insert goods issue record
    const [issue] = await db.insert(goodsIssues).values({
      productionRunId,
      productId: body.productId,
      locationId: body.locationId ?? null,
      quantity: qty.toString(),
      unitCost: unitCost.toString(),
      totalCost: totalCost.toString(),
      type: body.type ?? "ISSUE",
      createdBy,
      notes: body.notes ?? null,
    }).returning();

    // Deduct from inventory (real stock change)
    if (body.locationId) {
      await db.execute(
        sql`UPDATE inventory_location_stocks
            SET stock_level = stock_level - ${qty},
                available_quantity = GREATEST(0, available_quantity - ${qty}),
                updated_at = NOW()
            WHERE location_id = ${body.locationId} AND product_id = ${body.productId}`
      );
    }

    // Accumulate material cost on production run
    await accumulateMaterialCost(productionRunId);

    res.status(201).json(issue);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/production-runs/:id/goods-returns", async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const createdBy = (req.user as any)?.id || null;
    const body = req.body;

    const qty = parseFloat(body.quantity);
    const unitCost = parseFloat(body.unitCost ?? "0");
    const totalCost = qty * unitCost;

    const [issue] = await db.insert(goodsIssues).values({
      productionRunId,
      productId: body.productId,
      locationId: body.locationId ?? null,
      quantity: qty.toString(),
      unitCost: unitCost.toString(),
      totalCost: totalCost.toString(),
      type: "RETURN",
      createdBy,
      notes: body.notes ?? null,
    }).returning();

    // Return stock to inventory
    if (body.locationId) {
      await db.execute(
        sql`UPDATE inventory_location_stocks
            SET stock_level = stock_level + ${qty},
                available_quantity = available_quantity + ${qty},
                updated_at = NOW()
            WHERE location_id = ${body.locationId} AND product_id = ${body.productId}`
      );
    }

    await accumulateMaterialCost(productionRunId);
    res.status(201).json(issue);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// --- Time Confirmations ---

router.get("/production-runs/:id/time-confirmations", async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const data = await db.select().from(timeConfirmations)
      .where(eq(timeConfirmations.productionRunId, productionRunId))
      .orderBy(desc(timeConfirmations.postedAt));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/production-runs/:id/time-confirmations", async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const createdBy = (req.user as any)?.id || null;
    const body = req.body;

    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, productionRunId));
    if (!run) return res.status(404).json({ message: "Production run not found" });

    // Look up work center for rates
    const [wc] = await db.select().from(manufacturingWorkCenters)
      .where(eq(manufacturingWorkCenters.id, body.workCenterId));

    const hours = parseFloat(body.hours ?? "0");
    const hourlyRate = parseFloat(body.hourlyRate ?? wc?.costPerHour ?? "0");
    const overheadRate = parseFloat(wc?.overheadRate ?? "0");
    const laborCost = hours * hourlyRate;
    const overheadCost = hours * overheadRate;

    const [tc] = await db.insert(timeConfirmations).values({
      productionRunId,
      workCenterId: body.workCenterId,
      employeeId: body.employeeId ?? null,
      hours: hours.toString(),
      hourlyRate: hourlyRate.toString(),
      laborCost: laborCost.toString(),
      overheadCost: overheadCost.toString(),
      createdBy,
      notes: body.notes ?? null,
    }).returning();

    // Accumulate labor cost on production run
    await accumulateLaborCost(productionRunId);

    res.status(201).json(tc);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// --- Cost Summary ---

router.get("/production-runs/:id/cost-summary", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, id));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    res.json(buildCostSummary(run));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// --- Backward-compat: /work-orders aliases ---
// These forward to the new /production-runs endpoints

router.get("/work-orders", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const rows = await db
      .select({ run: productionRuns, bom: billOfMaterials, product: products })
      .from(productionRuns)
      .innerJoin(billOfMaterials, eq(productionRuns.bomId, billOfMaterials.id))
      .leftJoin(products, eq(billOfMaterials.productId, products.id))
      .where(eq(productionRuns.companyId, companyId))
      .orderBy(desc(productionRuns.createdAt));
    res.json(rows.map((r: any) => ({ ...r.run, bom: r.bom, product: r.product })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/work-orders/:id", (req, res) => {
  req.params.id = req.params.id;
  res.redirect(307, req.originalUrl.replace("/work-orders/", "/production-runs/"));
});

router.post("/work-orders", async (req, res) => {
  try {
    const created = await storage.createWorkOrder({
      ...req.body,
      companyId: Number((req.params as any).companyId)
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/work-orders/:id/start", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db.update(productionRuns)
      .set({ status: "IN_PROGRESS", plannedStart: new Date(), updatedAt: new Date() })
      .where(eq(productionRuns.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/work-orders/:id/complete", async (req, res) => {
  try {
    const userId = (req.user as any)?.id || "0";
    const productionRunId = Number(req.params.id);
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, productionRunId));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    const completedQty = req.body.completedQuantity
      ? Number(req.body.completedQuantity)
      : Number(run.plannedQuantity);
    const result = await storage.completeWorkOrder(productionRunId, completedQty, 0, userId);
    await calculateVariances(productionRunId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/work-orders/:id/issue-materials", async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const [created] = await db.insert(manufacturingMaterialTransactions).values({
      ...req.body,
      productionRunId,
      type: "ISSUE",
      postedAt: new Date(),
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/work-orders/:id/return-materials", async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const [created] = await db.insert(manufacturingMaterialTransactions).values({
      ...req.body,
      productionRunId,
      type: "RETURN",
      postedAt: new Date(),
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ==========================================================================
// STANDARD COSTS
// ==========================================================================

router.get("/standard-costs", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const today = new Date().toISOString().split("T")[0];
    const data = await db
      .select({ sc: standardCosts, product: products })
      .from(standardCosts)
      .leftJoin(products, eq(standardCosts.productId, products.id))
      .where(and(
        eq(standardCosts.companyId, companyId),
        lte(standardCosts.effectiveFrom, today),
        or(isNull(standardCosts.effectiveTo), lte(standardCosts.effectiveTo, today))
      ))
      .orderBy(desc(standardCosts.effectiveFrom));
    res.json(data.map((r: any) => ({ ...r.sc, product: r.product })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/standard-costs", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const body = req.body;
    const total = (
      parseFloat(body.materialCost ?? "0") +
      parseFloat(body.laborCost ?? "0") +
      parseFloat(body.overheadCost ?? "0")
    ).toFixed(2);

    const [created] = await db.insert(standardCosts).values({
      ...body,
      companyId,
      totalCost: total,
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/standard-costs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;
    const total = (
      parseFloat(body.materialCost ?? "0") +
      parseFloat(body.laborCost ?? "0") +
      parseFloat(body.overheadCost ?? "0")
    ).toFixed(2);

    const [updated] = await db.update(standardCosts)
      .set({ ...body, totalCost: total, updatedAt: new Date() })
      .where(eq(standardCosts.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Standard cost not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ==========================================================================
// WORK CENTERS, MACHINES, ROUTINGS
// ==========================================================================

router.get("/work-centers", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const data = await db.select().from(manufacturingWorkCenters)
      .where(eq(manufacturingWorkCenters.companyId, companyId))
      .orderBy(desc(manufacturingWorkCenters.createdAt));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/work-centers", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const [created] = await db.insert(manufacturingWorkCenters)
      .values({ ...req.body, companyId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/machines", async (req, res) => {
  try {
    const data = await db.select().from(manufacturingMachines);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/machines", async (req, res) => {
  try {
    const [created] = await db.insert(manufacturingMachines).values(req.body).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/routings", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const data = await db.select().from(manufacturingRoutings)
      .where(eq(manufacturingRoutings.companyId, companyId))
      .orderBy(desc(manufacturingRoutings.createdAt));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/routings", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const [created] = await db.insert(manufacturingRoutings)
      .values({ ...req.body, companyId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/routings/:id/operations", async (req, res) => {
  try {
    const routingId = Number(req.params.id);
    const [created] = await db.insert(manufacturingRoutingOperations)
      .values({ ...req.body, routingId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ==========================================================================
// SCHEDULES & MRP
// ==========================================================================

router.get("/schedules", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const data = await db.select().from(manufacturingProductionSchedules)
      .where(eq(manufacturingProductionSchedules.companyId, companyId))
      .orderBy(desc(manufacturingProductionSchedules.createdAt));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/schedules", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const [created] = await db.insert(manufacturingProductionSchedules)
      .values({ ...req.body, companyId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/schedules/:id/lines", async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);
    const [created] = await db.insert(manufacturingProductionScheduleLines)
      .values({ ...req.body, scheduleId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/mrp/run", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);

    const [run] = await db.insert(manufacturingMrpRuns).values({
      companyId,
      status: "COMPLETED",
      notes: "Auto-generated MRP Run",
    }).returning();

    const plannedRuns = await db.select().from(productionRuns)
      .where(and(
        eq(productionRuns.companyId, companyId),
        eq(productionRuns.status, "PLANNED")
      ));

    let newRecommendations = 0;

    for (const pr of plannedRuns) {
      if (!pr.bomId) continue;
      const lines = await db.select().from(bomItems).where(eq(bomItems.bomId, pr.bomId));
      for (const line of lines) {
        const scrapFactor = 1 + (Number(line.scrapPercentage || 0) / 100);
        const totalNeeded = Number(pr.plannedQuantity) * Number(line.quantity) * scrapFactor;
        const [product] = await db.select({ stockLevel: products.stockLevel })
          .from(products).where(eq(products.id, line.componentProductId));
        const currentStock = Number(product?.stockLevel || 0);
        const shortageQty = Math.max(0, totalNeeded - currentStock);

        if (shortageQty > 0) {
          await db.insert(manufacturingMaterialShortages).values({
            mrpRunId: run.id,
            productId: line.componentProductId,
            shortageQuantity: shortageQty.toString(),
            status: "UNRESOLVED",
          });

          const subBom = await db.select().from(billOfMaterials)
            .where(eq(billOfMaterials.productId, line.componentProductId)).limit(1);
          const type = subBom.length > 0 ? "PRODUCTION_RUN" : "PURCHASE";

          await db.insert(manufacturingMrpRecommendations).values({
            mrpRunId: run.id,
            productId: line.componentProductId,
            type,
            quantity: shortageQty.toString(),
            status: "PENDING",
          });
          newRecommendations++;
        }
      }
    }

    res.status(201).json({ run, message: `MRP complete. Generated ${newRecommendations} recommendations.` });
  } catch (err: any) {
    console.error("MRP Run error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/mrp/runs", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const data = await db.select().from(manufacturingMrpRuns)
      .where(eq(manufacturingMrpRuns.companyId, companyId))
      .orderBy(desc(manufacturingMrpRuns.date));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/mrp/runs/:id/recommendations", async (req, res) => {
  try {
    const mrpRunId = Number(req.params.id);
    const data = await db.select().from(manufacturingMrpRecommendations)
      .where(eq(manufacturingMrpRecommendations.mrpRunId, mrpRunId));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/mrp/recommendations/:id/approve", async (req, res) => {
  try {
    const recommendationId = Number(req.params.id);
    const companyId = Number((req.params as any).companyId);

    const [rec] = await db.select().from(manufacturingMrpRecommendations)
      .where(eq(manufacturingMrpRecommendations.id, recommendationId));
    if (!rec) return res.status(404).json({ message: "Recommendation not found" });
    if (rec.status === "APPROVED") return res.status(400).json({ message: "Already approved" });

    let referenceId = null;

    if (rec.type === "PURCHASE") {
      const poNum = "PO-MRP-" + Date.now();
      // NOTE: supplierId must be provided in req.body for real use; placeholder removed
      const supplierId = req.body.supplierId;
      if (!supplierId) return res.status(400).json({ message: "supplierId required to approve PURCHASE recommendation" });
      const [po] = await db.insert(purchaseOrders).values({
        companyId, supplierId, poNumber: poNum, status: "DRAFT",
      }).returning();
      referenceId = po.id;
    } else if (rec.type === "PRODUCTION_RUN") {
      const subBom = await db.select().from(billOfMaterials)
        .where(eq(billOfMaterials.productId, rec.productId)).limit(1);
      if (subBom.length > 0) {
        const [pr] = await db.insert(productionRuns).values({
          companyId, bomId: subBom[0].id,
          plannedQuantity: rec.quantity.toString(), status: "PLANNED",
        }).returning();
        referenceId = pr.id;
      }
    } else if (rec.type === "TRANSFER") {
      const trNum = "TR-MRP-" + Date.now();
      const [tr] = await db.insert(stockTransfers).values({
        companyId, transferNumber: trNum, status: "DRAFT",
      }).returning();
      referenceId = tr.id;
    }

    const [updated] = await db.update(manufacturingMrpRecommendations)
      .set({ status: "APPROVED", referenceId })
      .where(eq(manufacturingMrpRecommendations.id, recommendationId))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
