import { Router } from "express";
import { z } from "zod";
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
  customerStock, goodsIssues, goodsReceipts, companyUsers,
} from "../../../shared/schema.js";
import {
  snapshotPlannedCosts,
  accumulateMaterialCost,
  accumulateLaborCost,
  calculateVariances,
  buildCostSummary,
} from "../../lib/productionCosting.js";
import { userHasPermission } from "../../lib/permissions.js";

const router = Router({ mergeParams: true });

// ==========================================================================
// AUTHZ: company scope + permission enforcement
// ==========================================================================

const MFG_ACCESS_ROLES = new Set(["owner", "admin", "manufacturing"]);

async function getCompanyId(req: any): Promise<number> {
  const raw = (req.params as any).companyId ?? req.apiKeyCompanyId;
  const id = Number(raw);
  if (Number.isNaN(id)) throw new Error("Missing or invalid company context");
  return id;
}

async function resolveMfgRole(req: any, companyId: number): Promise<string | null> {
  if (req.user?.isSuperAdmin) return "owner";
  const userId = req.user?.id;
  if (!userId) return null;
  const [membership] = await db
    .select({ role: companyUsers.role })
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)))
    .limit(1);
  return membership?.role || null;
}

router.use(async (req: any, res: any, next: any) => {
  try {
    const companyId = await getCompanyId(req);

    if (req.user?.isApiKey) {
      if (req.apiKeyCompanyId !== companyId) {
        return res.status(403).json({ message: "Forbidden: API key does not belong to this company" });
      }
      return next();
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: Authentication required" });
    }

    const hasView = req.user?.isSuperAdmin || await userHasPermission(userId, companyId, "manufacturing.view", false);
    const role = await resolveMfgRole(req, companyId);
    if (!hasView && !(role && MFG_ACCESS_ROLES.has(role))) {
      return res.status(403).json({ message: "Forbidden: Manufacturing access required for this company" });
    }
    (req as any).mfgRole = role;
    next();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

async function requireMfgWrite(req: any, res: any, next: any, permission: "manufacturing.bom" | "manufacturing.work_orders") {
  try {
    if (req.user?.isApiKey || req.user?.isSuperAdmin) return next();
    const role = (req as any).mfgRole;
    if (role && MFG_ACCESS_ROLES.has(role)) return next();
    const companyId = await getCompanyId(req);
    const hasPerm = await userHasPermission(req.user?.id, companyId, permission, false);
    if (!hasPerm) {
      return res.status(403).json({ message: "Forbidden: Insufficient manufacturing permissions" });
    }
    next();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
}

const requireBomWrite = (req: any, res: any, next: any) => requireMfgWrite(req, res, next, "manufacturing.bom");
const requireRunWrite = (req: any, res: any, next: any) => requireMfgWrite(req, res, next, "manufacturing.work_orders");

// ==========================================================================
// INPUT VALIDATION
// ==========================================================================

const idParam = z.coerce.number().int().positive();

function validate<T>(schema: z.ZodType<T>, body: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") };
  }
  return { ok: true, data: result.data };
}

const bomLineSchema = z.object({
  componentProductId: z.coerce.number().int().positive(),
  type: z.enum(["COMPONENT", "BY_PRODUCT", "CO_PRODUCT"]).default("COMPONENT"),
  quantity: z.coerce.number().positive(),
  unitOfMeasure: z.string().min(1),
  scrapPercentage: z.coerce.number().min(0).max(100).default(0),
});

const bomSchema = z.object({
  productId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(255),
  version: z.string().default("1.0"),
  isActive: z.boolean().default(true),
  lines: z.array(bomLineSchema).optional(),
});

const productionRunSchema = z.object({
  type: z.enum(["RECIPE", "SIMPLE"]).default("RECIPE"),
  bomId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(["PLANNED", "RELEASED", "IN_PROGRESS", "COMPLETED", "SETTLED", "CANCELLED"]).default("PLANNED"),
  plannedQuantity: z.coerce.number().positive(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  salesOrderId: z.coerce.number().int().positive().nullable().optional(),
  artworkVersionSnapshot: z.string().nullable().optional(),
  plannedStart: z.string().nullable().optional(),
  plannedCompletion: z.string().nullable().optional(),
  routingId: z.coerce.number().int().positive().nullable().optional(),
  routingOperationId: z.coerce.number().int().positive().nullable().optional(),
  machineId: z.coerce.number().int().positive().nullable().optional(),
  operatorId: z.coerce.number().int().positive().nullable().optional(),
  shift: z.string().nullable().optional(),
  downtimeMinutes: z.coerce.number().min(0).optional(),
  notes: z.string().nullable().optional(),
});

const completeRunSchema = z.object({
  goodQuantity: z.coerce.number().min(0).optional(),
  rejectedQuantity: z.coerce.number().min(0).optional(),
  completedQuantity: z.coerce.number().min(0).optional(),
});

const goodsMovementSchema = z.object({
  productId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive().nullable().optional(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0).optional(),
  notes: z.string().nullable().optional(),
});

const timeConfirmationSchema = z.object({
  workCenterId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive().nullable().optional(),
  hours: z.coerce.number().min(0).positive(),
  hourlyRate: z.coerce.number().min(0).optional(),
  notes: z.string().nullable().optional(),
});

const standardCostSchema = z.object({
  productId: z.coerce.number().int().positive(),
  materialCost: z.coerce.number().min(0).default(0),
  laborCost: z.coerce.number().min(0).default(0),
  overheadCost: z.coerce.number().min(0).default(0),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().nullable().optional(),
});

const workCenterSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  description: z.string().nullable().optional(),
  costPerHour: z.coerce.number().min(0).default(0),
  overheadRate: z.coerce.number().min(0).default(0),
  capacityHoursPerDay: z.coerce.number().min(0).default(8),
  isActive: z.boolean().default(true),
});

const routingSchema = z.object({
  productId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(255),
  version: z.string().default("1.0"),
  isActive: z.boolean().default(true),
});

const scheduleSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

const mrpApproveSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional(),
});

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

router.post("/bom", requireBomWrite, async (req, res) => {
  try {
    const parsed = validate(bomSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const data = parsed.data;
    const created = await storage.createBillOfMaterial({
      ...data,
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
      .select({
        run: productionRuns,
        bom: billOfMaterials,
        product: products,
        plannedMaterialCost: productionRuns.plannedMaterialCost,
        plannedLaborCost: productionRuns.plannedLaborCost,
        plannedOverheadCost: productionRuns.plannedOverheadCost,
        actualMaterialCost: productionRuns.actualMaterialCost,
        actualLaborCost: productionRuns.actualLaborCost,
        actualOverheadCost: productionRuns.actualOverheadCost,
        varianceMaterial: productionRuns.varianceMaterial,
        varianceLabor: productionRuns.varianceLabor,
        varianceOverhead: productionRuns.varianceOverhead,
      })
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

    const issuesRow = await db
      .select({ issue: goodsIssues, product: products })
      .from(goodsIssues)
      .leftJoin(products, eq(goodsIssues.productId, products.id))
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
      goodsIssues: issuesRow.map((r: any) => ({ ...r.issue, product: r.product })),
      goodsReceipts: receiptsRow,
      timeConfirmations: tcRow,
      costSummary,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/production-runs", requireRunWrite, async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const parsed = validate(productionRunSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const data = parsed.data;
    const body: any = { ...data, companyId };

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

router.post("/production-runs/:id/release", requireRunWrite, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, id), eq(productionRuns.companyId, companyId)));
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

router.post("/production-runs/:id/start", requireRunWrite, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, id), eq(productionRuns.companyId, companyId)));
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

router.post("/production-runs/:id/complete", requireRunWrite, async (req, res) => {
  try {
    const userId = (req.user as any)?.id || "0";
    const productionRunId = Number(req.params.id);
    const companyId = await getCompanyId(req);

    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, productionRunId), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });

    const parsed = validate(completeRunSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const data = parsed.data;

    const goodQty = data.goodQuantity !== undefined
      ? Number(data.goodQuantity)
      : (data.completedQuantity ? Number(data.completedQuantity) : Number(run.plannedQuantity));
      
    const rejectedQty = data.rejectedQuantity !== undefined
      ? Number(data.rejectedQuantity)
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

router.post("/production-runs/:id/settle", requireRunWrite, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, id), eq(productionRuns.companyId, companyId)));
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

router.post("/production-runs/:id/goods-issues", requireRunWrite, async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const createdBy = (req.user as any)?.id || null;

    const parsed = validate(goodsMovementSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const body = parsed.data;

    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, productionRunId), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    if (!["RELEASED", "IN_PROGRESS"].includes(run.status)) {
      return res.status(400).json({ message: `Cannot issue materials in status: ${run.status}` });
    }

    const qty = body.quantity;
    const unitCost = body.unitCost ?? 0;
    const totalCost = qty * unitCost;

    // Insert goods issue record
    const [issue] = await db.insert(goodsIssues).values({
      productionRunId,
      productId: body.productId,
      locationId: body.locationId ?? null,
      quantity: qty.toString(),
      unitCost: unitCost.toString(),
      totalCost: totalCost.toString(),
      type: "ISSUE",
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

router.post("/production-runs/:id/goods-returns", requireRunWrite, async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const createdBy = (req.user as any)?.id || null;

    const parsed = validate(goodsMovementSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const body = parsed.data;

    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, productionRunId), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    if (!["RELEASED", "IN_PROGRESS"].includes(run.status)) {
      return res.status(400).json({ message: `Cannot return materials in status: ${run.status}` });
    }

    const qty = body.quantity;
    const unitCost = body.unitCost ?? 0;
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
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, productionRunId), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    const data = await db.select().from(timeConfirmations)
      .where(eq(timeConfirmations.productionRunId, productionRunId))
      .orderBy(desc(timeConfirmations.postedAt));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/production-runs/:id/time-confirmations", requireRunWrite, async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const createdBy = (req.user as any)?.id || null;

    const parsed = validate(timeConfirmationSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const body = parsed.data;

    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, productionRunId), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });

    // Look up work center for rates
    const [wc] = await db.select().from(manufacturingWorkCenters)
      .where(eq(manufacturingWorkCenters.id, body.workCenterId));

    const hours = body.hours;
    const hourlyRate = body.hourlyRate ?? Number(wc?.costPerHour ?? "0");
    const overheadRate = Number(wc?.overheadRate ?? "0");
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
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, id), eq(productionRuns.companyId, companyId)));
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

router.post("/work-orders", requireRunWrite, async (req, res) => {
  try {
    const parsed = validate(productionRunSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const data = parsed.data;
    const created = await storage.createWorkOrder({
      ...data,
      companyId: Number((req.params as any).companyId)
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/work-orders/:id/start", requireRunWrite, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, id), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    const [updated] = await db.update(productionRuns)
      .set({ status: "IN_PROGRESS", plannedStart: new Date(), updatedAt: new Date() })
      .where(eq(productionRuns.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/work-orders/:id/complete", requireRunWrite, async (req, res) => {
  try {
    const userId = (req.user as any)?.id || "0";
    const productionRunId = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, productionRunId), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });
    const parsed = validate(completeRunSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const data = parsed.data;
    const completedQty = data.completedQuantity
      ? Number(data.completedQuantity)
      : Number(run.plannedQuantity);
    const result = await storage.completeWorkOrder(productionRunId, completedQty, 0, userId);
    await calculateVariances(productionRunId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/work-orders/:id/issue-materials", requireRunWrite, async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, productionRunId), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });
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

router.post("/work-orders/:id/return-materials", requireRunWrite, async (req, res) => {
  try {
    const productionRunId = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(productionRuns)
      .where(and(eq(productionRuns.id, productionRunId), eq(productionRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "Production run not found" });
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

router.post("/standard-costs", requireRunWrite, async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const parsed = validate(standardCostSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const body = parsed.data;
    const materialCost = (body.materialCost ?? 0).toFixed(2);
    const laborCost = (body.laborCost ?? 0).toFixed(2);
    const overheadCost = (body.overheadCost ?? 0).toFixed(2);
    const total = (
      parseFloat(materialCost) +
      parseFloat(laborCost) +
      parseFloat(overheadCost)
    ).toFixed(2);

    const [created] = await db.insert(standardCosts).values({
      ...body,
      materialCost,
      laborCost,
      overheadCost,
      companyId,
      totalCost: total,
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/standard-costs/:id", requireRunWrite, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const parsed = validate(standardCostSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const body = parsed.data;
    const materialCost = (body.materialCost ?? 0).toFixed(2);
    const laborCost = (body.laborCost ?? 0).toFixed(2);
    const overheadCost = (body.overheadCost ?? 0).toFixed(2);
    const total = (
      parseFloat(materialCost) +
      parseFloat(laborCost) +
      parseFloat(overheadCost)
    ).toFixed(2);

    const [updated] = await db.update(standardCosts)
      .set({ ...body, materialCost, laborCost, overheadCost, totalCost: total, updatedAt: new Date() })
      .where(and(eq(standardCosts.id, id), eq(standardCosts.companyId, companyId)))
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

router.post("/work-centers", requireRunWrite, async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const parsed = validate(workCenterSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const data = parsed.data;
    const [created] = await db.insert(manufacturingWorkCenters)
      .values({
        ...data,
        costPerHour: (data.costPerHour ?? 0).toFixed(2),
        overheadRate: (data.overheadRate ?? 0).toFixed(2),
        capacityHoursPerDay: (data.capacityHoursPerDay ?? 8).toFixed(2),
        companyId,
      }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/machines", async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const data = await db
      .select({ machine: manufacturingMachines, workCenter: manufacturingWorkCenters })
      .from(manufacturingMachines)
      .innerJoin(manufacturingWorkCenters, eq(manufacturingMachines.workCenterId, manufacturingWorkCenters.id))
      .where(eq(manufacturingWorkCenters.companyId, companyId))
      .orderBy(desc(manufacturingMachines.createdAt));
    res.json(data.map((r: any) => ({ ...r.machine, workCenter: r.workCenter })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/machines", requireRunWrite, async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const [wc] = await db.select().from(manufacturingWorkCenters)
      .where(and(eq(manufacturingWorkCenters.id, req.body.workCenterId), eq(manufacturingWorkCenters.companyId, companyId)));
    if (!wc) return res.status(400).json({ message: "Work center does not belong to this company" });
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

router.post("/routings", requireRunWrite, async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const parsed = validate(routingSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const data = parsed.data;
    const [created] = await db.insert(manufacturingRoutings)
      .values({ ...data, companyId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/routings/:id/operations", requireRunWrite, async (req, res) => {
  try {
    const routingId = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [routing] = await db.select().from(manufacturingRoutings)
      .where(and(eq(manufacturingRoutings.id, routingId), eq(manufacturingRoutings.companyId, companyId)));
    if (!routing) return res.status(404).json({ message: "Routing not found" });
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

router.post("/schedules", requireRunWrite, async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const parsed = validate(scheduleSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const data = parsed.data;
    const [created] = await db.insert(manufacturingProductionSchedules)
      .values({ ...data, companyId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/schedules/:id/lines", requireRunWrite, async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);
    const companyId = await getCompanyId(req);
    const [schedule] = await db.select().from(manufacturingProductionSchedules)
      .where(and(eq(manufacturingProductionSchedules.id, scheduleId), eq(manufacturingProductionSchedules.companyId, companyId)));
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    const [created] = await db.insert(manufacturingProductionScheduleLines)
      .values({ ...req.body, scheduleId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/mrp/run", requireRunWrite, async (req, res) => {
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
    const companyId = await getCompanyId(req);
    const [run] = await db.select().from(manufacturingMrpRuns)
      .where(and(eq(manufacturingMrpRuns.id, mrpRunId), eq(manufacturingMrpRuns.companyId, companyId)));
    if (!run) return res.status(404).json({ message: "MRP run not found" });
    const data = await db.select().from(manufacturingMrpRecommendations)
      .where(eq(manufacturingMrpRecommendations.mrpRunId, mrpRunId));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/mrp/recommendations/:id/approve", requireRunWrite, async (req, res) => {
  try {
    const recommendationId = Number(req.params.id);
    const companyId = Number((req.params as any).companyId);

    const [rec] = await db.select().from(manufacturingMrpRecommendations)
      .where(eq(manufacturingMrpRecommendations.id, recommendationId));
    if (!rec) return res.status(404).json({ message: "Recommendation not found" });
    const [mrpRun] = await db.select().from(manufacturingMrpRuns)
      .where(and(eq(manufacturingMrpRuns.id, rec.mrpRunId), eq(manufacturingMrpRuns.companyId, companyId)));
    if (!mrpRun) return res.status(404).json({ message: "Recommendation does not belong to this company" });
    if (rec.status === "APPROVED") return res.status(400).json({ message: "Already approved" });

    const parsed = validate(mrpApproveSchema, req.body); if (!parsed.ok) return res.status(400).json({ message: parsed.error }); const body = parsed.data;
    let referenceId = null;

    if (rec.type === "PURCHASE") {
      const poNum = "PO-MRP-" + Date.now();
      // NOTE: supplierId must be provided in req.body for real use; placeholder removed
      const supplierId = body.supplierId;
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
