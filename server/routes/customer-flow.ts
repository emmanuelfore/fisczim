import { Router } from "express";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { eq, and, isNull, ne, or, gte, lte, desc, inArray, sql } from "drizzle-orm";
import { 
  salesOrders, 
  salesOrderItems, 
  quotations, 
  quotationItems, 
  invoices, 
  invoiceItems,
  customerStock,
  customerProducts,
  stockAllocations,
  salesOrderAuditLogs,
  products,
  customers,
  layBySchedules,
  stockReservations,
  compoundProducts,
  compoundProductItems,
  salesOrderSettings,
  payments,
  salesPickLists,
  salesPickListItems,
  inventoryLocationStocks,
  inventoryLocations,
  inventoryTransactions
} from "../../shared/schema.js";
import { requireApprovalOrContinue } from "../lib/approval-gate.js";
import { checkCompanyAccess } from "../lib/company-auth.js";
import { assertCanApproveType } from "../lib/approval-policies.js";
import { userHasPermission } from "../lib/permissions.js";
import { APPROVAL_TYPES } from "../../shared/permissions.js";

// The approval executor marks a quotation "approved" before it can be turned
// into an order; the conversion itself then moves it to "accepted". Both are
// post-approval states, whereas draft/sent/pending must never be converted.
const APPROVED_QUOTATION_STATUSES = new Set(["approved", "accepted"]);

/**
 * Which company a customer-flow route is acting for.
 *
 * These routes are addressed by record ids alone (/sales-orders/:id, etc.), so
 * an id is not proof of ownership. An explicitly named company is used only
 * after its membership has been verified; with no name at all we fall back to
 * the caller's single membership. Multiple memberships, an API key pointed at
 * a different tenant, or no membership at all resolve to `undefined` (403).
 */
export async function resolveCustomerFlowCompany(req: any, suppliedCompanyId?: unknown): Promise<number | undefined> {
  const user = req.user;
  if (!user) return undefined;

  const named = suppliedCompanyId ?? req.params?.companyId ?? req.query?.companyId
    ?? req.body?.companyId ?? req.headers?.["x-company-id"];
  const parsed = Number(named);
  if (named !== undefined && named !== null && named !== "" && (!Number.isInteger(parsed) || parsed <= 0)) {
    return undefined;
  }
  if (named !== undefined && named !== null && named !== "") {
    // An API key authenticates one tenant and cannot be redirected.
    if (req.apiKeyCompanyId && Number(req.apiKeyCompanyId) !== parsed) return undefined;
    return (await checkCompanyAccess(storage, user, parsed)) ? parsed : undefined;
  }

  const contextId = Number(user.companyId);
  if (Number.isInteger(contextId) && contextId > 0) {
    if (req.apiKeyCompanyId && Number(req.apiKeyCompanyId) !== contextId) return undefined;
    return (await checkCompanyAccess(storage, user, contextId)) ? contextId : undefined;
  }

  if (!user.id) return undefined;
  const memberships = await storage.getCompanies(user.id);
  const ownedIds = Array.from(new Set(
    (memberships || [])
      .map((company: any) => Number(company?.id))
      .filter((id: number) => Number.isInteger(id) && id > 0)
  ));
  return ownedIds.length === 1 ? ownedIds[0] : undefined;
}

// Legacy orders were created before approvalStatus existed; "none" also means
// no approval is required. Only a still-pending/rejected order is blocked.
export function isBlockedForFulfilment(order: { approvalStatus?: unknown } | null | undefined): boolean {
  const status = String((order as any)?.approvalStatus ?? "none").toLowerCase();
  return status === "pending" || status === "rejected";
}

export function isApprovedQuotationStatus(status: unknown): boolean {
  return APPROVED_QUOTATION_STATUSES.has(String(status ?? "").toLowerCase());
}

export function createCustomerFlowRouter(requireAuth: any) {
  const router = Router();

  const companyFor = async (req: any, res: any, suppliedCompanyId?: unknown): Promise<number | null> => {
    const companyId = await resolveCustomerFlowCompany(req, suppliedCompanyId);
    if (!companyId) {
      if (!res.headersSent) res.status(403).json({ error: "Forbidden: no access to this company" });
      return null;
    }
    return companyId;
  };

  const assertApprovedForFulfilment = (order: any, res: any): boolean => {
    if (!isBlockedForFulfilment(order)) return true;
    res.status(403).json({ error: "Sales order is not approved for fulfilment" });
    return false;
  };

  // A child row with no company_id is scoped through its parent. The subquery
  // makes the ownership check part of every write, not just the earlier read.
  const scopedOrderItemIds = (companyId: number, orderId: number) =>
    db.select({ id: salesOrderItems.id })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
      .where(and(eq(salesOrders.id, orderId), eq(salesOrders.companyId, companyId)));

  const scopedPickListIds = (companyId: number) =>
    db.select({ id: salesPickLists.id })
      .from(salesPickLists)
      .where(eq(salesPickLists.companyId, companyId));

  const scopedOrderLineIds = (companyId: number, lineId: number) =>
    db.select({ id: salesOrderItems.id })
      .from(salesOrderItems)
      .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
      .where(and(eq(salesOrderItems.id, lineId), eq(salesOrders.companyId, companyId)));

  const scopedCompoundIds = (companyId: number) =>
    db.select({ id: compoundProducts.id })
      .from(compoundProducts)
      .where(eq(compoundProducts.companyId, companyId));

  // 1. Convert Quotation -> Sales Order. Quotations are real quotation records,
  // never invoices with a "quote" status. Conversion is idempotent.
  router.post("/sales-orders/from-quotation", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;

      const quotationId = Number(req.body?.quotationId);
      if (!Number.isFinite(quotationId)) {
        return res.status(400).json({ error: "quotationId is required" });
      }

      const quote = await db.query.quotations.findFirst({
        where: and(eq(quotations.id, quotationId), eq(quotations.companyId, companyId)),
        with: { items: { with: { product: true } } }
      });

      if (!quote) return res.status(404).json({ error: "Quotation not found" });
      if (!quote.items?.length) {
        return res.status(400).json({ error: "Quotation has no lines to convert" });
      }
      if (!isApprovedQuotationStatus(quote.status)) {
        return res.status(400).json({ error: `Quotation is ${quote.status || "draft"} and must be approved before conversion` });
      }

      const firstCostedItem = quote.items.find((item: any) => item.product?.costCenterId);
      const costCenterId = quote.costCenterId ?? firstCostedItem?.product?.costCenterId ?? null;
      const departmentId = quote.departmentId ?? firstCostedItem?.product?.departmentId ?? null;

      // Return the existing order instead of creating a duplicate on retry.
      const existingOrder = await db.query.salesOrders.findFirst({
        where: and(
          eq(salesOrders.companyId, quote.companyId),
          eq(salesOrders.quotationId, quote.id)
        )
      });
      if (existingOrder) return res.json({ ...existingOrder, alreadyExists: true });

      const [newOrder] = await db.insert(salesOrders).values({
        companyId: quote.companyId,
        branchId: quote.branchId || undefined,
        customerId: quote.customerId,
        quotationId: quote.id,
        departmentId,
        costCenterId,
        orderNumber: `SO-${Date.now()}`,
        issueDate: new Date(),
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        total: quote.total,
        status: "confirmed",
        currency: quote.currency || undefined,
        notes: quote.notes || undefined,
      }).returning();

      await db.insert(salesOrderItems).values(quote.items.map((item: any) => ({
        salesOrderId: newOrder.id,
        quotationItemId: item.id,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        invoicedQuantity: "0.00",
        pickedQuantity: "0.00",
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        lineTotal: item.lineTotal,
        taxTypeId: item.taxTypeId,
      })));

      await db.update(quotations)
        .set({
          status: "accepted",
          salesOrderId: newOrder.id,
          convertedAt: new Date(),
          departmentId,
          costCenterId,
        })
        .where(and(eq(quotations.id, quote.id), eq(quotations.companyId, companyId)));

      res.status(201).json(newOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Manual Stock Receipt (enforcing customer check)
  router.post("/stock/receipt", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { locationId, productId, customerId, quantity, uom, batchId } = req.body;

      // Check exclusivity inside the acting company only.
      const exclusivity = await db.query.customerProducts.findFirst({
        where: and(
          eq(customerProducts.companyId, companyId),
          eq(customerProducts.productId, productId),
          eq(customerProducts.isExclusive, true)
        )
      });

      if (exclusivity && exclusivity.customerId !== customerId) {
        return res.status(400).json({ error: "Product is exclusive to another customer. Must provide correct customerId." });
      }

      if (!exclusivity && customerId) {
         // It's a shared product but they provided a customer_id? We allow it or clear it.
         // For now, allow it (maybe they want to reserve it).
      }

      const [newStock] = await db.insert(customerStock).values({
        companyId,
        locationId,
        productId,
        customerId: customerId || null,
        batchId: batchId || null,
        quantity,
        uom,
        status: "AVAILABLE",
      }).returning();

      res.json(newStock);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Allocate Stock to a Sales Order Line
  router.post("/sales-orders/:id/allocate", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { id } = req.params;
      const { stockId, quantity } = req.body;

      const order = await db.query.salesOrders.findFirst({
        where: and(eq(salesOrders.id, parseInt(id)), eq(salesOrders.companyId, companyId))
      });

      if (!order) return res.status(404).json({ error: "Sales Order not found" });

      const stock = await db.query.customerStock.findFirst({
        where: and(eq(customerStock.id, stockId), eq(customerStock.companyId, companyId))
      });

      if (!stock) return res.status(404).json({ error: "Stock not found" });

      // STRICT OWNERSHIP CHECK
      if (stock.customerId !== null && stock.customerId !== order.customerId) {
        return res.status(403).json({ error: "Cannot allocate another customer's exclusive stock to this order." });
      }

      const allocResult = await db.execute(sql`
        SELECT COALESCE(SUM(sa.quantity_allocated), 0) AS total_allocated
        FROM stock_allocations sa
        JOIN customer_stock cs ON cs.id = sa.stock_id
        WHERE sa.stock_id = ${stockId} AND cs.company_id = ${companyId} AND sa.released_at IS NULL
      `);
      
      const totalAllocated = Number(allocResult.rows[0].total_allocated || 0);
      const availableQuantity = Number(stock.quantity) - totalAllocated;

      if (availableQuantity < Number(quantity)) {
        return res.status(400).json({ error: `Insufficient stock quantity. On hand: ${stock.quantity}, Available: ${availableQuantity}` });
      }

      const orderLines = await db.query.salesOrderItems.findMany({
        where: and(
           eq(salesOrderItems.salesOrderId, parseInt(id)),
           eq(salesOrderItems.productId, stock.productId)
        )
      });
      
      if (orderLines.length === 0) {
        return res.status(400).json({ error: "Order does not contain the product for this stock ID." });
      }
      const orderLineId = orderLines[0].id; // Assign to first matching line

      await db.insert(stockAllocations).values({
        stockId: parseInt(stockId),
        salesOrderLineId: orderLineId,
        quantityAllocated: quantity.toString()
      });

      res.json({ message: "Stock allocated successfully", salesOrderItemId: orderLineId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const resolveDispatchLocationId = async (companyId: number): Promise<number | null> => {
    const [defaultLocation] = await db
      .select({ id: inventoryLocations.id })
      .from(inventoryLocations)
      .where(and(
        eq(inventoryLocations.companyId, companyId),
        eq(inventoryLocations.isDefaultDispatch, true),
        eq(inventoryLocations.isActive, true)
      ))
      .orderBy(desc(inventoryLocations.id))
      .limit(1);
    if (defaultLocation) return defaultLocation.id;

    const [anyLocation] = await db
      .select({ id: inventoryLocations.id })
      .from(inventoryLocations)
      .where(and(
        eq(inventoryLocations.companyId, companyId),
        eq(inventoryLocations.isActive, true)
      ))
      .orderBy(desc(inventoryLocations.id))
      .limit(1);
    return anyLocation?.id ?? null;
  };

  const loadPickList = async (orderId: number, companyId: number) => {
    const order = await db.query.salesOrders.findFirst({
      where: and(eq(salesOrders.id, orderId), eq(salesOrders.companyId, companyId)),
      with: { items: { with: { product: true } } }
    });
    if (!order) return null;

    const [activeInvoice] = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status })
      .from(invoices)
      .where(and(
        eq(invoices.companyId, companyId),
        eq(invoices.salesOrderId, orderId),
        ne(invoices.status, "cancelled")
      ))
      .orderBy(desc(invoices.id))
      .limit(1);

    const [pickList] = await db
      .select()
      .from(salesPickLists)
      .where(and(
        eq(salesPickLists.companyId, companyId),
        eq(salesPickLists.salesOrderId, orderId),
        ne(salesPickLists.status, "CANCELLED")
      ))
      .orderBy(desc(salesPickLists.id))
      .limit(1);

    const locationId = pickList?.locationId ?? order.locationId ?? await resolveDispatchLocationId(companyId);
    const pickListItems = pickList
      ? await db
          .select({
            id: salesPickListItems.id,
            salesOrderItemId: salesPickListItems.salesOrderItemId,
            pickedQuantity: salesPickListItems.pickedQuantity,
          })
          .from(salesPickListItems)
          .innerJoin(
            salesPickLists,
            and(
              eq(salesPickListItems.pickListId, salesPickLists.id),
              eq(salesPickLists.companyId, companyId)
            )
          )
          .where(eq(salesPickListItems.pickListId, pickList.id))
      : [];

    const productIds = order.items
      .map((item: any) => item.productId)
      .filter((id: any): id is number => Number.isFinite(id));
    const stockRows = productIds.length && locationId
      ? await db
          .select({
            productId: inventoryLocationStocks.productId,
            availableQuantity: inventoryLocationStocks.availableQuantity,
            stockLevel: inventoryLocationStocks.stockLevel,
          })
          .from(inventoryLocationStocks)
          .innerJoin(
            inventoryLocations,
            and(
              eq(inventoryLocationStocks.locationId, inventoryLocations.id),
              eq(inventoryLocations.companyId, companyId)
            )
          )
          .where(and(
            eq(inventoryLocationStocks.locationId, locationId),
            inArray(inventoryLocationStocks.productId, productIds)
          ))
      : [];
    const stockByProduct = new Map<number, { available: number; onHand: number }>();
    for (const row of stockRows) {
      stockByProduct.set(row.productId, {
        available: Number(row.availableQuantity ?? row.stockLevel ?? 0),
        onHand: Number(row.stockLevel ?? 0),
      });
    }

    const items = order.items.map((item: any) => {
      const remaining = Math.max(Number(item.quantity || 0) - Number(item.invoicedQuantity || 0), 0);
      const saved = pickListItems.find((p: any) => p.salesOrderItemId === item.id);
      const stock = stockByProduct.get(item.productId) || { available: 0, onHand: 0 };
      return {
        salesOrderItemId: item.id,
        productId: item.productId,
        description: item.description,
        sku: item.product?.sku ?? null,
        costPrice: item.product?.costPrice ?? null,
        orderedQuantity: Number(item.quantity || 0),
        invoicedQuantity: Number(item.invoicedQuantity || 0),
        remainingQuantity: remaining,
        pickedQuantity: saved ? Number(saved.pickedQuantity || 0) : Number(item.pickedQuantity || 0),
        availableQuantity: stock.available,
        onHandQuantity: stock.onHand,
        pickListItemId: saved?.id ?? null,
      };
    });

    const locations = await db
      .select({
        id: inventoryLocations.id,
        code: inventoryLocations.code,
        name: inventoryLocations.name,
        type: inventoryLocations.type,
        isDefaultDispatch: inventoryLocations.isDefaultDispatch,
      })
      .from(inventoryLocations)
      .where(and(eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.isActive, true)))
      .orderBy(desc(inventoryLocations.isDefaultDispatch), desc(inventoryLocations.id));

    return { order, pickList: pickList ?? null, activeInvoice: activeInvoice ?? null, locationId, items, locations };
  };

  // 4a. Read the picking worksheet for a sales order. Always returns every
  // order line, even when no pick list has been prepared yet.
  router.get("/sales-orders/:id/pick-list", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const data = await loadPickList(Number(req.params.id), companyId);
      if (!data) return res.status(404).json({ error: "Sales Order not found" });
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4b. Create or update the pick list. Quantities default to the remaining
  // quantity on each order line, so warehouse staff see the full worksheet.
  router.post("/sales-orders/:id/pick-list", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const orderId = Number(req.params.id);
      const data = await loadPickList(orderId, companyId);
      if (!data) return res.status(404).json({ error: "Sales Order not found" });
      if (!assertApprovedForFulfilment(data.order, res)) return;

      const requestedLocationId = Number(req.body?.locationId);
      const locationId = Number.isFinite(requestedLocationId) && requestedLocationId > 0
        ? requestedLocationId
        : data.locationId;

      let pickListId = data.pickList?.id;
      if (!pickListId) {
        const [created] = await db.insert(salesPickLists).values({
          companyId,
          salesOrderId: orderId,
          pickNumber: `PICK-${Date.now()}`,
          status: "DRAFT",
          locationId: locationId ?? null,
          notes: req.body?.notes || null,
        }).returning();
        pickListId = created.id;
      } else if (locationId && locationId !== data.pickList?.locationId) {
        await db.update(salesPickLists)
          .set({ locationId, updatedAt: new Date() })
          .where(and(eq(salesPickLists.id, pickListId), eq(salesPickLists.companyId, companyId)));
      }

      const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
      for (const item of data.items) {
        const requested = requestedItems.find((r: any) => Number(r.salesOrderItemId) === item.salesOrderItemId);
        const pickedQuantity = requested
          ? Math.max(0, Math.min(Number(requested.quantity ?? requested.pickedQuantity ?? 0), item.remainingQuantity))
          : item.pickedQuantity || item.remainingQuantity;

        if (item.pickListItemId) {
          await db.update(salesPickListItems)
            .set({ pickedQuantity: pickedQuantity.toString() })
            .where(and(
              eq(salesPickListItems.id, item.pickListItemId),
              eq(salesPickListItems.pickListId, pickListId),
              inArray(salesPickListItems.pickListId, scopedPickListIds(companyId))
            ));
        } else {
          await db.insert(salesPickListItems).values({
            pickListId,
            salesOrderItemId: item.salesOrderItemId,
            productId: item.productId ?? null,
            description: item.description,
            orderedQuantity: item.orderedQuantity.toString(),
            pickedQuantity: pickedQuantity.toString(),
          });
        }
      }

      res.json(await loadPickList(orderId, companyId));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4c. Confirm picking. Picked quantities are copied onto the order lines and
  // the order moves to PICKED so invoicing can be gated on fulfilment.
  router.post("/sales-orders/:id/pick-list/confirm", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const orderId = Number(req.params.id);
      const data = await loadPickList(orderId, companyId);
      if (!data) return res.status(404).json({ error: "Sales Order not found" });
      if (!assertApprovedForFulfilment(data.order, res)) return;
      if (!data.pickList) return res.status(400).json({ error: "Prepare the pick list first" });
      if (data.pickList.status !== "DRAFT") {
        return res.json(await loadPickList(orderId, companyId));
      }

      // Accept the latest worksheet values so the user can save and confirm in
      // one step. Quantities are clamped to the uninvoiced balance per line.
      const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
      for (const item of data.items) {
        const requested = requestedItems.find((r: any) => Number(r.salesOrderItemId) === item.salesOrderItemId);
        if (!requested || !item.pickListItemId) continue;
        const pickedQuantity = Math.max(
          0,
          Math.min(Number(requested.quantity ?? requested.pickedQuantity ?? 0), item.remainingQuantity)
        );
        await db.update(salesPickListItems)
          .set({ pickedQuantity: pickedQuantity.toString() })
          .where(and(
            eq(salesPickListItems.id, item.pickListItemId),
            eq(salesPickListItems.pickListId, data.pickList.id),
            inArray(salesPickListItems.pickListId, scopedPickListIds(companyId))
          ));
      }

      const confirmed = await loadPickList(orderId, companyId);
      if (!confirmed?.items.some((item: any) => Number(item.pickedQuantity) > 0)) {
        return res.status(400).json({ error: "Pick at least one item" });
      }

      const userId = (req.user as any)?.id ?? null;
      for (const item of confirmed.items) {
        await db.update(salesOrderItems)
          .set({ pickedQuantity: Number(item.pickedQuantity || 0).toString() })
          .where(and(
            eq(salesOrderItems.id, item.salesOrderItemId),
            eq(salesOrderItems.salesOrderId, orderId),
            inArray(salesOrderItems.id, scopedOrderItemIds(companyId, orderId))
          ));
      }
      await db.update(salesPickLists)
        .set({ status: "PICKED", pickedBy: userId, pickedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(salesPickLists.id, data.pickList.id), eq(salesPickLists.companyId, companyId)));
      await db.update(salesOrders)
        .set({ status: "picked" })
        .where(and(eq(salesOrders.id, orderId), eq(salesOrders.companyId, companyId)));

      res.json(await loadPickList(orderId, companyId));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4d. Dispatch creates the delivery reference and moves the order ready for
  // invoicing. Partial dispatch is supported by picking fewer than ordered.
  router.post("/sales-orders/:id/dispatch", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const orderId = Number(req.params.id);
      const data = await loadPickList(orderId, companyId);
      if (!data) return res.status(404).json({ error: "Sales Order not found" });
      if (!assertApprovedForFulfilment(data.order, res)) return;
      if (!data.pickList || data.pickList.status !== "PICKED") {
        return res.status(400).json({ error: "Confirm picking before dispatch" });
      }

      const userId = (req.user as any)?.id ?? null;
      const deliveryNumber = req.body?.deliveryNumber || data.pickList.deliveryNumber || `DN-${Date.now()}`;
      await db.update(salesPickLists)
        .set({
          status: "DISPATCHED",
          dispatchedBy: userId,
          dispatchedAt: new Date(),
          deliveryNumber,
          recipientName: req.body?.recipientName || null,
          deliveryNotes: req.body?.deliveryNotes || null,
          updatedAt: new Date(),
        })
        .where(and(eq(salesPickLists.id, data.pickList.id), eq(salesPickLists.companyId, companyId)));
      await db.update(salesOrders)
        .set({ status: "dispatched" })
        .where(and(eq(salesOrders.id, orderId), eq(salesOrders.companyId, companyId)));

      for (const item of data.items) {
        const quantity = Number(item.pickedQuantity || 0);
        if (quantity <= 0 || !item.productId || !data.locationId) continue;

        const [stockRow] = await db
          .select({ id: inventoryLocationStocks.id })
          .from(inventoryLocationStocks)
          .innerJoin(
            inventoryLocations,
            and(
              eq(inventoryLocationStocks.locationId, inventoryLocations.id),
              eq(inventoryLocations.companyId, companyId)
            )
          )
          .where(and(
            eq(inventoryLocationStocks.locationId, data.locationId),
            eq(inventoryLocationStocks.productId, item.productId)
          ))
          .limit(1);
        if (!stockRow) continue;

        await db.execute(sql`
          UPDATE inventory_location_stocks
          SET stock_level = GREATEST(stock_level - ${quantity}, 0),
              available_quantity = GREATEST(available_quantity - ${quantity}, 0),
              updated_at = now()
          WHERE id = ${stockRow.id}
            AND location_id IN (SELECT id FROM inventory_locations WHERE company_id = ${companyId})
        `);

        const unitCost = Number(item.costPrice || 0);
        await db.insert(inventoryTransactions).values({
          companyId,
          branchId: data.order.branchId,
          locationId: data.locationId,
          departmentId: data.order.departmentId ?? null,
          costCenterId: data.order.costCenterId ?? null,
          productId: item.productId,
          type: "STOCK_OUT",
          quantity: (-quantity).toString(),
          unitCost: unitCost ? unitCost.toString() : null,
          totalCost: unitCost ? (unitCost * quantity).toString() : null,
          referenceType: "SALES_PICK_LIST",
          referenceId: String(data.pickList.id),
          notes: `${deliveryNumber} — dispatched for ${data.order.orderNumber}`,
          createdBy: userId,
          remainingQuantity: "0",
        });
      }

      res.json(await loadPickList(orderId, companyId));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Invoice a Sales Order. Idempotent: repeated calls return the existing
  // active invoice instead of creating a second one.
  router.post("/invoices/from-sales-order", requireAuth, async (req, res) => {
    let companyId: any = 0;
    let salesOrderId: any = 0;
    try {
      companyId = await companyFor(req, res);
      if (!companyId) return;
      salesOrderId = Number(req.body?.salesOrderId);
      if (!Number.isFinite(salesOrderId)) {
        return res.status(400).json({ error: "salesOrderId is required" });
      }

      const order = await db.query.salesOrders.findFirst({
        where: and(eq(salesOrders.id, salesOrderId), eq(salesOrders.companyId, companyId)),
        with: { items: true }
      });
      if (!order) return res.status(404).json({ error: "Sales order not found" });
      if (!assertApprovedForFulfilment(order, res)) return;

      // One active invoice per sales order. Return the existing document on a
      // retry instead of silently creating a duplicate.
      const [existingInvoice] = await db
        .select()
        .from(invoices)
        .where(and(
          eq(invoices.companyId, companyId),
          eq(invoices.salesOrderId, salesOrderId),
          ne(invoices.status, "cancelled")
        ))
        .orderBy(desc(invoices.id))
        .limit(1);
      if (existingInvoice) {
        return res.json({ ...existingInvoice, alreadyExists: true });
      }

      const fulfillment = await loadPickList(salesOrderId, companyId);
      if (!fulfillment?.pickList || fulfillment.pickList.status !== "DISPATCHED") {
        return res.status(400).json({
          error: "Prepare, pick and dispatch the order before generating an invoice"
        });
      }

      const requestedItems = Array.isArray(req.body?.itemsToInvoice) ? req.body.itemsToInvoice : [];
      const linesToInvoice = (requestedItems.length
        ? requestedItems.map((r: any) => {
            const picked = fulfillment.items.find((p: any) => p.salesOrderItemId === Number(r.salesOrderItemId));
            const qty = Number(r.quantityToInvoice ?? r.quantity ?? 0);
            if (!picked) throw new Error(`Order line ${r.salesOrderItemId} is not on the pick list`);
            if (qty <= 0) return null;
            if (qty > picked.pickedQuantity) {
              throw new Error(`Cannot invoice ${qty} for ${picked.description}; only ${picked.pickedQuantity} was picked`);
            }
            return { salesOrderItemId: picked.salesOrderItemId, quantityToInvoice: qty };
          }).filter(Boolean)
        : fulfillment.items
            .filter((p: any) => Number(p.pickedQuantity) > 0)
            .map((p: any) => ({ salesOrderItemId: p.salesOrderItemId, quantityToInvoice: p.pickedQuantity }))) as Array<{
              salesOrderItemId: number;
              quantityToInvoice: number;
            }>;

      if (!linesToInvoice.length) {
        return res.status(400).json({ error: "No picked items available to invoice" });
      }

      let invoiceSubtotal = 0;
      let invoiceTax = 0;

      const invoiceItemsData = linesToInvoice.map((reqItem) => {
        const orderLine = order.items.find(i => i.id === reqItem.salesOrderItemId);
        if (!orderLine) throw new Error(`Order line ${reqItem.salesOrderItemId} not found`);

        const lineTotal = Number(orderLine.unitPrice) * Number(reqItem.quantityToInvoice);
        const taxAmt = lineTotal * (Number(orderLine.taxRate) / 100);

        invoiceSubtotal += lineTotal;
        invoiceTax += taxAmt;

        return {
          productId: orderLine.productId,
          salesOrderItemId: orderLine.id,
          description: orderLine.description,
          quantity: reqItem.quantityToInvoice,
          unitPrice: orderLine.unitPrice,
          taxRate: orderLine.taxRate,
          lineTotal: lineTotal.toString(),
          taxTypeId: orderLine.taxTypeId,
        };
      });

      const itemsToInvoice = linesToInvoice;
      const invoiceTotal = invoiceSubtotal + invoiceTax;

      // The invoice, GL postings and order status must form one atomic unit.
      // A duplicate retry is handled by the active-invoice guard above and the
      // partial unique index in the database.
      let createdInvoice: any;
      await db.transaction(async (tx) => {
        // Create invoice
        const [newInvoice] = await tx.insert(invoices).values({
          companyId: order.companyId,
          branchId: order.branchId,
          customerId: (order.customerId || undefined) as any,
          salesOrderId: order.id,
          departmentId: order.departmentId ?? null,
          costCenterId: order.costCenterId ?? null,
          locationId: fulfillment.locationId ?? order.locationId ?? null,
          invoiceNumber: `INV-${Date.now()}`,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          subtotal: invoiceSubtotal.toString(),
          taxAmount: invoiceTax.toString(),
          total: invoiceTotal.toString(),
          status: "draft",
        }).returning();

        await tx.insert(invoiceItems).values(
          invoiceItemsData.map((item: any) => ({
            ...item,
            invoiceId: newInvoice.id
          }))
        );

        // Post the customer document with the originating department's cost centre.
        try {
          const costCenterId = newInvoice.costCenterId ?? order.costCenterId ?? null;
          const [arAccountCode, salesAccountCode, vatAccountCode, cogsAccountCode, inventoryAccountCode] = await Promise.all([
            storage.getSystemAccountCode(order.companyId, "accountsReceivableCode", tx),
            storage.getSystemAccountCode(order.companyId, "salesRevenueAccountCode", tx),
            storage.getSystemAccountCode(order.companyId, "vatOutputAccountCode", tx),
            storage.getSystemAccountCode(order.companyId, "cogsAccountCode", tx),
            storage.getSystemAccountCode(order.companyId, "inventoryAccountCode", tx),
          ]);

          const revenueLines: any[] = [
            { accountCode: arAccountCode, type: "DEBIT", amount: invoiceTotal, costCenterId },
            { accountCode: salesAccountCode, type: "CREDIT", amount: invoiceSubtotal, costCenterId },
          ];
          if (invoiceTax > 0) {
            revenueLines.push({ accountCode: vatAccountCode, type: "CREDIT", amount: invoiceTax, costCenterId });
          }
          await storage.postToLedger(order.companyId, {
            entryDate: newInvoice.issueDate || new Date(),
            description: `Invoice ${newInvoice.invoiceNumber}`,
            referenceType: "INVOICE",
            referenceId: String(newInvoice.id),
            createdBy: (req.user as any)?.id || undefined,
            lines: revenueLines,
          } as any, tx);

          const cogs = itemsToInvoice.reduce((sum, item) => {
            const picked = fulfillment.items.find((p: any) => p.salesOrderItemId === item.salesOrderItemId);
            return sum + Number(picked?.costPrice || 0) * Number(item.quantityToInvoice);
          }, 0);
          if (cogs > 0) {
            await storage.postToLedger(order.companyId, {
              entryDate: newInvoice.issueDate || new Date(),
              description: `COGS for Invoice ${newInvoice.invoiceNumber}`,
              referenceType: "INVOICE",
              referenceId: String(newInvoice.id),
              createdBy: (req.user as any)?.id || undefined,
              lines: [
                { accountCode: cogsAccountCode, type: "DEBIT", amount: cogs, costCenterId },
                { accountCode: inventoryAccountCode, type: "CREDIT", amount: cogs, costCenterId },
              ],
            } as any, tx);
          }
        } catch (postingError: any) {
          console.error("[SALES_ORDER_INVOICE_POSTING]", postingError?.message || postingError);
          throw new Error(`Invoice GL posting failed: ${postingError?.message || postingError}`);
        }

        // Deduct stock for each invoiced line. Allocations have no company_id,
        // so both the stock and the order line are checked through their
        // company-owned parents before an allocation is released.
        const scopedAllocationFilter = (lineId: number) => and(
          eq(stockAllocations.salesOrderLineId, lineId),
          isNull(stockAllocations.releasedAt),
          inArray(stockAllocations.id, tx
            .select({ id: stockAllocations.id })
            .from(stockAllocations)
            .innerJoin(customerStock, eq(stockAllocations.stockId, customerStock.id))
            .innerJoin(salesOrderItems, eq(stockAllocations.salesOrderLineId, salesOrderItems.id))
            .innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
            .where(and(eq(customerStock.companyId, companyId), eq(salesOrders.companyId, companyId))))
        );

        for (const reqItem of itemsToInvoice) {
          const allocs = await tx
            .select({
              id: stockAllocations.id,
              stockId: stockAllocations.stockId,
              salesOrderLineId: stockAllocations.salesOrderLineId,
              quantityAllocated: stockAllocations.quantityAllocated,
            })
            .from(stockAllocations)
            .where(scopedAllocationFilter(reqItem.salesOrderItemId));

          let qtyToDeduct = Number(reqItem.quantityToInvoice);
          for (const alloc of allocs) {
            if (qtyToDeduct <= 0) break;
            const allocQty = Number(alloc.quantityAllocated);
            const deductFromAlloc = Math.min(allocQty, qtyToDeduct);

            await tx.update(stockAllocations)
              .set({ releasedAt: new Date() })
              .where(and(eq(stockAllocations.id, alloc.id), scopedAllocationFilter(reqItem.salesOrderItemId)));
            if (deductFromAlloc < allocQty) {
              await tx.insert(stockAllocations).values({
                stockId: alloc.stockId,
                salesOrderLineId: alloc.salesOrderLineId,
                quantityAllocated: (allocQty - deductFromAlloc).toString()
              });
            }

            await tx.execute(sql`
               UPDATE customer_stock
               SET quantity = quantity - ${deductFromAlloc}
               WHERE id = ${alloc.stockId} AND company_id = ${companyId}
            `);

            qtyToDeduct -= deductFromAlloc;
          }
        }

        // Warehouse stock was posted out at dispatch; invoicing only creates the
        // customer document and updates the ordered quantities.

        // Update sales order item invoiced quantities
        for (const reqItem of itemsToInvoice) {
          const orderLine = order.items.find(i => i.id === reqItem.salesOrderItemId)!;
          const newInvoicedQty = Number(orderLine.invoicedQuantity) + Number(reqItem.quantityToInvoice);

          await tx.update(salesOrderItems)
            .set({ invoicedQuantity: newInvoicedQty.toString() })
            .where(and(
              eq(salesOrderItems.id, orderLine.id),
              eq(salesOrderItems.salesOrderId, order.id),
              inArray(salesOrderItems.id, scopedOrderItemIds(companyId, order.id))
            ));

          orderLine.invoicedQuantity = newInvoicedQty.toString(); // Update memory for check
        }

        // Check if ALL lines on the order are fully invoiced
        let fullyInvoiced = true;
        for (const orderLine of order.items) {
          if (Number(orderLine.invoicedQuantity) < Number(orderLine.quantity)) {
            fullyInvoiced = false;
            break;
          }
        }

        // Update order status
        await tx.update(salesOrders)
          .set({ status: fullyInvoiced ? "invoiced" : "partially_invoiced" })
          .where(and(eq(salesOrders.id, order.id), eq(salesOrders.companyId, companyId)));

        createdInvoice = newInvoice;
      });

      res.json(createdInvoice);
    } catch (error: any) {
      if (error?.code === "23505" && companyId && salesOrderId) {
        const [existingInvoice] = await db
          .select()
          .from(invoices)
          .where(and(
            eq(invoices.companyId, companyId),
            eq(invoices.salesOrderId, salesOrderId),
            ne(invoices.status, "cancelled")
          ))
          .limit(1);
        if (existingInvoice) {
          return res.json({ ...existingInvoice, alreadyExists: true });
        }
      }
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Statement View
  router.get("/customers/:id/statement-view", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { id } = req.params;
      const { dateFrom, dateTo } = req.query as any;

      // Get base data
      const result = await db.execute(sql`
        SELECT * FROM customer_statements_view
        WHERE customer_id = ${id} AND company_id = ${companyId}
      `);
      const stmt = result.rows && result.rows.length > 0 ? result.rows[0] as any : {};

      // Get full customer record, scoped to the acting company
      const custResult = await db.execute(sql`
        SELECT * FROM customers WHERE id = ${id} AND company_id = ${companyId} LIMIT 1
      `);
      if (!custResult.rows || custResult.rows.length === 0) {
        return res.status(404).json({ error: "Customer not found" });
      }
      const customer = custResult.rows[0] as any;

      const compResult = await db.execute(sql`
        SELECT id, name, trading_name, address, city, country, phone, email, tin, vat_number
        FROM companies WHERE id = ${companyId} LIMIT 1
      `);
      const company = compResult.rows?.[0] ?? {};

      // Date range for the ledger (default: full history starting 2020)
      const from = dateFrom || "2020-01-01";
      const to = dateTo || new Date().toISOString().split('T')[0];
      const fromStart = `${from} 00:00:00`;
      const toEnd = `${to} 23:59:59.999`;

      // Opening balance = opening_balance field + all transactions BEFORE the from date
      const obResult = await db.execute(sql`
        SELECT
          COALESCE(c.opening_balance, 0) +
          COALESCE((
            SELECT SUM(
              CASE WHEN i.transaction_type = 'CreditNote' THEN -i.total
                   ELSE i.total END
            )
            FROM invoices i
            WHERE i.customer_id = ${id}
              AND i.company_id = ${companyId}
              AND i.issue_date < ${fromStart}
              AND i.status NOT IN ('cancelled','quote')
          ), 0) -
          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            WHERE i.customer_id = ${id}
              AND i.company_id = ${companyId}
              AND p.payment_date < ${fromStart}
          ), 0) AS opening_balance
        FROM customers c WHERE c.id = ${id} AND c.company_id = ${companyId}
      `);
      const openingBalance = Number((obResult.rows[0] as any)?.opening_balance || 0);

      // Period invoices as ledger rows
      const ledgerResult = await db.execute(sql`
        SELECT
          i.issue_date AS date,
          i.invoice_number AS reference,
          CASE
            WHEN i.transaction_type = 'CreditNote' THEN 'Credit Note Issued'
            WHEN i.transaction_type = 'DebitNote' THEN 'Debit Note Issued'
            ELSE 'Invoice Issued'
          END AS description,
          CASE WHEN i.transaction_type = 'CreditNote' THEN 0 ELSE COALESCE(i.total, 0) END AS debit,
          CASE WHEN i.transaction_type = 'CreditNote' THEN COALESCE(i.total, 0) ELSE 0 END AS credit,
          'invoice' AS entry_type
        FROM invoices i
        WHERE i.customer_id = ${id}
          AND i.company_id = ${companyId}
          AND i.issue_date >= ${fromStart}
          AND i.issue_date <= ${toEnd}
          AND i.status NOT IN ('cancelled','quote')
        UNION ALL
        SELECT
          p.payment_date AS date,
          COALESCE(p.reference, 'PAY-' || p.id::text) AS reference,
          'Payment Received' AS description,
          0 AS debit,
          COALESCE(p.amount, 0) AS credit,
          'payment' AS entry_type
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        WHERE i.customer_id = ${id}
          AND i.company_id = ${companyId}
          AND p.payment_date >= ${fromStart}
          AND p.payment_date <= ${toEnd}
        ORDER BY date ASC, entry_type DESC
      `);

      let runningBalance = openingBalance;
      const periodTotalInvoiced = (ledgerResult.rows as any[])
        .reduce((sum, r) => sum + Number(r.debit || 0), 0);
      const periodTotalPaid = (ledgerResult.rows as any[])
        .reduce((sum, r) => sum + Number(r.credit || 0), 0);

      const transactions = (ledgerResult.rows as any[]).map((row) => {
        runningBalance += Number(row.debit || 0) - Number(row.credit || 0);
        return {
          date: row.date,
          reference: row.reference,
          description: row.description,
          debit: Number(row.debit || 0),
          credit: Number(row.credit || 0),
          balance: runningBalance,
          entry_type: row.entry_type,
        };
      });

      // Exclusive / linked stock
      const stockResult = await db.execute(sql`
        SELECT
          cp.id, p.id AS product_id, p.name AS product_name, p.sku, p.unit_of_measure AS uom,
          cp.customer_sku, cp.is_exclusive,
          (
            COALESCE((
              SELECT SUM(s.quantity) FROM customer_stock s
              WHERE s.product_id = p.id
                AND s.customer_id = ${id}
                AND s.company_id = ${companyId}
            ), 0)
            +
            COALESCE(p.stock_level, 0)
          ) AS quantity_on_hand,
          
          (
            COALESCE((
              SELECT SUM(s.quantity) - COALESCE((
                SELECT SUM(sa.quantity_allocated) 
                FROM stock_allocations sa 
                JOIN customer_stock cs ON cs.id = sa.stock_id
                WHERE cs.product_id = p.id
                  AND cs.customer_id = ${id}
                  AND cs.company_id = ${companyId}
                  AND sa.released_at IS NULL
              ), 0)
              FROM customer_stock s
              WHERE s.product_id = p.id
                AND s.customer_id = ${id}
                AND s.company_id = ${companyId}
            ), 0)
            +
            COALESCE(p.stock_level, 0)
          ) AS available_quantity
        FROM customer_products cp
        JOIN products p ON p.id = cp.product_id
        WHERE cp.customer_id = ${id}
          AND cp.company_id = ${companyId}
          AND p.company_id = ${companyId}
        ORDER BY p.name
      `);

      // Items sold during period (Stock Ledger)
      const itemsSoldResult = await db.execute(sql`
        SELECT
          i.issue_date AS date,
          i.invoice_number AS reference,
          p.sku,
          p.name AS product_name,
          p.unit_of_measure AS uom,
          0 AS qty_in,
          ii.quantity AS qty_out,
          ii.unit_price,
          ii.line_total AS total_value,
          'invoice' AS type
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        LEFT JOIN products p ON p.id = ii.product_id
        WHERE i.customer_id = ${id}
          AND i.company_id = ${companyId}
          AND p.company_id = ${companyId}
          AND i.issue_date >= ${fromStart}
          AND i.issue_date <= ${toEnd}
          AND i.status NOT IN ('cancelled','quote')
          
        UNION ALL
        
        SELECT
          cst.created_at::date AS date,
          cst.reference_id AS reference,
          p.sku,
          p.name AS product_name,
          p.unit_of_measure AS uom,
          cst.quantity AS qty_in,
          0 AS qty_out,
          0 AS unit_price,
          0 AS total_value,
          'receipt' AS type
        FROM inventory_transactions cst
        JOIN products p ON p.id = cst.product_id
        WHERE cst.customer_id = ${id}
          AND cst.company_id = ${companyId}
          AND p.company_id = ${companyId}
          AND cst.type = 'STOCK_IN'
          AND cst.created_at >= ${fromStart}
          AND cst.created_at <= ${toEnd}
          
        ORDER BY date ASC, reference ASC
      `);

      res.json({
        ...stmt,
        company,
        customer,
        date_from: from,
        date_to: to,
        opening_balance: openingBalance,
        period_total_invoiced: periodTotalInvoiced,
        period_total_paid: periodTotalPaid,
        balance_due: runningBalance,
        transactions,
        exclusive_stock: stockResult.rows,
        items_sold: itemsSoldResult.rows,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });




  // Report endpoints
  router.get("/sales-orders/reports/preorders", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;

      const all = await db.query.salesOrders.findMany({
        where: and(eq(salesOrders.companyId, companyId), eq(salesOrders.orderType as any, 'preorder')),
        with: { customer: true, items: true },
        orderBy: (salesOrders, { desc }) => [desc(salesOrders.issueDate)],
      });

      const now = new Date();
      const active = all.filter(o => !['completed','cancelled'].includes(o.status));
      const delayed = all.filter(o => {
        if (!(o as any).expectedArrival) return false;
        return new Date((o as any).expectedArrival) < now && !['completed','cancelled'].includes(o.status);
      });
      const depositsCollected = all.reduce((s, o) => s + parseFloat((o as any).depositPaid || '0'), 0);
      const outstandingBalances = all.reduce((s, o) => s + parseFloat((o as any).remainingBalance || '0'), 0);

      res.json({ active, delayed, depositsCollected, outstandingBalances, all });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/sales-orders/reports/lay-bys", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;

      const all = await db.query.salesOrders.findMany({
        where: and(eq(salesOrders.companyId, companyId), eq(salesOrders.orderType as any, 'lay_by')),
        with: { customer: true, items: true },
        orderBy: (salesOrders, { desc }) => [desc(salesOrders.issueDate)],
      });

      const schedules = await db
        .select()
        .from(layBySchedules)
        .innerJoin(salesOrders, eq(layBySchedules.salesOrderId, salesOrders.id))
        .where(eq(salesOrders.companyId, companyId));

      const now = new Date();
      const active = all.filter(o => o.status === 'active');
      const defaulted = all.filter(o => o.status === 'defaulted');
      const completed = all.filter(o => o.status === 'completed');
      const upcomingPayments = schedules.filter((s: any) => {
        const due = new Date(s.lay_by_schedules.dueDate);
        const inNext30 = due >= now && due <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        return inNext30 && s.lay_by_schedules.status === 'pending';
      });

      res.json({ active, defaulted, completed, upcomingPayments, all });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/sales-orders/reports/bundles", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;

      const bundles = await db.query.compoundProducts.findMany({
        where: eq(compoundProducts.companyId, companyId),
        with: { items: { with: { product: true } } },
      });
      res.json({ bundles });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Settings Endpoints
  router.get("/sales-order-settings", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;

      const settings = await db.query.salesOrderSettings.findFirst({
        where: eq(salesOrderSettings.companyId, companyId),
      });

      res.json(settings || {
        companyId,
        airPreorderMinDepositPct: "50.00",
        seaPreorderMinDepositPct: "30.00",
        laybyMinDepositPct: "10.00",
        laybyDefaultDurationMonths: 3,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/sales-order-settings", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { airPreorderMinDepositPct, seaPreorderMinDepositPct, laybyMinDepositPct, laybyDefaultDurationMonths } = req.body;

      const existing = await db.query.salesOrderSettings.findFirst({
        where: eq(salesOrderSettings.companyId, companyId),
      });

      const values: any = {
        updatedAt: new Date(),
      };
      if (airPreorderMinDepositPct !== undefined) values.airPreorderMinDepositPct = airPreorderMinDepositPct.toString();
      if (seaPreorderMinDepositPct !== undefined) values.seaPreorderMinDepositPct = seaPreorderMinDepositPct.toString();
      if (laybyMinDepositPct !== undefined) values.laybyMinDepositPct = laybyMinDepositPct.toString();
      if (laybyDefaultDurationMonths !== undefined) values.laybyDefaultDurationMonths = parseInt(laybyDefaultDurationMonths);

      let settings;
      if (existing) {
        [settings] = await db.update(salesOrderSettings)
          .set(values)
          .where(eq(salesOrderSettings.companyId, companyId))
          .returning();
      } else {
        [settings] = await db.insert(salesOrderSettings)
          .values({ companyId, ...values })
          .returning();
      }

      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 1b. Direct Creation - Enhanced for all order types
  router.post("/sales-orders", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const {
        branchId, customerId, items, currency, notes, status,
        orderType = 'cash_and_carry',
        preorderType,
        depositPct,
        depositPaid,
        expectedArrival,
        layByDuration,
        departmentId,
        costCenterId,
        locationId,
      } = req.body;

      let subtotal = 0;
      let taxAmount = 0;
      let resolvedDepartmentId = departmentId ? Number(departmentId) : null;
      let resolvedCostCenterId = costCenterId ? Number(costCenterId) : null;

      const newItems = [];
      for (const item of items) {
        const productContext = item.productId
          ? await db.query.products.findFirst({
              where: and(eq(products.id, item.productId), eq(products.companyId, companyId))
            })
          : null;
        if (!resolvedDepartmentId) resolvedDepartmentId = productContext?.departmentId ?? null;
        if (!resolvedCostCenterId) resolvedCostCenterId = productContext?.costCenterId ?? null;

        let unitPrice = item.unitPrice;
        if (unitPrice === undefined || unitPrice === null) {
          let cp = null;
          if (customerId) {
            cp = await db.query.customerProducts.findFirst({
              where: and(
                eq(customerProducts.companyId, companyId),
                eq(customerProducts.customerId, customerId),
                eq(customerProducts.productId, item.productId)
              )
            });
          }
          if (cp && (cp as any).negotiatedPrice) {
            unitPrice = (cp as any).negotiatedPrice;
          } else {
            unitPrice = productContext?.price || "0.00";
          }
        }

        const lineTotal = Number(unitPrice) * Number(item.quantity);
        const taxRate = item.taxRate || 0;
        const taxAmt = lineTotal * (taxRate / 100);

        subtotal += lineTotal;
        taxAmount += taxAmt;

        newItems.push({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          invoicedQuantity: "0.00",
          unitPrice: unitPrice.toString(),
          taxRate: taxRate.toString(),
          lineTotal: lineTotal.toString(),
          taxTypeId: item.taxTypeId,
        });
      }

      const total = subtotal + taxAmount;
      const depositPaidNum = parseFloat(depositPaid || '0');
      const remainingBalance = total - depositPaidNum;

      // Fetch company sales order settings if available
      const companySettings = await db.query.salesOrderSettings.findFirst({
        where: eq(salesOrderSettings.companyId, companyId),
      });

      const airMinPct = companySettings ? parseFloat(companySettings.airPreorderMinDepositPct) : 50;
      const seaMinPct = companySettings ? parseFloat(companySettings.seaPreorderMinDepositPct) : 30;

      // Determine approval status for preorders
      let approvalStatus = 'none';
      let initialStatus = status || 'draft';

      if (orderType === 'preorder') {
        initialStatus = 'awaiting_deposit';
        const depositPctNum = parseFloat(depositPct || '0');
        const depositPercentActual = total > 0 ? (depositPaidNum / total) * 100 : 0;
        const minPct = preorderType === 'air' ? airMinPct : seaMinPct;

        if (depositPercentActual >= minPct) {
          approvalStatus = 'approved';
          initialStatus = 'approved';
        } else {
          approvalStatus = 'pending';
          initialStatus = 'awaiting_deposit';
        }
      } else if (orderType === 'lay_by') {
        initialStatus = 'active';
        approvalStatus = 'none';
      }

      const orderNumber = `SO-${Date.now()}`;
      const gate = await requireApprovalOrContinue({
        userId: (req as any).user!.id,
        companyId,
        isSuperAdmin: !!(req as any).user?.isSuperAdmin,
        type: APPROVAL_TYPES.SALES_ORDER,
        amount: total,
        title: `Approve sales order ${orderNumber}`,
        description: "Sales orders must be authorised before picking and dispatch.",
        payload: {
          orderData: {
            branchId: branchId || null,
            customerId: customerId || null,
            quotationId: null,
            departmentId: resolvedDepartmentId || null,
            costCenterId: resolvedCostCenterId || null,
            locationId: locationId ? Number(locationId) : null,
            orderNumber,
            issueDate: new Date().toISOString(),
            subtotal: subtotal.toString(),
            taxAmount: taxAmount.toString(),
            total: total.toString(),
            status: initialStatus,
            currency: currency || 'USD',
            notes,
            orderType,
            preorderType: preorderType || null,
            depositPct: depositPct ? depositPct.toString() : null,
            depositPaid: depositPaidNum.toString(),
            remainingBalance: remainingBalance.toString(),
            expectedArrival: expectedArrival || null,
            layByDuration: layByDuration || null,
            approvalStatus: approvalStatus === 'approved' ? 'approved' : 'pending',
          },
          items: newItems,
        },
        referenceType: "sales_order",
      });
      if (gate.requiresApproval) {
        return res.status(202).json({ message: "Sales order submitted for approval", approval: gate.request });
      }

      const [newOrder] = await db.insert(salesOrders).values({
        companyId,
        branchId: branchId || undefined,
        customerId: customerId || null,
        quotationId: null,
        departmentId: resolvedDepartmentId || null,
        costCenterId: resolvedCostCenterId || null,
        locationId: locationId ? Number(locationId) : null,
        orderNumber,
        issueDate: new Date(),
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        total: total.toString(),
        status: initialStatus,
        currency: currency || 'USD',
        notes,
        orderType,
        preorderType: preorderType || null,
        depositPct: depositPct ? depositPct.toString() : null,
        depositPaid: depositPaidNum.toString(),
        remainingBalance: remainingBalance.toString(),
        expectedArrival: expectedArrival || null,
        layByDuration: layByDuration || null,
        approvalStatus,
      } as any).returning();

      const orderItemsToInsert = newItems.map(item => ({
        ...item,
        salesOrderId: newOrder.id,
      }));
      if (orderItemsToInsert.length > 0) {
        await db.insert(salesOrderItems).values(orderItemsToInsert);
      }

      // Preorder: create stock reservations
      if (orderType === 'preorder') {
        const reservations = newItems
          .filter(i => i.productId)
          .map(i => ({
            companyId,
            salesOrderId: newOrder.id,
            productId: i.productId!,
            quantityReserved: i.quantity.toString(),
            status: 'reserved',
          }));
        if (reservations.length > 0) {
          await db.insert(stockReservations).values(reservations as any);
        }
      }

      // Lay-by: generate payment schedule
      if (orderType === 'lay_by') {
        const months = layByDuration || 3;
        const scheduleItems = [];
        const now = new Date();

        // 3-month: 40%, 30%, 30%
        // 6-month: 20% each
        const pcts = months === 3 ? [0.4, 0.3, 0.3] : [1/6, 1/6, 1/6, 1/6, 1/6, 1/6];
        let runningTotal = 0;

        for (let i = 0; i < months; i++) {
          const dueDate = new Date(now);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          const isLast = i === months - 1;
          const amt = isLast
            ? total - runningTotal
            : parseFloat((total * pcts[i]).toFixed(2));
          runningTotal += amt;

          scheduleItems.push({
            salesOrderId: newOrder.id,
            instalmentNumber: i + 1,
            dueDate: dueDate.toISOString().split('T')[0],
            amountDue: amt.toString(),
            amountPaid: '0.00',
            status: 'pending',
          });
        }

        if (scheduleItems.length > 0) {
          await db.insert(layBySchedules).values(scheduleItems as any);
        }
      }

      // Record deposit payment in payments table for accounting & customer statements
      if (depositPaidNum > 0) {
        await db.insert(payments).values({
          companyId,
          branchId: branchId || undefined,
          salesOrderId: newOrder.id,
          customerId: customerId || null,
          amount: depositPaidNum.toString(),
          currency: currency || 'USD',
          paymentMethod: req.body.paymentMethod || 'Cash',
          reference: req.body.paymentReference || null,
          notes: `Deposit payment for ${orderType} order ${newOrder.orderNumber}`,
          createdBy: (req as any).user?.id || null,
        } as any);
      }

      const completeOrder = await db.query.salesOrders.findFirst({
        where: and(eq(salesOrders.id, newOrder.id), eq(salesOrders.companyId, companyId)),
        with: { items: true },
      });
      res.json(completeOrder);
    } catch (error: any) {
      res.status(error?.statusCode || 500).json({ error: error.message });
    }
  });

  // 1c. Tiered Editing
  router.patch("/sales-orders/:id", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { id } = req.params;
      const { status, notes, items } = req.body;
      const userId = (req as any).user?.id || null;

      const order = await db.query.salesOrders.findFirst({
        where: and(eq(salesOrders.id, parseInt(id)), eq(salesOrders.companyId, companyId)),
        with: { items: true }
      });
      if (!order) return res.status(404).json({ error: "Order not found" });

      // Determine Zone
      let zone = 1; // Draft
      if (order.status !== "draft") zone = 2; // Confirmed
      
      for (const item of order.items) {
        if (Number(item.invoicedQuantity) > 0) {
          zone = 3; // Invoiced/Allocated
          break;
        }
      }

      // Handle Header Updates
      const {
        orderType, preorderType, depositPct, depositPaid, remainingBalance,
        expectedArrival, layByDuration,
        departmentId, costCenterId, locationId
      } = req.body;

      const headerUpdates: any = {};
      if (status !== undefined && status !== order.status) headerUpdates.status = status;
      if (notes !== undefined && notes !== order.notes) headerUpdates.notes = notes;
      if (orderType !== undefined) headerUpdates.orderType = orderType;
      if (preorderType !== undefined) headerUpdates.preorderType = preorderType;
      if (depositPct !== undefined) headerUpdates.depositPct = depositPct?.toString();
      if (depositPaid !== undefined) headerUpdates.depositPaid = depositPaid?.toString();
      if (remainingBalance !== undefined) headerUpdates.remainingBalance = remainingBalance?.toString();
      if (expectedArrival !== undefined) headerUpdates.expectedArrival = expectedArrival;
      if (layByDuration !== undefined) headerUpdates.layByDuration = layByDuration;
      if (departmentId !== undefined) headerUpdates.departmentId = departmentId || null;
      if (costCenterId !== undefined) headerUpdates.costCenterId = costCenterId || null;
      if (locationId !== undefined) headerUpdates.locationId = locationId || null;

      if (Object.keys(headerUpdates).length > 0) {
        if (zone === 2) {
          for (const [field, newVal] of Object.entries(headerUpdates)) {
            await db.insert(salesOrderAuditLogs).values({
              salesOrderId: order.id,
              fieldChanged: field,
              oldValue: String((order as any)[field]),
              newValue: String(newVal),
              changedBy: userId,
            });
          }
        }
        await db.update(salesOrders)
          .set(headerUpdates)
          .where(and(eq(salesOrders.id, order.id), eq(salesOrders.companyId, companyId)));
      }

      // Handle Items (Simplified for now - we would need to diff them properly)
      // For Zone 3 constraints, we just reject if they try to edit price/product
      
      res.json({ message: "Sales order updated" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/sales-orders", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const typeFilter = req.query.type as string | undefined;
      const approvalFilter = req.query.approvalStatus as string | undefined;

      const conditions = [eq(salesOrders.companyId, companyId)];
      if (typeFilter) conditions.push(eq((salesOrders as any).orderType, typeFilter));
      if (approvalFilter) conditions.push(eq((salesOrders as any).approvalStatus, approvalFilter));

      const orders = await db.query.salesOrders.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { customer: true, items: true },
        orderBy: (salesOrders, { desc }) => [desc(salesOrders.issueDate)],
      });
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/sales-orders/:id", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const order = await db.query.salesOrders.findFirst({
        where: and(eq(salesOrders.id, parseInt(req.params.id)), eq(salesOrders.companyId, companyId)),
        with: { 
          items: true,
          layBySchedules: true,
          stockReservations: { with: { product: true } },
        },
      });
      
      if (!order) return res.status(404).json({ error: "Not found" });
      
      // Manually fetch customer
      let customer = null;
      if (order.customerId) {
        customer = await db.query.customers.findFirst({
          where: and(eq(customers.id, order.customerId), eq(customers.companyId, companyId))
        });
      }
      
      res.json({ ...order, customer });
    } catch (error: any) {
      console.error("Error fetching sales order:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/customer-products/:customerId", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const links = await db.query.customerProducts.findMany({
        where: and(
          eq(customerProducts.companyId, companyId),
          eq(customerProducts.customerId, parseInt(req.params.customerId))
        ),
        with: { product: true }
      });
      res.json(links);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/customer-products", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { customerId, productId, isExclusive, customerSku, artworkVersion, specReference } = req.body;
      const product = await db.query.products.findFirst({
        where: and(eq(products.id, productId), eq(products.companyId, companyId))
      });
      if (!product) return res.status(404).json({ error: "Product not found" });
      const customer = await db.query.customers.findFirst({
        where: and(eq(customers.id, customerId), eq(customers.companyId, companyId))
      });
      if (!customer) return res.status(404).json({ error: "Customer not found" });

      const [link] = await db.insert(customerProducts).values({
        companyId,
        customerId,
        productId,
        isExclusive: isExclusive ?? true,
        customerSku,
        artworkVersion,
        specReference
      }).returning();
      res.json(link);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Release an Allocation
  router.post("/sales-orders/:id/release-allocation", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const orderLineId = parseInt(req.params.id);

      await db.update(stockAllocations)
        .set({ releasedAt: new Date() })
        .where(
          and(
            eq(stockAllocations.salesOrderLineId, orderLineId),
            isNull(stockAllocations.releasedAt),
            inArray(stockAllocations.salesOrderLineId, scopedOrderLineIds(companyId, orderLineId))
          )
        );
        
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  router.post("/sales-orders/:id/approve", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { id } = req.params;
      const { action, notes } = req.body; // action: 'approve' | 'reject'
      const userId = (req as any).user?.id || null;
      const isSuperAdmin = !!(req as any).user?.isSuperAdmin;

      // Approval is a privileged, centrally governed act. Membership alone is
      // not enough: the reviewer must hold the approval permission and be an
      // allowed approver for this approval type.
      if (!userId || !(await userHasPermission(userId, companyId, "sales.order.approve", isSuperAdmin))) {
        return res.status(403).json({ error: "You do not have permission to approve sales orders" });
      }
      await assertCanApproveType(userId, companyId, "sales_order", isSuperAdmin);

      const order = await db.query.salesOrders.findFirst({
        where: and(eq(salesOrders.id, parseInt(id)), eq(salesOrders.companyId, companyId))
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      if ((order as any).approvalStatus !== 'pending') {
        return res.status(400).json({ error: "Order is not pending approval" });
      }

      // Segregation of duties: the requester/creator cannot also review it.
      let creatorId = (order as any).createdBy ?? (order as any).requestedBy ?? null;
      if (!creatorId) {
        const requests = typeof storage.getApprovalRequests === "function"
          ? await storage.getApprovalRequests(companyId, "pending")
          : [];
        const matching = Array.isArray(requests)
          ? requests.find((request: any) => request.referenceType === "sales_order" && String(request.referenceId) === String(order.id))
          : undefined;
        creatorId = matching?.requestedBy ?? null;
      }
      if (creatorId && String(creatorId) === String(userId)) {
        return res.status(403).json({ error: "You cannot approve or reject your own sales order" });
      }

      const newApprovalStatus = action === 'approve' ? 'approved' : 'rejected';
      let newStatus = (order as any).status;
      if (action === 'approve') {
        // Advance preorder from awaiting_deposit to approved
        if (newStatus === 'awaiting_deposit') newStatus = 'approved';
      } else {
        newStatus = 'cancelled';
      }

      await db.update(salesOrders)
        .set({
          approvalStatus: newApprovalStatus,
          approvedBy: userId,
          approvedAt: new Date(),
          approvalNotes: notes || null,
          status: newStatus,
        } as any)
        .where(and(eq(salesOrders.id, order.id), eq(salesOrders.companyId, companyId)));

      res.json({ message: `Order ${action}d successfully` });
    } catch (error: any) {
      const status = error?.statusCode
        || (/permission|own request|own sales order|approve this request/i.test(error?.message || "") ? 403 : 500);
      res.status(status).json({ error: error.message });
    }
  });

  router.post("/sales-orders/:id/record-payment", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { id } = req.params;
      const { amount, scheduleId, paymentMethod = 'Cash', paymentReference } = req.body;

      const order = await db.query.salesOrders.findFirst({
        where: and(eq(salesOrders.id, parseInt(id)), eq(salesOrders.companyId, companyId))
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      if ((order as any).orderType !== 'lay_by') {
        return res.status(400).json({ error: "Only lay-by orders support payment recording" });
      }

      const paidAmount = parseFloat(amount);
      const newDepositPaid = parseFloat((order as any).depositPaid || '0') + paidAmount;
      const total = parseFloat(order.total);
      const newBalance = total - newDepositPaid;

      // Update the schedule instalment if scheduleId provided
      if (scheduleId) {
        const [scheduleItem] = await db
          .select({
            id: layBySchedules.id,
            amountPaid: layBySchedules.amountPaid,
            amountDue: layBySchedules.amountDue,
          })
          .from(layBySchedules)
          .innerJoin(salesOrders, eq(layBySchedules.salesOrderId, salesOrders.id))
          .where(and(eq(layBySchedules.id, parseInt(scheduleId)), eq(salesOrders.companyId, companyId)))
          .limit(1);
        if (scheduleItem) {
          const prevPaid = parseFloat(scheduleItem.amountPaid || '0');
          const newSchedulePaid = prevPaid + paidAmount;
          const due = parseFloat(scheduleItem.amountDue);
          const newScheduleStatus = newSchedulePaid >= due ? 'paid' : 'pending';

          await db.update(layBySchedules)
            .set({
              amountPaid: newSchedulePaid.toString(),
              status: newScheduleStatus,
              paymentMethod,
              paymentReference: paymentReference || null,
              paidAt: new Date(),
            })
            .where(and(
              eq(layBySchedules.id, scheduleItem.id),
              eq(layBySchedules.salesOrderId, order.id),
              inArray(layBySchedules.id, db
                .select({ id: layBySchedules.id })
                .from(layBySchedules)
                .innerJoin(salesOrders, eq(layBySchedules.salesOrderId, salesOrders.id))
                .where(eq(salesOrders.companyId, companyId)))
            ));
        }
      }

      // Record payment in payments table for statement & accounting integration
      await db.insert(payments).values({
        companyId,
        branchId: order.branchId || undefined,
        salesOrderId: order.id,
        customerId: order.customerId || null,
        amount: paidAmount.toString(),
        currency: order.currency || 'USD',
        paymentMethod: paymentMethod || 'Cash',
        reference: paymentReference || null,
        notes: `Lay-by instalment payment for order ${order.orderNumber}`,
        createdBy: (req as any).user?.id || null,
      } as any);

      // Determine new order status
      let newStatus = (order as any).status;
      if (newBalance <= 0) {
        newStatus = 'completed';
      } else if ((order as any).status === 'active') {
        newStatus = 'active';
      }

      await db.update(salesOrders)
        .set({
          depositPaid: newDepositPaid.toString(),
          remainingBalance: Math.max(0, newBalance).toString(),
          status: newStatus,
        } as any)
        .where(and(eq(salesOrders.id, order.id), eq(salesOrders.companyId, companyId)));

      res.json({ message: "Payment recorded", depositPaid: newDepositPaid, remainingBalance: Math.max(0, newBalance) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/sales-orders/:id/receive-goods", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { id } = req.params;
      const order = await db.query.salesOrders.findFirst({
        where: and(eq(salesOrders.id, parseInt(id)), eq(salesOrders.companyId, companyId))
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      if ((order as any).orderType !== 'preorder') {
        return res.status(400).json({ error: "Only preorder orders support goods receipt" });
      }

      // Update reservations to allocated
      await db.update(stockReservations)
        .set({ status: 'allocated' })
        .where(and(
          eq(stockReservations.salesOrderId, order.id),
          eq(stockReservations.companyId, companyId)
        ));

      await db.update(salesOrders)
        .set({ status: 'arrived' } as any)
        .where(and(eq(salesOrders.id, order.id), eq(salesOrders.companyId, companyId)));

      res.json({ message: "Goods received, order status updated to arrived" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/lay-by-schedules", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;

      const schedules = await db
        .select()
        .from(layBySchedules)
        .innerJoin(salesOrders, eq(layBySchedules.salesOrderId, salesOrders.id))
        .where(eq(salesOrders.companyId, companyId))
        .orderBy(layBySchedules.dueDate);

      res.json(schedules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/stock-reservations", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;

      const reservations = await db.query.stockReservations.findMany({
        where: eq(stockReservations.companyId, companyId),
        with: { product: true, salesOrder: true },
      });
      res.json(reservations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/compound-products", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const bundles = await db.query.compoundProducts.findMany({
        where: eq(compoundProducts.companyId, companyId),
        with: { items: { with: { product: true } } },
      });
      res.json(bundles);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/compound-products/:id", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const bundle = await db.query.compoundProducts.findFirst({
        where: and(eq(compoundProducts.id, parseInt(req.params.id)), eq(compoundProducts.companyId, companyId)),
        with: { items: { with: { product: true } } },
      });
      if (!bundle) return res.status(404).json({ error: "Bundle not found" });
      res.json(bundle);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/compound-products", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { name, sku, description, sellingPrice, isActive, items } = req.body;
      const [bundle] = await db.insert(compoundProducts).values({
        companyId, name, sku, description,
        sellingPrice: sellingPrice.toString(),
        isActive: isActive !== false,
      }).returning();

      if (items && items.length > 0) {
        await db.insert(compoundProductItems).values(
          items.map((item: any) => ({
            compoundProductId: bundle.id,
            productId: item.productId,
            quantity: item.quantity.toString(),
          }))
        );
      }

      const fullBundle = await db.query.compoundProducts.findFirst({
        where: and(eq(compoundProducts.id, bundle.id), eq(compoundProducts.companyId, companyId)),
        with: { items: { with: { product: true } } },
      });
      res.json(fullBundle);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/compound-products/:id", requireAuth, async (req, res) => {
    try {
      const companyId = await companyFor(req, res);
      if (!companyId) return;
      const { name, description, sellingPrice, isActive, items } = req.body;
      const bundleId = parseInt(req.params.id);

      const existing = await db.query.compoundProducts.findFirst({
        where: and(eq(compoundProducts.id, bundleId), eq(compoundProducts.companyId, companyId)),
      });
      if (!existing) return res.status(404).json({ error: "Bundle not found" });

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (sellingPrice !== undefined) updates.sellingPrice = sellingPrice.toString();
      if (isActive !== undefined) updates.isActive = isActive;

      if (Object.keys(updates).length > 0) {
        await db.update(compoundProducts)
          .set(updates)
          .where(and(eq(compoundProducts.id, bundleId), eq(compoundProducts.companyId, companyId)));
      }

      // Replace items if provided. The child rows have no company_id, so their
      // parent bundle must belong to the acting company.
      if (items !== undefined) {
        await db.delete(compoundProductItems).where(and(
          eq(compoundProductItems.compoundProductId, bundleId),
          inArray(compoundProductItems.compoundProductId, scopedCompoundIds(companyId))
        ));
        if (items.length > 0) {
          await db.insert(compoundProductItems).values(
            items.map((item: any) => ({
              compoundProductId: bundleId,
              productId: item.productId,
              quantity: item.quantity.toString(),
            }))
          );
        }
      }

      const fullBundle = await db.query.compoundProducts.findFirst({
        where: and(eq(compoundProducts.id, bundleId), eq(compoundProducts.companyId, companyId)),
        with: { items: { with: { product: true } } },
      });
      res.json(fullBundle);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
