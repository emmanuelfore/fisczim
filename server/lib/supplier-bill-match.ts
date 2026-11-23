import { and, desc, eq, sql } from "drizzle-orm";

import {
  approvalRequests,
  goodsDeliveryNoteItems,
  goodsDeliveryNotes,
  products,
  purchaseOrderItems,
  purchaseOrders,
  supplierBillMatches,
  supplierInvoices,
} from "@shared/schema";
import {
  evaluateThreeWayMatch,
  type DetailedMatchLine,
  type MatchingStatus,
  type ThreeWayMatchDetail,
} from "./three-way-match.js";

type Executor = any;

export const MATCH_QUANTITY_TOLERANCE = 0.01;
export const MATCH_PRICE_TOLERANCE_ABS = 0.01;
export const MATCH_PRICE_TOLERANCE_RATE = 0.05;

type MatchContext = {
  purchaseOrderId: number | null;
  referenceGdnId: number | null;
  grvReference: string | null;
  supplierId: number;
  currency: string;
  taxInclusive: boolean;
  items: DetailedMatchLine[];
};

export type ResolvedSupplierBillMatch = {
  status: MatchingStatus;
  detail: ThreeWayMatchDetail;
  purchaseOrderId: number | null;
  goodsDeliveryNoteId: number | null;
  grvNumber: string | null;
  currency: string;
  poLines: DetailedMatchLine[];
  grvLines: DetailedMatchLine[];
  invoiceLines: DetailedMatchLine[];
  poTaxInclusive: boolean;
  grvTaxInclusive: boolean;
};

function fail(message: string): never {
  throw new Error(`Three-Way Match Failed: ${message}`);
}

function lineKey(productId: number | string | null | undefined, description: string | null | undefined): string {
  if (productId !== null && productId !== undefined && String(productId) !== "") {
    return `product:${String(productId)}`;
  }
  const text = String(description ?? "").trim().toLowerCase();
  return text ? `description:${text}` : "";
}

function normalizeReference(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Resolve a GRV reference the way the UI shows it: by confirmed GRV number,
 * draft GDN number, or numeric receiving document id. The database columns are
 * unique per company, but users type/copy references with different casing and
 * whitespace, so match on the normalized forms as well.
 */
export async function findReceivingDocumentByReference(
  executor: Executor,
  companyId: number,
  reference: string,
): Promise<any | null> {
  const needle = normalizeReference(reference);
  if (!needle) return null;

  const rows = await executor
    .select({
      id: goodsDeliveryNotes.id,
      gdnNumber: goodsDeliveryNotes.gdnNumber,
      confirmedGrvNumber: goodsDeliveryNotes.confirmedGrvNumber,
      status: goodsDeliveryNotes.status,
      supplierId: goodsDeliveryNotes.supplierId,
      purchaseOrderId: goodsDeliveryNotes.purchaseOrderId,
      currency: goodsDeliveryNotes.currency,
      taxInclusive: goodsDeliveryNotes.taxInclusive,
    })
    .from(goodsDeliveryNotes)
    .where(eq(goodsDeliveryNotes.companyId, companyId));

  const numericId = /^\d+$/.test(needle) ? Number(needle) : null;
  const matches = (rows as any[]).filter((row) => (
    (numericId !== null && Number(row.id) === numericId)
    || normalizeReference(row.confirmedGrvNumber) === needle
    || normalizeReference(row.gdnNumber) === needle
  ));

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // A confirmed GRV number wins over a coincidentally similar draft number.
  const confirmedMatches = matches.filter((row) => normalizeReference(row.confirmedGrvNumber) === needle);
  if (confirmedMatches.length === 1) return confirmedMatches[0];
  fail(`Multiple receiving documents match ${reference}; open the GRV from the receiving list instead of typing a reference.`);
}

export async function getPurchaseOrderApprovalState(
  executor: Executor,
  companyId: number,
  purchaseOrderId: number,
): Promise<"NONE" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"> {
  const [request] = await executor
    .select({ status: approvalRequests.status })
    .from(approvalRequests)
    .where(and(
      eq(approvalRequests.companyId, companyId),
      eq(approvalRequests.referenceType, "purchase_order"),
      eq(approvalRequests.referenceId, String(purchaseOrderId)),
    ))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(1);

  const status = String(request?.status || "").toLowerCase();
  if (status === "approved") return "APPROVED";
  if (status === "pending") return "PENDING";
  if (status === "rejected") return "REJECTED";
  if (status === "cancelled") return "CANCELLED";
  return "NONE";
}

export async function assertPurchaseOrderAvailable(
  executor: Executor,
  companyId: number,
  purchaseOrderId: number,
): Promise<void> {
  const [po] = await executor
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))
    .limit(1);
  if (!po) fail(`Purchase order #${purchaseOrderId} does not belong to this company.`);
  if (po.status === "CANCELLED") fail(`Purchase order ${po.poNumber} is cancelled.`);

  const approval = await getPurchaseOrderApprovalState(executor, companyId, purchaseOrderId);
  if (approval === "PENDING") fail(`Purchase order ${po.poNumber} is still awaiting approval.`);
  if (approval === "REJECTED" || approval === "CANCELLED") {
    fail(`Purchase order ${po.poNumber} is not approved.`);
  }
}

export async function assertNoOpenReceivingDocument(
  executor: Executor,
  companyId: number,
  purchaseOrderId: number,
): Promise<void> {
  const [existing] = await executor
    .select({ id: goodsDeliveryNotes.id, gdnNumber: goodsDeliveryNotes.gdnNumber })
    .from(goodsDeliveryNotes)
    .where(and(
      eq(goodsDeliveryNotes.companyId, companyId),
      eq(goodsDeliveryNotes.purchaseOrderId, purchaseOrderId),
      sql`${goodsDeliveryNotes.status} <> 'CANCELLED'`,
    ))
    .limit(1);
  if (existing) {
    throw new Error(
      `Receiving document ${existing.gdnNumber} is already open for this purchase order. Complete or cancel it first.`,
    );
  }
}

export async function assertPurchaseOrderEditable(
  executor: Executor,
  companyId: number,
  purchaseOrderId: number,
): Promise<void> {
  const linked = await executor
    .select({ id: goodsDeliveryNotes.id, gdnNumber: goodsDeliveryNotes.gdnNumber })
    .from(goodsDeliveryNotes)
    .where(and(
      eq(goodsDeliveryNotes.companyId, companyId),
      eq(goodsDeliveryNotes.purchaseOrderId, purchaseOrderId),
      sql`${goodsDeliveryNotes.status} <> 'CANCELLED'`,
    ))
    .limit(1);
  if (linked[0]) {
    throw new Error(`Cannot change purchase order lines or supplier once receiving document ${linked[0].gdnNumber} exists.`);
  }
}

export async function assertReceiptWithinPurchaseOrder(
  executor: Executor,
  companyId: number,
  purchaseOrderId: number | null | undefined,
  items: Array<{ productId?: number | null; description?: string | null; quantity: number | string }>,
): Promise<void> {
  if (!purchaseOrderId || !items?.length) return;

  const [po] = await executor
    .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))
    .limit(1);
  if (!po) fail(`Purchase order #${purchaseOrderId} does not belong to this company.`);

  const incoming = new Map<string, number>();
  for (const item of items) {
    const key = lineKey(item.productId, item.description);
    if (!key) continue;
    incoming.set(key, (incoming.get(key) || 0) + Math.max(0, Number(item.quantity || 0)));
  }
  if (incoming.size === 0) return;

  const poLines = await executor
    .select({
      productId: purchaseOrderItems.productId,
      description: purchaseOrderItems.description,
      quantity: purchaseOrderItems.quantity,
      quantityReceived: purchaseOrderItems.quantityReceived,
    })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));

  // A PO can legitimately contain more than one line for the same product. Aggregate
  // capacity so a receipt is not rejected because the first matching line is full.
  const capacityByKey = new Map<string, { ordered: number; remaining: number }>();
  for (const line of poLines as any[]) {
    const key = lineKey(line.productId, line.description);
    if (!key) continue;
    const ordered = Number(line.quantity || 0);
    const received = Number(line.quantityReceived || 0);
    const capacity = capacityByKey.get(key) || { ordered: 0, remaining: 0 };
    capacity.ordered += ordered;
    capacity.remaining += Math.max(0, ordered - received);
    capacityByKey.set(key, capacity);
  }

  for (const [key, incomingQty] of incoming.entries()) {
    const capacity = capacityByKey.get(key);
    if (!capacity) fail(`Received line ${key} is not on purchase order ${po.poNumber}.`);
    if (incomingQty - capacity.remaining > MATCH_QUANTITY_TOLERANCE) {
      fail(
        `Receiving ${incomingQty} would exceed the remaining ordered quantity ${capacity.remaining} for ${key} on purchase order ${po.poNumber} (ordered ${capacity.ordered}).`,
      );
    }
  }
}

export async function assertNewSupplierInvoiceNumber(
  executor: Executor,
  companyId: number,
  invoiceNumber: string,
  transactionType: string,
): Promise<void> {
  if (transactionType !== "Invoice") return;
  const normalized = String(invoiceNumber || "").trim().toLowerCase();
  if (!normalized) return;
  const duplicate = await executor
    .select({ id: supplierInvoices.id })
    .from(supplierInvoices)
    .where(and(
      eq(supplierInvoices.companyId, companyId),
      eq(supplierInvoices.transactionType, "Invoice"),
      sql`lower(btrim(${supplierInvoices.invoiceNumber})) = ${normalized}`,
      sql`${supplierInvoices.status} NOT IN ('cancelled', 'void')`,
    ))
    .limit(1);
  if (duplicate[0]) {
    throw new Error(`Supplier invoice number ${invoiceNumber} already exists for this company.`);
  }
}

export async function resolveSupplierBillMatch(
  executor: Executor,
  companyId: number,
  context: MatchContext,
): Promise<ResolvedSupplierBillMatch> {
  const invoiceLines = context.items || [];

  if (!context.purchaseOrderId) {
    let gdn: any = null;
    if (context.referenceGdnId) {
      [gdn] = await executor
        .select()
        .from(goodsDeliveryNotes)
        .where(and(eq(goodsDeliveryNotes.id, context.referenceGdnId), eq(goodsDeliveryNotes.companyId, companyId)))
        .limit(1);
      if (!gdn) fail(`Receiving document #${context.referenceGdnId} does not belong to this company.`);
      if (gdn.status !== "CONFIRMED") fail("The linked receiving document is not confirmed.");
      if (Number(gdn.supplierId) !== Number(context.supplierId)) fail("The receiving document supplier does not match the bill supplier.");
    } else if (context.grvReference) {
      gdn = await findReceivingDocumentByReference(executor, companyId, context.grvReference);
      if (!gdn) fail(`Receiving document ${context.grvReference} was not found for this company.`);
      if (gdn.status !== "CONFIRMED") fail("The linked receiving document is not confirmed.");
      if (Number(gdn.supplierId) !== Number(context.supplierId)) fail("The receiving document supplier does not match the bill supplier.");
    }

    if (!gdn) {
      const detail = evaluateThreeWayMatch(
        { poLines: null, grvLines: null, invoiceLines, invoiceTaxInclusive: context.taxInclusive },
        {
          quantityTolerance: MATCH_QUANTITY_TOLERANCE,
          priceToleranceAbs: MATCH_PRICE_TOLERANCE_ABS,
          priceToleranceRate: MATCH_PRICE_TOLERANCE_RATE,
        },
      );
      return {
        status: "NO_PO",
        detail,
        purchaseOrderId: null,
        goodsDeliveryNoteId: null,
        grvNumber: null,
        currency: context.currency,
        poLines: [],
        grvLines: [],
        invoiceLines,
        poTaxInclusive: false,
        grvTaxInclusive: false,
      };
    }

    const grvLines = await getGrvLines(executor, gdn.id);
    const detail = evaluateThreeWayMatch(
      {
        poLines: null,
        grvLines,
        grvTaxInclusive: !!gdn.taxInclusive,
        invoiceLines,
        invoiceTaxInclusive: context.taxInclusive,
      },
      {
        quantityTolerance: MATCH_QUANTITY_TOLERANCE,
        priceToleranceAbs: MATCH_PRICE_TOLERANCE_ABS,
        priceToleranceRate: MATCH_PRICE_TOLERANCE_RATE,
      },
    );
    return {
      status: detail.status,
      detail,
      purchaseOrderId: gdn.purchaseOrderId || null,
      goodsDeliveryNoteId: gdn.id,
      grvNumber: gdn.confirmedGrvNumber || gdn.gdnNumber,
      currency: context.currency,
      poLines: [],
      grvLines,
      invoiceLines,
      poTaxInclusive: false,
      grvTaxInclusive: !!gdn.taxInclusive,
    };
  }

  await assertPurchaseOrderAvailable(executor, companyId, context.purchaseOrderId);
  const [po] = await executor
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, context.purchaseOrderId), eq(purchaseOrders.companyId, companyId)))
    .limit(1);
  if (Number(po.supplierId) !== Number(context.supplierId)) fail("The bill supplier does not match the purchase order supplier.");
  if (String(po.currency || "USD").toUpperCase() !== String(context.currency || "USD").toUpperCase()) {
    fail("The bill currency does not match the purchase order currency.");
  }

  let gdn: any = null;
  if (context.referenceGdnId) {
    [gdn] = await executor
      .select()
      .from(goodsDeliveryNotes)
      .where(and(eq(goodsDeliveryNotes.id, context.referenceGdnId), eq(goodsDeliveryNotes.companyId, companyId)))
      .limit(1);
    if (!gdn) fail(`Receiving document #${context.referenceGdnId} does not belong to this company.`);
  } else if (context.grvReference) {
    gdn = await findReceivingDocumentByReference(executor, companyId, context.grvReference);
    if (!gdn) fail(`Receiving document ${context.grvReference} was not found for this company.`);
  } else {
    const candidates = await executor
      .select()
      .from(goodsDeliveryNotes)
      .where(and(
        eq(goodsDeliveryNotes.companyId, companyId),
        eq(goodsDeliveryNotes.purchaseOrderId, po.id),
        eq(goodsDeliveryNotes.status, "CONFIRMED"),
      ));
    if (candidates.length === 0) fail(`No confirmed receiving document found for purchase order ${po.poNumber}.`);
    if (candidates.length > 1) {
      fail(`Purchase order ${po.poNumber} has multiple receiving documents; select the GRV explicitly.`);
    }
    gdn = candidates[0];
  }

  if (gdn.status !== "CONFIRMED") fail("The linked receiving document is not confirmed.");
  if (Number(gdn.purchaseOrderId) !== Number(po.id)) fail("The receiving document does not belong to this purchase order.");
  if (Number(gdn.supplierId) !== Number(po.supplierId)) fail("The receiving document supplier does not match the purchase order supplier.");
  if (String(gdn.currency || po.currency || "USD").toUpperCase() !== String(context.currency || "USD").toUpperCase()) {
    fail("The bill currency does not match the receiving document currency.");
  }
  if (context.grvReference) {
    const reference = normalizeReference(context.grvReference);
    const matchesConfirmed = normalizeReference(gdn.confirmedGrvNumber) === reference;
    const matchesGdnNumber = normalizeReference(gdn.gdnNumber) === reference;
    if (!matchesConfirmed && !matchesGdnNumber) {
      fail("The GRV reference does not match the selected receiving document.");
    }
  }

  const poLines = await getPoLines(executor, po.id);
  const grvLines = await getGrvLines(executor, gdn.id);
  const detail = evaluateThreeWayMatch(
    {
      poLines,
      poTaxInclusive: !!po.taxInclusive,
      grvLines,
      grvTaxInclusive: !!gdn.taxInclusive,
      invoiceLines,
      invoiceTaxInclusive: context.taxInclusive,
    },
    {
      quantityTolerance: MATCH_QUANTITY_TOLERANCE,
      priceToleranceAbs: MATCH_PRICE_TOLERANCE_ABS,
      priceToleranceRate: MATCH_PRICE_TOLERANCE_RATE,
    },
  );

  return {
    status: detail.status,
    detail,
    purchaseOrderId: po.id,
    goodsDeliveryNoteId: gdn.id,
    grvNumber: gdn.confirmedGrvNumber || gdn.gdnNumber,
    currency: context.currency,
    poLines,
    grvLines,
    invoiceLines,
    poTaxInclusive: !!po.taxInclusive,
    grvTaxInclusive: !!gdn.taxInclusive,
  };
}

async function getPoLines(executor: Executor, purchaseOrderId: number): Promise<DetailedMatchLine[]> {
  const rows = await executor
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
  return rows.map((row: any) => ({
    productId: row.productId,
    description: row.description,
    quantity: row.quantity,
    unitCost: row.unitCost,
    taxAmount: row.taxAmount,
  }));
}

async function getGrvLines(executor: Executor, gdnId: number): Promise<DetailedMatchLine[]> {
  const rows = await executor
    .select({
      productId: goodsDeliveryNoteItems.productId,
      description: goodsDeliveryNoteItems.description,
      productName: products.name,
      quantityReceived: goodsDeliveryNoteItems.quantityReceived,
      quantityAccepted: goodsDeliveryNoteItems.quantityAccepted,
      unitCost: goodsDeliveryNoteItems.unitCost,
      taxAmount: goodsDeliveryNoteItems.taxAmount,
    })
    .from(goodsDeliveryNoteItems)
    .leftJoin(products, eq(products.id, goodsDeliveryNoteItems.productId))
    .where(eq(goodsDeliveryNoteItems.gdnId, gdnId));
  return rows.map((row: any) => ({
    productId: row.productId,
    description: row.description || row.productName,
    quantity: row.quantityAccepted ?? row.quantityReceived,
    unitCost: row.unitCost,
    taxAmount: row.taxAmount,
  }));
}

export type MatchApproval = {
  reason: string;
  approvedBy: string | null;
};

export async function persistSupplierBillMatch(
  executor: Executor,
  companyId: number,
  supplierInvoiceId: number,
  resolved: ResolvedSupplierBillMatch,
  userId?: string | null,
  approval?: MatchApproval | null,
): Promise<void> {
  const now = new Date();
  const waived = !!approval && resolved.status !== "MATCHED" && resolved.status !== "NO_PO";
  const values = {
    companyId,
    supplierInvoiceId,
    purchaseOrderId: resolved.purchaseOrderId,
    goodsDeliveryNoteId: resolved.goodsDeliveryNoteId,
    status: waived ? "WAIVED" : resolved.status,
    approvalStatus: waived ? "APPROVED" : "NOT_REQUIRED",
    currency: resolved.currency,
    poQuantity: String(resolved.poLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)),
    grvQuantity: String(resolved.grvLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)),
    invoiceQuantity: String(resolved.invoiceLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)),
    quantityVariance: String(resolved.detail.quantityVariance),
    poNetTotal: String(resolved.detail.poNetTotal),
    grvNetTotal: String(resolved.detail.grvNetTotal),
    invoiceNetTotal: String(resolved.detail.invoiceNetTotal),
    priceVariance: String(resolved.detail.priceVariance),
    quantityTolerance: String(MATCH_QUANTITY_TOLERANCE),
    priceToleranceRate: String(MATCH_PRICE_TOLERANCE_RATE),
    snapshot: {
      status: resolved.status,
      originalStatus: resolved.status,
      grvNumber: resolved.grvNumber,
      poTaxInclusive: resolved.poTaxInclusive,
      grvTaxInclusive: resolved.grvTaxInclusive,
      lines: resolved.detail.lines,
      ...(waived ? { waiverReason: approval!.reason } : {}),
    },
    matchedBy: userId || null,
    matchedAt: now,
    approvedBy: waived ? approval!.approvedBy : null,
    approvedAt: waived ? now : null,
    waiverReason: waived ? approval!.reason : null,
    updatedAt: now,
  };

  const updateValues: Record<string, unknown> = { ...values };
  delete updateValues.companyId;
  delete updateValues.supplierInvoiceId;
  await executor
    .insert(supplierBillMatches)
    .values(values)
    .onConflictDoUpdate({
      target: [supplierBillMatches.companyId, supplierBillMatches.supplierInvoiceId],
      set: updateValues,
    });
}

export async function getPersistedSupplierBillMatch(
  executor: Executor,
  companyId: number,
  supplierInvoiceId: number,
): Promise<any | null> {
  const [row] = await executor
    .select()
    .from(supplierBillMatches)
    .where(and(
      eq(supplierBillMatches.companyId, companyId),
      eq(supplierBillMatches.supplierInvoiceId, supplierInvoiceId),
    ))
    .limit(1);
  return row || null;
}
