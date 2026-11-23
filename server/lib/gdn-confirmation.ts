import { and, eq, ne } from "drizzle-orm";
import { db } from "../db.js";
import {
  goodsDeliveryNotes,
  goodsDeliveryNoteItems,
  purchaseOrderItems,
} from "../../shared/schema.js";
import {
  assertPurchaseOrderAvailable,
  assertReceiptWithinPurchaseOrder,
} from "./supplier-bill-match.js";
import { recordBatchStockIn } from "./inventory.js";

type DraftLine = {
  id: number;
  productId: number | null;
  description: string | null;
  accountCode: string | null;
  remaining: number;
};

export interface ConfirmGdnInput {
  gdnId: number;
  items: any[];
  notes?: string;
  landedCosts?: number | string;
  allocationMethod?: string;
  grvNumber?: string;
  userId: string;
}

function draftKey(
  productId: number | string | null | undefined,
  description: string | null | undefined,
): string {
  if (productId !== null && productId !== undefined && String(productId) !== "") {
    return `product:${productId}`;
  }
  return `description:${String(description ?? "").trim().toLowerCase()}`;
}

/**
 * The single GDN → GRV posting path. Direct confirmations and approval
 * executions both use this, so an approval can never skip validation that the
 * interactive route performs (draft-line matching, received quantities, PO
 * limits and cost tolerance, serials, and added lines).
 */
export async function confirmGdnReceipt(
  companyId: number,
  input: ConfirmGdnInput,
): Promise<{ grvNumber: string; message: string }> {
  const gdnId = Number(input.gdnId);
  if (!Number.isInteger(gdnId) || gdnId <= 0) throw new Error("A valid GDN is required.");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Add costs for at least one GDN line.");
  }

  const grvNumberInput = typeof input.grvNumber === "string" ? input.grvNumber.trim() : "";

  return db.transaction(async (tx) => {
    if (grvNumberInput) {
      const [duplicateGrv] = await tx
        .select({ id: goodsDeliveryNotes.id })
        .from(goodsDeliveryNotes)
        .where(and(
          eq(goodsDeliveryNotes.companyId, companyId),
          eq(goodsDeliveryNotes.confirmedGrvNumber, grvNumberInput),
          ne(goodsDeliveryNotes.id, gdnId),
        ))
        .limit(1);
      if (duplicateGrv) {
        throw new Error(`GRV number ${grvNumberInput} is already used by another receiving document.`);
      }
    }

    const [gdn] = await tx
      .select()
      .from(goodsDeliveryNotes)
      .where(and(eq(goodsDeliveryNotes.id, gdnId), eq(goodsDeliveryNotes.companyId, companyId)))
      .limit(1);
    if (!gdn) throw new Error("GDN not found.");
    if (gdn.status !== "DRAFT") throw new Error("This GDN has already been processed.");

    // Conditional claim inside the posting transaction. Two approvers (or an
    // approver racing a direct confirmation) cannot both post the same GDN.
    const [claimed] = await tx
      .update(goodsDeliveryNotes)
      .set({ status: "PROCESSING" })
      .where(and(
        eq(goodsDeliveryNotes.id, gdnId),
        eq(goodsDeliveryNotes.companyId, companyId),
        eq(goodsDeliveryNotes.status, "DRAFT"),
      ))
      .returning();
    if (!claimed) throw new Error("This GDN has already been processed.");

    const draftRows = await tx
      .select()
      .from(goodsDeliveryNoteItems)
      .where(eq(goodsDeliveryNoteItems.gdnId, gdnId));

    const draftRowsById = new Map<number, DraftLine>();
    const draftRowsByKey = new Map<string, DraftLine[]>();
    const registerDraftRow = (row: any): DraftLine => {
      const draftLine: DraftLine = {
        id: row.id,
        productId: row.productId ?? null,
        description: row.description ?? null,
        accountCode: row.accountCode ?? null,
        remaining: Number(row.quantityReceived || 0),
      };
      draftRowsById.set(draftLine.id, draftLine);
      const key = draftKey(draftLine.productId, draftLine.description);
      const list = draftRowsByKey.get(key) || [];
      list.push(draftLine);
      draftRowsByKey.set(key, list);
      return draftLine;
    };
    for (const row of draftRows) registerDraftRow(row);

    let poLines: any[] = [];
    if (gdn.purchaseOrderId) {
      await assertPurchaseOrderAvailable(tx, companyId, gdn.purchaseOrderId);
      poLines = await tx
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, gdn.purchaseOrderId));
    }

    const stockItems: any[] = [];
    for (const raw of input.items) {
      const rawLineId = Number(raw.lineId ?? raw.id ?? raw.itemId);
      const hasLineId = Number.isInteger(rawLineId) && rawLineId > 0;
      let draftLine = hasLineId ? draftRowsById.get(rawLineId) : undefined;
      if (hasLineId && !draftLine) {
        throw new Error(`Confirmation line #${rawLineId} is not on this receiving document.`);
      }

      let productId = raw.productId ? Number(raw.productId) : null;
      let accountCode = raw.accountCode || null;
      let description = raw.description || raw.productName || null;
      const quantity = Number(raw.quantity ?? raw.quantityAccepted ?? raw.quantityReceived);
      const unitCost = Number(raw.unitCost);
      const landedCost = raw.landedCost === undefined ? 0 : Number(raw.landedCost);
      const taxTypeId = raw.taxTypeId ? Number(raw.taxTypeId) : null;
      const taxRate = Number(raw.taxRate || 0);
      const taxAmount = Number(raw.taxAmount || 0);
      const isRecoverable = raw.isRecoverable !== false;

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Each confirmation line needs a valid quantity.");
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        throw new Error("Each confirmation line needs a valid unit cost.");
      }

      if (!draftLine) {
        draftLine = (draftRowsByKey.get(draftKey(productId, description)) || [])
          .find((row) => row.remaining + 0.01 >= quantity);
      }

      // Once a draft row is identified, its identity is authoritative. This
      // prevents a relabelled description or product from posting against the
      // wrong receiving line.
      if (draftLine) {
        productId = draftLine.productId;
        accountCode = draftLine.accountCode;
        description = draftLine.description;
        if (draftLine.remaining + 0.01 < quantity) {
          throw new Error(`Confirmation quantity for line #${draftLine.id} exceeds the received quantity.`);
        }
      } else {
        // The GRV editor allows adding a line to a draft document before
        // posting. Persist it in the same transaction so the stock posting and
        // the receiving document stay in sync.
        const [inserted] = await tx
          .insert(goodsDeliveryNoteItems)
          .values({
            gdnId,
            productId,
            accountCode,
            description,
            quantityReceived: quantity.toString(),
            unitCost: unitCost.toString(),
            taxTypeId,
            taxRate: taxRate.toString(),
            taxAmount: taxAmount.toString(),
            isRecoverable,
            notes: raw.notes || null,
          })
          .returning();
        draftLine = registerDraftRow(inserted);
      }
      draftLine.remaining -= quantity;

      if (gdn.purchaseOrderId) {
        const key = draftKey(productId, description);
        const matchingPoLines = poLines.filter((row: any) => draftKey(row.productId, row.description) === key);
        if (!matchingPoLines.length) {
          throw new Error(`Received line ${key} is not on the purchase order.`);
        }
        const costWithinTolerance = matchingPoLines.some((poLine: any) => {
          const poCost = Number(poLine.unitCost || 0);
          return Math.abs(unitCost - poCost) <= Math.max(0.01, poCost * 0.05);
        });
        if (!costWithinTolerance) {
          throw new Error(`Receipt unit cost for ${key} varies from the purchase order by more than 5%.`);
        }
      }

      stockItems.push({
        draftLineId: draftLine.id,
        productId,
        accountCode,
        description,
        quantity,
        unitCost,
        landedCost: Number.isFinite(landedCost) ? landedCost : 0,
        taxTypeId,
        taxRate,
        taxAmount,
        isRecoverable,
        serialNumbers: Array.isArray(raw.serialNumbers) ? raw.serialNumbers : [],
      });
    }

    await assertReceiptWithinPurchaseOrder(tx, companyId, gdn.purchaseOrderId, stockItems);

    const stockResult = await recordBatchStockIn(
      companyId,
      stockItems,
      gdn.supplierId || undefined,
      input.notes || gdn.notes || `Confirmed from GDN ${gdn.gdnNumber}`,
      input.landedCosts ? Number(input.landedCosts) : 0,
      (input.allocationMethod as "value" | "quantity" | "manual") || "value",
      grvNumberInput || undefined,
      input.userId,
      gdn.purchaseOrderId || undefined,
      gdn.id,
      undefined,
      tx,
    );

    for (const item of stockItems) {
      await tx
        .update(goodsDeliveryNoteItems)
        .set({
          unitCost: item.unitCost.toString(),
          quantityAccepted: item.quantity.toString(),
          quantityRejected: "0",
          taxTypeId: item.taxTypeId,
          taxRate: item.taxRate.toString(),
          taxAmount: item.taxAmount.toString(),
          isRecoverable: item.isRecoverable,
        })
        .where(and(
          eq(goodsDeliveryNoteItems.id, item.draftLineId),
          eq(goodsDeliveryNoteItems.gdnId, gdnId),
        ));
    }
    await tx
      .update(goodsDeliveryNotes)
      .set({
        status: "CONFIRMED",
        confirmedBy: input.userId || null,
        confirmedGrvNumber: stockResult.grvNumber,
        confirmedAt: new Date(),
      })
      .where(eq(goodsDeliveryNotes.id, gdnId));

    return { grvNumber: stockResult.grvNumber, message: "GDN confirmed and stock posted" };
  });
}
