import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import {
  approvalRequests,
  costCenters,
  departments,
  insertPurchaseOrderItemSchema,
  insertPurchaseOrderSchema,
  inventoryLocations,
  products,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequisitions,
  purchaseRequisitionItems,
  supplierQuoteItems,
  supplierQuotes,
  suppliers,
} from "../../shared/schema.js";
import { APPROVAL_TYPES } from "../../shared/permissions.js";
import { userHasPermission } from "../lib/permissions.js";
import { requireDepartmentalDimensions } from "../lib/departmental.js";
import { requireApprovalOrContinue } from "../lib/approval-gate.js";
import { logAction } from "../audit.js";

const requisitionItemSchema = z.object({
  productId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().default(0),
  notes: z.string().trim().max(500).nullable().optional(),
});

const requisitionSchema = z.object({
  departmentId: z.coerce.number().int().positive(),
  costCenterId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive().nullable().optional(),
  neededBy: z.coerce.date().nullable().optional(),
  currency: z.string().trim().min(3).max(10).default("USD"),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(requisitionItemSchema).min(1),
});

const quoteItemSchema = z.object({
  requisitionItemId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  leadTimeDays: z.coerce.number().int().nonnegative().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const quoteSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  quoteNumber: z.string().trim().min(1).max(60),
  currency: z.string().trim().min(3).max(10).default("USD"),
  receivedDate: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(quoteItemSchema).min(1),
});

const httpError = (status: number, message: string): Error & { status: number } =>
  Object.assign(new Error(message), { status });

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function nextNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
}

export function createProcurementRouter(requireAuth: any, requireCompanyAccess: any) {
  const router = Router();
  const base = [requireAuth, requireCompanyAccess];

  async function can(req: any, permissions: string[]) {
    if (!req.user?.id) return false;
    for (const permission of permissions) {
      if (await userHasPermission(
        req.user.id,
        Number(req.params.companyId),
        permission,
        Boolean(req.user?.isSuperAdmin),
      )) return true;
    }
    return false;
  }

  const need = (permissions: string[]) => [
    ...base,
    async (req: any, res: any, next: any) => {
      if (await can(req, permissions)) return next();
      return res.status(403).json({ error: `Permission required: ${permissions.join(" or ")}` });
    },
  ];

  const viewPermissions = [
    "purchasing.requisition.request",
    "purchasing.requisition.approve",
    "purchasing.quote.manage",
    "purchasing.po.request",
    "purchasing.po.approve",
  ];

  async function assertReferences(companyId: number, body: z.infer<typeof requisitionSchema>) {
    const [department] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.id, body.departmentId), eq(departments.companyId, companyId)))
      .limit(1);
    if (!department) throw httpError(422, "Department does not belong to this company");

    const [costCenter] = await db
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(and(eq(costCenters.id, body.costCenterId), eq(costCenters.companyId, companyId)))
      .limit(1);
    if (!costCenter) throw httpError(422, "Cost centre does not belong to this company");

    if (body.locationId) {
      const [location] = await db
        .select({ id: inventoryLocations.id })
        .from(inventoryLocations)
        .where(and(eq(inventoryLocations.id, body.locationId), eq(inventoryLocations.companyId, companyId)))
        .limit(1);
      if (!location) throw httpError(422, "Location does not belong to this company");
    }

    const productIds = [...new Set(body.items.map((item) => item.productId).filter((id): id is number => Boolean(id)))];
    if (productIds.length) {
      const rows = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.companyId, companyId), inArray(products.id, productIds)));
      const found = new Set(rows.map((row) => row.id));
      if (productIds.some((id) => !found.has(id))) throw httpError(422, "A product does not belong to this company");
    }
  }

  async function loadRequisition(companyId: number, id: number) {
    const [requisition] = await db
      .select()
      .from(purchaseRequisitions)
      .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.companyId, companyId)))
      .limit(1);
    if (!requisition) throw httpError(404, "Purchase requisition not found");
    const items = await db
      .select()
      .from(purchaseRequisitionItems)
      .where(eq(purchaseRequisitionItems.requisitionId, id));
    return { ...requisition, items };
  }

  async function loadQuote(companyId: number, id: number) {
    const [quote] = await db
      .select()
      .from(supplierQuotes)
      .where(and(eq(supplierQuotes.id, id), eq(supplierQuotes.companyId, companyId)))
      .limit(1);
    if (!quote) throw httpError(404, "Supplier quote not found");
    const items = await db
      .select()
      .from(supplierQuoteItems)
      .where(eq(supplierQuoteItems.quoteId, id));
    return { ...quote, items };
  }

  async function pendingApproval(companyId: number, type: string, referenceType: string, referenceId: string) {
    const [row] = await db
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.companyId, companyId),
        eq(approvalRequests.type, type),
        eq(approvalRequests.referenceType, referenceType),
        eq(approvalRequests.referenceId, referenceId),
        eq(approvalRequests.status, "pending"),
      ))
      .limit(1);
    return row || null;
  }

  router.get("/companies/:companyId/procurement/requisitions", ...need(viewPermissions), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const rows = await db
        .select()
        .from(purchaseRequisitions)
        .where(eq(purchaseRequisitions.companyId, companyId));
      res.json(rows);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message || "Could not load requisitions" });
    }
  });

  router.get("/companies/:companyId/procurement/requisitions/:id", ...need(viewPermissions), async (req: any, res) => {
    try {
      res.json(await loadRequisition(Number(req.params.companyId), Number(req.params.id)));
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message || "Could not load requisition" });
    }
  });

  router.post("/companies/:companyId/procurement/requisitions", ...need(["purchasing.requisition.request"]), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const body = requisitionSchema.parse(req.body);
      await assertReferences(companyId, body);
      await requireDepartmentalDimensions(companyId, body);
      const estimatedTotal = money(body.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0));
      const created = await db.transaction(async (tx) => {
        const [requisition] = await tx.insert(purchaseRequisitions).values({
          companyId,
          requisitionNumber: nextNumber("REQ"),
          departmentId: body.departmentId,
          costCenterId: body.costCenterId,
          locationId: body.locationId ?? null,
          status: "DRAFT",
          requestedBy: req.user.id,
          neededBy: dateString(body.neededBy),
          currency: body.currency,
          estimatedTotal: String(estimatedTotal),
          notes: body.notes ?? null,
        }).returning();
        await tx.insert(purchaseRequisitionItems).values(body.items.map((item) => ({
          requisitionId: requisition.id,
          productId: item.productId ?? null,
          description: item.description,
          quantity: String(item.quantity),
          unitCost: String(money(item.unitCost)),
          notes: item.notes ?? null,
        })));
        return requisition;
      });
      await logAction(companyId, req.user.id, "PURCHASE_REQUISITION_CREATED", "purchase_requisition", String(created.id), {
        requisitionNumber: created.requisitionNumber,
        departmentId: created.departmentId,
        costCenterId: created.costCenterId,
        estimatedTotal: created.estimatedTotal,
      });
      res.status(201).json(await loadRequisition(companyId, created.id));
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message || "Could not create requisition" });
    }
  });

  router.post("/companies/:companyId/procurement/requisitions/:id/submit", ...need(["purchasing.requisition.request"]), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const id = Number(req.params.id);
      const requisition = await loadRequisition(companyId, id);
      if (requisition.status !== "DRAFT" && requisition.status !== "REJECTED") {
        return res.status(409).json({ message: `Requisition is already ${requisition.status}` });
      }
      const existing = await pendingApproval(companyId, APPROVAL_TYPES.REQUISITION, "purchase_requisition", String(id));
      if (existing) {
        return res.status(202).json({ message: "Requisition already awaits approval", approval: existing });
      }

      const gate = await requireApprovalOrContinue({
        userId: req.user.id,
        companyId,
        isSuperAdmin: Boolean(req.user?.isSuperAdmin),
        type: APPROVAL_TYPES.REQUISITION,
        amount: Number(requisition.estimatedTotal || 0),
        title: `Approve purchase requisition ${requisition.requisitionNumber}`,
        description: "Departmental purchase requisition requires manager authorisation before supplier quotes are requested.",
        payload: {
          amount: Number(requisition.estimatedTotal || 0),
          requisitionId: requisition.id,
          requisitionData: {
            requisitionNumber: requisition.requisitionNumber,
            departmentId: requisition.departmentId,
            costCenterId: requisition.costCenterId,
            locationId: requisition.locationId,
            currency: requisition.currency,
            estimatedTotal: requisition.estimatedTotal,
          },
          items: requisition.items,
        },
        referenceType: "purchase_requisition",
        referenceId: String(id),
      });

      const [updated] = await db.update(purchaseRequisitions)
        .set({
          status: gate.requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
          approvedBy: gate.requiresApproval ? null : req.user.id,
          approvedAt: gate.requiresApproval ? null : new Date(),
          rejectionReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.companyId, companyId)))
        .returning();
      await logAction(companyId, req.user.id, "PURCHASE_REQUISITION_SUBMITTED", "purchase_requisition", String(id), {
        requiresApproval: gate.requiresApproval,
        approvalId: gate.request?.id ?? null,
      });
      res.status(gate.requiresApproval ? 202 : 200).json({ requisition: updated, approval: gate.request });
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message || "Could not submit requisition" });
    }
  });

  router.get("/companies/:companyId/procurement/requisitions/:id/quotes", ...need(viewPermissions), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const requisitionId = Number(req.params.id);
      await loadRequisition(companyId, requisitionId);
      const rows = await db
        .select()
        .from(supplierQuotes)
        .where(and(eq(supplierQuotes.companyId, companyId), eq(supplierQuotes.requisitionId, requisitionId)));
      const items = rows.length
        ? await db.select().from(supplierQuoteItems)
            .where(inArray(supplierQuoteItems.quoteId, rows.map((row) => row.id)))
        : [];
      res.json(rows.map((row) => ({ ...row, items: items.filter((item) => item.quoteId === row.id) })));
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message || "Could not load supplier quotes" });
    }
  });

  router.post("/companies/:companyId/procurement/requisitions/:id/quotes", ...need(["purchasing.quote.manage"]), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const requisitionId = Number(req.params.id);
      const requisition = await loadRequisition(companyId, requisitionId);
      if (requisition.status !== "APPROVED" && requisition.status !== "QUOTE_SELECTED") {
        return res.status(409).json({ message: "Supplier quotes require an approved requisition" });
      }
      const body = quoteSchema.parse(req.body);
      const [supplier] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, body.supplierId), eq(suppliers.companyId, companyId)))
        .limit(1);
      if (!supplier) throw httpError(422, "Supplier does not belong to this company");

      const requisitionItemIds = new Set(requisition.items.map((item) => item.id));
      if (body.items.some((item) => !requisitionItemIds.has(item.requisitionItemId))) {
        throw httpError(422, "A quote line does not reference an item on this requisition");
      }
      const total = money(body.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0));
      const created = await db.transaction(async (tx) => {
        const [quote] = await tx.insert(supplierQuotes).values({
          companyId,
          requisitionId,
          supplierId: body.supplierId,
          quoteNumber: body.quoteNumber,
          currency: body.currency,
          status: "RECEIVED",
          total: String(total),
          receivedDate: dateString(body.receivedDate),
          notes: body.notes ?? null,
          createdBy: req.user.id,
        }).returning();
        await tx.insert(supplierQuoteItems).values(body.items.map((item) => ({
          quoteId: quote.id,
          requisitionItemId: item.requisitionItemId,
          productId: item.productId ?? null,
          description: item.description,
          quantity: String(item.quantity),
          unitCost: String(money(item.unitCost)),
          leadTimeDays: item.leadTimeDays ?? null,
          notes: item.notes ?? null,
        })));
        return quote;
      });
      await logAction(companyId, req.user.id, "SUPPLIER_QUOTE_CAPTURED", "supplier_quote", String(created.id), {
        requisitionId,
        supplierId: body.supplierId,
        quoteNumber: body.quoteNumber,
        total,
      });
      res.status(201).json(await loadQuote(companyId, created.id));
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Supplier quote number already exists" });
      res.status(err.status || 400).json({ message: err.message || "Could not capture supplier quote" });
    }
  });

  router.post("/companies/:companyId/procurement/quotes/:id/select", ...need(["purchasing.quote.select"]), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const quote = await loadQuote(companyId, Number(req.params.id));
      const [requisition] = await db
        .select()
        .from(purchaseRequisitions)
        .where(and(eq(purchaseRequisitions.id, quote.requisitionId), eq(purchaseRequisitions.companyId, companyId)))
        .limit(1);
      if (!requisition) throw httpError(404, "Purchase requisition not found");
      if (!["APPROVED", "QUOTE_SELECTED"].includes(requisition.status)) {
        return res.status(409).json({ message: `Requisition is already ${requisition.status}` });
      }
      await db.transaction(async (tx) => {
        await tx.update(supplierQuotes)
          .set({ status: "REJECTED" })
          .where(and(eq(supplierQuotes.companyId, companyId), eq(supplierQuotes.requisitionId, quote.requisitionId)));
        await tx.update(supplierQuotes)
          .set({ status: "SELECTED", selectedBy: req.user.id, selectedAt: new Date() })
          .where(and(eq(supplierQuotes.companyId, companyId), eq(supplierQuotes.id, quote.id)));
        await tx.update(purchaseRequisitions)
          .set({ status: "QUOTE_SELECTED", selectedQuoteId: quote.id, rejectionReason: null, updatedAt: new Date() })
          .where(and(eq(purchaseRequisitions.id, quote.requisitionId), eq(purchaseRequisitions.companyId, companyId)));
      });
      await logAction(companyId, req.user.id, "SUPPLIER_QUOTE_SELECTED", "supplier_quote", String(quote.id), {
        requisitionId: quote.requisitionId,
        supplierId: quote.supplierId,
        quoteNumber: quote.quoteNumber,
      });
      res.json(await loadQuote(companyId, quote.id));
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message || "Could not select supplier quote" });
    }
  });

  router.post("/companies/:companyId/procurement/requisitions/:id/create-po", ...need(["purchasing.po.request"]), async (req: any, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const requisitionId = Number(req.params.id);
      const requisition = await loadRequisition(companyId, requisitionId);
      if (requisition.status === "PO_PENDING_APPROVAL") {
        return res.status(409).json({ message: "Purchase order approval is already pending" });
      }
      if (requisition.status !== "QUOTE_SELECTED" || !requisition.selectedQuoteId) {
        return res.status(409).json({ message: "A supplier quote must be selected before creating a purchase order" });
      }

      const poApprovalReference = `REQPO-${requisitionId}`;
      const existing = await pendingApproval(companyId, APPROVAL_TYPES.PURCHASE_ORDER, "purchase_requisition", poApprovalReference);
      if (existing) {
        await db.update(purchaseRequisitions)
          .set({ status: "PO_PENDING_APPROVAL", updatedAt: new Date() })
          .where(and(eq(purchaseRequisitions.id, requisitionId), eq(purchaseRequisitions.companyId, companyId)));
        return res.status(202).json({ message: "Purchase order already awaits approval", approval: existing });
      }

      const quote = await loadQuote(companyId, requisition.selectedQuoteId);
      const poNumber = nextNumber("PO");
      const purchaseOrderData = {
        supplierId: quote.supplierId,
        departmentId: requisition.departmentId,
        costCenterId: requisition.costCenterId,
        locationId: requisition.locationId,
        poNumber,
        currency: quote.currency,
        taxInclusive: false,
        notes: `Requisition ${requisition.requisitionNumber}; quote ${quote.quoteNumber}`,
        total: Number(quote.total || 0),
      };
      await requireDepartmentalDimensions(companyId, purchaseOrderData);
      const items = quote.items.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: String(item.quantity),
        unitCost: String(item.unitCost),
        taxRate: "0.00",
        taxAmount: "0.00",
        isRecoverable: true,
      }));

      const gate = await requireApprovalOrContinue({
        userId: req.user.id,
        companyId,
        isSuperAdmin: Boolean(req.user?.isSuperAdmin),
        type: APPROVAL_TYPES.PURCHASE_ORDER,
        amount: Number(quote.total || 0),
        title: `Approve purchase order ${poNumber}`,
        description: "Purchase order created from an approved requisition and selected supplier quote.",
        payload: {
          requisitionId,
          selectedQuoteId: quote.id,
          purchaseOrderData,
          items,
        },
        referenceType: "purchase_requisition",
        referenceId: poApprovalReference,
      });

      if (gate.requiresApproval) {
        await db.update(purchaseRequisitions)
          .set({ status: "PO_PENDING_APPROVAL", updatedAt: new Date() })
          .where(and(eq(purchaseRequisitions.id, requisitionId), eq(purchaseRequisitions.companyId, companyId)));
        await logAction(companyId, req.user.id, "PURCHASE_ORDER_APPROVAL_REQUESTED", "purchase_requisition", String(requisitionId), {
          approvalId: gate.request?.id ?? null,
          quoteId: quote.id,
        });
        return res.status(202).json({ message: "Purchase order submitted for approval", approval: gate.request });
      }

      const created = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(purchaseRequisitions).where(and(
          eq(purchaseRequisitions.id, requisitionId), eq(purchaseRequisitions.companyId, companyId),
        )).for("update");
        if (!current || current.status !== "QUOTE_SELECTED" || current.selectedQuoteId !== quote.id || current.purchaseOrderId) {
          throw httpError(409, "The requisition or its selected quote has already changed");
        }
        const [order] = await tx.insert(purchaseOrders).values(insertPurchaseOrderSchema.parse({
          ...purchaseOrderData,
          companyId,
          createdBy: req.user.id,
          status: "SENT",
        })).returning();
        await tx.insert(purchaseOrderItems).values(items.map((item) => insertPurchaseOrderItemSchema.parse({
          ...item,
          purchaseOrderId: order.id,
        })));
        await tx.update(purchaseRequisitions)
          .set({ status: "CONVERTED", purchaseOrderId: order.id, updatedAt: new Date() })
          .where(and(eq(purchaseRequisitions.id, requisitionId), eq(purchaseRequisitions.companyId, companyId)));
        return order;
      });
      await logAction(companyId, req.user.id, "PURCHASE_ORDER_CREATED_FROM_REQUISITION", "purchase_order", String(created.id), {
        requisitionId,
        quoteId: quote.id,
      });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message || "Could not create purchase order" });
    }
  });

  return router;
}
