import { Router } from "express";
import { storage } from "../../storage.js";
import { db } from "../../db.js";
import { eq, and, desc } from "drizzle-orm";
import { 
  billOfMaterials, bomLines, workOrders, workOrderConsumptions, products,
  manufacturingWorkCenters, manufacturingMachines, manufacturingRoutings, 
  manufacturingRoutingOperations, manufacturingProductionRuns, 
  manufacturingMaterialTransactions, manufacturingProductionNotes, 
  manufacturingProductionAttachments, manufacturingProductionSchedules,
  manufacturingProductionScheduleLines, manufacturingMaterialReservations,
  manufacturingMrpRuns, manufacturingMaterialShortages, manufacturingMrpRecommendations,
  purchaseOrders, stockTransfers
} from "../../../shared/schema.js";

const router = Router({ mergeParams: true });

router.get("/bom", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const boms = await db.select().from(billOfMaterials).where(eq(billOfMaterials.companyId, companyId)).orderBy(desc(billOfMaterials.createdAt));
    res.json(boms);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/bom/:id", async (req, res) => {
  try {
    const bomId = Number(req.params.id);
    const companyId = Number((req.params as any).companyId);
    
    const [bom] = await db.select().from(billOfMaterials).where(and(eq(billOfMaterials.id, bomId), eq(billOfMaterials.companyId, companyId)));
    if (!bom) return res.status(404).json({ message: "BOM not found" });
    
    const linesRows = await db
      .select({
        line: bomLines,
        product: products,
      })
      .from(bomLines)
      .leftJoin(products, eq(bomLines.componentProductId, products.id))
      .where(eq(bomLines.bomId, bomId));
      
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
    const created = await storage.createBillOfMaterial({ ...req.body, companyId: Number((req.params as any).companyId) });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/work-orders", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const rows = await db
      .select({
        wo: workOrders,
        bom: billOfMaterials,
        product: products
      })
      .from(workOrders)
      .innerJoin(billOfMaterials, eq(workOrders.bomId, billOfMaterials.id))
      .leftJoin(products, eq(billOfMaterials.productId, products.id))
      .where(eq(workOrders.companyId, companyId))
      .orderBy(desc(workOrders.createdAt));
      
    res.json(rows.map((r: any) => ({
      ...r.wo,
      bom: r.bom,
      product: r.product
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/work-orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = Number((req.params as any).companyId);
    
    const [woRow] = await db
      .select({
        wo: workOrders,
        bom: billOfMaterials,
        product: products
      })
      .from(workOrders)
      .innerJoin(billOfMaterials, eq(workOrders.bomId, billOfMaterials.id))
      .leftJoin(products, eq(billOfMaterials.productId, products.id))
      .where(and(eq(workOrders.id, id), eq(workOrders.companyId, companyId)));
      
    if (!woRow) return res.status(404).json({ message: "Work order not found" });
    
    const consumptionsRow = await db
      .select({
        consumption: workOrderConsumptions,
        product: products
      })
      .from(workOrderConsumptions)
      .leftJoin(products, eq(workOrderConsumptions.productId, products.id))
      .where(eq(workOrderConsumptions.workOrderId, id));
      
    res.json({
      ...woRow.wo,
      bom: woRow.bom,
      product: woRow.product,
      consumptions: consumptionsRow.map((r: any) => ({ ...r.consumption, product: r.product }))
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/work-orders", async (req, res) => {
  try {
    const created = await storage.createWorkOrder({ ...req.body, companyId: Number((req.params as any).companyId) });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});
router.post("/work-orders/:id/start", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [wo] = await db.update(workOrders)
      .set({ status: 'IN_PROGRESS', startDate: new Date() })
      .where(eq(workOrders.id, id))
      .returning();
    res.json(wo);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/work-orders/:id/complete", async (req, res) => {
  try {
    const userId = (req.user as any)?.id || "0";
    const workOrderId = Number(req.params.id);
    
    // We need completedQuantity from body, or we can fetch plannedQuantity if not provided
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId));
    if (!wo) return res.status(404).json({ message: "Work order not found" });
    
    const completedQty = req.body.completedQuantity ? Number(req.body.completedQuantity) : Number(wo.plannedQuantity);
    
    const result = await storage.completeWorkOrder(workOrderId, completedQty, userId);
    res.json(result);
  } catch (err: any) {
    console.error("completeWorkOrder error:", err);
    res.status(400).json({ message: err.message });
  }
});

// --- New Phase 1 Manufacturing Endpoints ---

router.get("/work-centers", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const data = await db.select().from(manufacturingWorkCenters).where(eq(manufacturingWorkCenters.companyId, companyId)).orderBy(desc(manufacturingWorkCenters.createdAt));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/work-centers", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const [created] = await db.insert(manufacturingWorkCenters).values({ ...req.body, companyId }).returning();
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
    const data = await db.select().from(manufacturingRoutings).where(eq(manufacturingRoutings.companyId, companyId)).orderBy(desc(manufacturingRoutings.createdAt));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/routings", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    const [created] = await db.insert(manufacturingRoutings).values({ ...req.body, companyId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/routings/:id/operations", async (req, res) => {
  try {
    const routingId = Number(req.params.id);
    const [created] = await db.insert(manufacturingRoutingOperations).values({ ...req.body, routingId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/production-runs", async (req, res) => {
  try {
    const data = await db.select().from(manufacturingProductionRuns).orderBy(desc(manufacturingProductionRuns.createdAt));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/work-orders/:id/runs", async (req, res) => {
  try {
    const workOrderId = Number(req.params.id);
    const [created] = await db.insert(manufacturingProductionRuns).values({ ...req.body, workOrderId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/work-orders/:id/issue-materials", async (req, res) => {
  try {
    const workOrderId = Number(req.params.id);
    const [created] = await db.insert(manufacturingMaterialTransactions).values({ 
      ...req.body, 
      workOrderId,
      type: "ISSUE" 
    }).returning();
    // Implementation of inventory integration will go here
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/work-orders/:id/return-materials", async (req, res) => {
  try {
    const workOrderId = Number(req.params.id);
    const [created] = await db.insert(manufacturingMaterialTransactions).values({ 
      ...req.body, 
      workOrderId,
      type: "RETURN" 
    }).returning();
    // Implementation of inventory integration will go here
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// --- Phase 2: Planning & MRP Endpoints ---

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
    const [created] = await db.insert(manufacturingProductionSchedules).values({ 
      ...req.body, 
      companyId 
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/schedules/:id/lines", async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);
    const [created] = await db.insert(manufacturingProductionScheduleLines).values({ 
      ...req.body, 
      scheduleId 
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/mrp/run", async (req, res) => {
  try {
    const companyId = Number((req.params as any).companyId);
    
    // 1. Log the MRP run
    const [run] = await db.insert(manufacturingMrpRuns).values({
      companyId,
      status: "COMPLETED",
      notes: "Auto-generated MRP Run"
    }).returning();

    // 2. Identify active Work Orders missing material reservations
    // In a real implementation, we would compare Total Work Order requirements vs Actual Stock.
    // Here we'll simulate the algorithm by looking at BOMs of planned Work Orders.
    const plannedWorkOrders = await db.select().from(workOrders)
      .where(and(
        eq(workOrders.companyId, companyId),
        eq(workOrders.status, "PLANNED")
      ));

    let newRecommendations = 0;
    
    for (const wo of plannedWorkOrders) {
      if (!wo.bomId) continue;
      
      const lines = await db.select().from(bomLines).where(eq(bomLines.bomId, wo.bomId));
      for (const line of lines) {
        // Calculate needed qty: work order planned qty * bom line qty
        const scrapFactor = 1 + (Number(line.scrapPercentage || 0) / 100);
        const totalNeeded = Number(wo.plannedQuantity) * Number(line.quantity) * scrapFactor;
        
        // Find actual stock
        const [product] = await db.select({ stockLevel: products.stockLevel }).from(products).where(eq(products.id, line.componentProductId));
        const currentStock = Number(product?.stockLevel || 0);

        // Simple MRP: shortage = needed - current
        const shortageQty = Math.max(0, totalNeeded - currentStock);
        
        if (shortageQty > 0) {
          await db.insert(manufacturingMaterialShortages).values({
            mrpRunId: run.id,
            productId: line.componentProductId,
            shortageQuantity: shortageQty.toString(),
            status: "UNRESOLVED"
          });

          // Generate recommendation
          // Check if product has its own BOM (Manufactured) or is bought (Purchase)
          const subBom = await db.select().from(billOfMaterials).where(eq(billOfMaterials.productId, line.componentProductId)).limit(1);
          
          const type = subBom.length > 0 ? "WORK_ORDER" : "PURCHASE";
          
          await db.insert(manufacturingMrpRecommendations).values({
            mrpRunId: run.id,
            productId: line.componentProductId,
            type,
            quantity: shortageQty.toString(),
            status: "PENDING"
          });
          
          newRecommendations++;
        }
      }
    }

    res.status(201).json({
      run,
      message: `MRP complete. Generated ${newRecommendations} recommendations.`
    });
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
    const [rec] = await db.select().from(manufacturingMrpRecommendations).where(eq(manufacturingMrpRecommendations.id, recommendationId));
    
    if (!rec) return res.status(404).json({ message: "Recommendation not found" });
    if (rec.status === "APPROVED") return res.status(400).json({ message: "Already approved" });

    const companyId = Number((req.params as any).companyId);
    let referenceId = null;

    if (rec.type === "PURCHASE") {
      // 1. Create a draft PO
      // Hardcode supplier for simulation (assuming supplier 1 exists)
      const supplierId = 1; 
      const poNum = "PO-MRP-" + Date.now();
      
      const [po] = await db.insert(purchaseOrders).values({
        companyId,
        supplierId,
        poNumber: poNum,
        status: "DRAFT"
      }).returning();
      
      referenceId = po.id;
    } else if (rec.type === "WORK_ORDER") {
      // Create a planned work order
      const subBom = await db.select().from(billOfMaterials).where(eq(billOfMaterials.productId, rec.productId)).limit(1);
      if (subBom.length > 0) {
        const [wo] = await db.insert(workOrders).values({
          companyId,
          bomId: subBom[0].id,
          plannedQuantity: rec.quantity.toString(),
          status: "PLANNED"
        }).returning();
        referenceId = wo.id;
      }
    } else if (rec.type === "TRANSFER") {
      // Create a stock transfer
      const trNum = "TR-MRP-" + Date.now();
      const [tr] = await db.insert(stockTransfers).values({
        companyId,
        transferNumber: trNum,
        status: "DRAFT"
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
