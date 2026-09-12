import { Router } from "express";
import { db } from "../db.js";
import { freightForwarders, consignments, insertFreightForwarderSchema, insertConsignmentSchema, consignmentPurchaseOrders, inventoryTransactions, purchaseOrderItems } from "../../shared/schema.js";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";

export function createFreightRouter(requireAuth: any) {
const router = Router();

// Get all freight forwarders
router.get("/companies/:companyId/freight/forwarders", requireAuth, async (req: any, res) => {
  try {
    const forwarders = await db
      .select()
      .from(freightForwarders)
      .where(
        and(
          eq(freightForwarders.companyId, parseInt(req.params.companyId)),
          eq(freightForwarders.isActive, true)
        )
      )
      .orderBy(freightForwarders.name);
    res.json(forwarders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch freight forwarders" });
  }
});

// Create a freight forwarder
router.post("/companies/:companyId/freight/forwarders", requireAuth, async (req: any, res) => {
  try {
    const data = insertFreightForwarderSchema.parse({
      ...req.body,
      companyId: parseInt(req.params.companyId),
    });

    const [forwarder] = await db
      .insert(freightForwarders)
      .values(data)
      .returning();

    res.status(201).json(forwarder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to create freight forwarder" });
  }
});

// Get all consignments
router.get("/companies/:companyId/freight/consignments", requireAuth, async (req: any, res) => {
  try {
    const records = await db.query.consignments.findMany({
      where: eq(consignments.companyId, parseInt(req.params.companyId)),
      orderBy: (consignments, { desc }) => [desc(consignments.createdAt)],
      with: {
        forwarder: true,
        supplier: true,
        destination: true,
        purchaseOrders: {
          with: {
            purchaseOrder: true,
          }
        }
      }
    });
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch consignments" });
  }
});

// Create a consignment
router.post("/companies/:companyId/freight/consignments", requireAuth, async (req: any, res) => {
  try {
    const { purchaseOrderIds, ...bodyData } = req.body;
    
    const data = insertConsignmentSchema.parse({
      ...bodyData,
      companyId: parseInt(req.params.companyId),
    });

    const consignment = await db.transaction(async (tx) => {
      const [newConsignment] = await tx
        .insert(consignments)
        .values(data)
        .returning();

      if (purchaseOrderIds && Array.isArray(purchaseOrderIds) && purchaseOrderIds.length > 0) {
        const poLinks = purchaseOrderIds.map((poId: number) => ({
          consignmentId: newConsignment.id,
          purchaseOrderId: poId,
        }));
        await tx.insert(consignmentPurchaseOrders).values(poLinks);
      }
      
      return newConsignment;
    });

    res.status(201).json(consignment);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to create consignment" });
  }
});

// Update a consignment status/dates
router.patch("/companies/:companyId/freight/consignments/:id", requireAuth, async (req: any, res) => {
  try {
    const consignmentId = parseInt(req.params.id);
    const { purchaseOrderIds, ...updates } = req.body;
    
    // Remove ID/companyId from updates to be safe
    delete updates.id;
    delete updates.companyId;

    if (updates.dispatchDate) updates.dispatchDate = new Date(updates.dispatchDate);
    if (updates.expectedArrivalDate) updates.expectedArrivalDate = new Date(updates.expectedArrivalDate);
    if (updates.actualArrivalDate) updates.actualArrivalDate = new Date(updates.actualArrivalDate);

    const updated = await db.transaction(async (tx) => {
      const [updatedRecord] = await tx
        .update(consignments)
        .set(updates)
        .where(
          and(
            eq(consignments.id, consignmentId),
            eq(consignments.companyId, parseInt(req.params.companyId))
          )
        )
        .returning();
        
      if (purchaseOrderIds && Array.isArray(purchaseOrderIds)) {
        await tx.delete(consignmentPurchaseOrders).where(eq(consignmentPurchaseOrders.consignmentId, consignmentId));
        if (purchaseOrderIds.length > 0) {
          const poLinks = purchaseOrderIds.map((poId: number) => ({
            consignmentId: consignmentId,
            purchaseOrderId: poId,
          }));
          await tx.insert(consignmentPurchaseOrders).values(poLinks);
        }
      }
      return updatedRecord;
    });
      
    if (!updated) {
      return res.status(404).json({ error: "Consignment not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update consignment" });
  }
});

// Receive a consignment
router.post("/companies/:companyId/freight/consignments/:id/receive", requireAuth, async (req: any, res) => {
  try {
    const consignmentId = parseInt(req.params.id);
    const companyId = parseInt(req.params.companyId);
    const { items, destinationLocationId } = req.body;

    const consignment = await db.query.consignments.findFirst({
      where: and(eq(consignments.id, consignmentId), eq(consignments.companyId, companyId))
    });

    if (!consignment) return res.status(404).json({ error: "Consignment not found" });

    await db.transaction(async (tx) => {
      // 1. Update consignment status
      await tx.update(consignments)
        .set({ status: 'RECEIVED', actualArrivalDate: new Date(), destinationLocationId })
        .where(eq(consignments.id, consignmentId));

      // 2. Create inventory transactions
      if (items && items.length > 0) {
        for (const item of items) {
          const poItem = await tx.query.purchaseOrderItems.findFirst({
            where: eq(purchaseOrderItems.id, item.purchaseOrderItemId)
          });
          if (poItem) {
            if (poItem.productId) {
              await tx.insert(inventoryTransactions).values({
                companyId,
                locationId: destinationLocationId,
                productId: poItem.productId,
                type: "STOCK_IN",
                quantity: item.receivedQuantity.toString(),
                unitCost: poItem.unitCost,
                totalCost: (parseFloat(poItem.unitCost || "0") * item.receivedQuantity).toString(),
                referenceType: "CONSIGNMENT_RECEIPT",
                referenceId: consignment.referenceNumber,
                createdBy: req.user?.id,
              });
            }
            await tx.update(purchaseOrderItems)
              .set({ quantityReceived: (parseFloat(poItem.quantityReceived || "0") + item.receivedQuantity).toString() })
              .where(eq(purchaseOrderItems.id, poItem.id));
          }
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to receive consignment" });
  }
});

return router;
}
