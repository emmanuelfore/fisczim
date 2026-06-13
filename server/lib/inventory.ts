import { db } from "../db";
import { inventoryTransactions, products, companies, stockTakes, stockTakeItems, branchStocks, inventoryCostComponents, purchaseOrderItems, goodsDeliveryNotes, accounts } from "@shared/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { createCostLayer, consumeInventory, recalculateBranchAVCO, type CostComponentType } from "./costing";

export function generateGrvReference() {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `GRV-${stamp}-${suffix}`;
}

type LandedCostAllocationMethod = "quantity" | "value" | "manual";

type StockInItemInput = {
    productId?: number | null;
    accountCode?: string | null;
    description?: string | null;
    quantity: number | string;
    unitCost: number | string;
    landedCost?: number | string;
    taxTypeId?: number | null;
    taxRate?: number | string;
    taxAmount?: number | string;
    isRecoverable?: boolean;
};

function allocateLandedCosts(
    items: StockInItemInput[],
    landedCosts: number,
    allocationMethod: LandedCostAllocationMethod = "value"
) {
    const parsed = items.map((item) => {
        const quantity = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity;
        const baseUnitCost = typeof item.unitCost === "string" ? parseFloat(item.unitCost) : item.unitCost;
        const manualLandedCost = item.landedCost === undefined
            ? 0
            : typeof item.landedCost === "string"
                ? parseFloat(item.landedCost)
                : item.landedCost;
        return {
            productId: item.productId!,
            quantity: Number.isFinite(quantity) ? quantity : 0,
            baseUnitCost: Number.isFinite(baseUnitCost) ? baseUnitCost : 0,
            manualLandedCost: Number.isFinite(manualLandedCost) ? manualLandedCost : 0,
        };
    });

    if (allocationMethod === "manual") {
        return parsed.map((item) => ({ ...item, landedCost: item.manualLandedCost }));
    }

    const base = allocationMethod === "quantity"
        ? parsed.reduce((sum, item) => sum + item.quantity, 0)
        : parsed.reduce((sum, item) => sum + (item.quantity * item.baseUnitCost), 0);

    return parsed.map((item, index) => {
        const itemBase = allocationMethod === "quantity" ? item.quantity : item.quantity * item.baseUnitCost;
        const allocated = base > 0 ? landedCosts * (itemBase / base) : 0;
        const landedCost = index === parsed.length - 1
            ? landedCosts - parsed.slice(0, -1).reduce((sum, prev) => {
                const prevBase = allocationMethod === "quantity" ? prev.quantity : prev.quantity * prev.baseUnitCost;
                return sum + (base > 0 ? landedCosts * (prevBase / base) : 0);
            }, 0)
            : allocated;
        return { ...item, landedCost };
    });
}

export async function calculateCOGS(
    productId: number,
    quantitySold: number,
    companyId: number,
    branchId: number | null = null,
    tx?: any
) {
    const activeDb = tx || db;
    // 1. Get company valuation method
    const [company] = await activeDb
        .select({ method: companies.inventoryValuationMethod })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

    const method = (company?.method || "WAC") as 'FIFO' | 'LIFO' | 'AVCO' | 'WAC';
    
    // Convert WAC to AVCO for the engine (internal nomenclature)
    const engineMethod = method === "WAC" ? "AVCO" : method;

    const { totalCogs } = await consumeInventory(productId, branchId, quantitySold, companyId, engineMethod, tx);
    return totalCogs;
}



export async function recordStockIn(
    productId: number,
    quantity: number,
    unitCost: number,
    companyId: number,
    branchId: number | null = null,
    supplierId?: number,
    notes?: string,
    landedCost: number = 0,
    grvNumber?: string
) {
    const grvReference = grvNumber?.trim() || generateGrvReference();

    // 1. Record the transaction
    const [transaction] = await db.insert(inventoryTransactions).values({
        companyId,
        productId,
        branchId: branchId,
        supplierId: supplierId || null,
        type: "STOCK_IN",
        quantity: quantity.toString(),
        unitCost: unitCost.toString(), // Store base unit cost
        totalCost: (quantity * unitCost).toString(),
        referenceType: "GRN",
        referenceId: grvReference,
        remainingQuantity: quantity.toString(),
        notes: notes,
    }).returning();

    // 2. Create Cost Layers
    const components: Array<{ type: CostComponentType; unitCost: number; totalCost: number }> = [
        { type: 'BASE', unitCost, totalCost: quantity * unitCost }
    ];
    
    if (landedCost > 0) {
        components.push({ 
            type: 'FREIGHT' as const, 
            unitCost: landedCost / quantity, 
            totalCost: landedCost 
        });
    }

    await createCostLayer(transaction.id, components);

    // 3. Update product stock level and standard cost price
    const { avgCost } = await recalculateBranchAVCO(productId, branchId, companyId);

    if (branchId) {
        const [existing] = await db.select().from(branchStocks).where(and(eq(branchStocks.branchId, branchId), eq(branchStocks.productId, productId)));
        if (existing) {
            await db.update(branchStocks).set({ stockLevel: sql`stock_level + ${quantity}` }).where(eq(branchStocks.id, existing.id));
        } else {
            await db.insert(branchStocks).values({ branchId, productId, stockLevel: quantity.toString() });
        }
    } else {
        await db.update(products)
            .set({
                stockLevel: sql`stock_level + ${quantity}`,
                costPrice: avgCost.toFixed(2), // Keep global costPrice as moving average
            })
            .where(eq(products.id, productId));
    }

    return { grvNumber: grvReference, transactionId: transaction.id };
}

export async function recordBatchStockIn(
    companyId: number,
    items: StockInItemInput[],
    supplierId?: number,
    notes?: string,
    landedCosts: number = 0,
    allocationMethod: LandedCostAllocationMethod = "value",
    grvNumber?: string,
    createdBy?: string,
    purchaseOrderId?: number,
    gdnId?: number
) {
    const grvReference = grvNumber?.trim() || generateGrvReference();
    
    const stockItemsInput = items.filter(i => i.productId);
    const nonStockItemsInput = items.filter(i => !i.productId);

    let totalRecoverableVat = 0;

    // If the GRV is tax inclusive, the item.unitCost (which maps to baseUnitCost) may already include VAT.
    const [gdnRecord] = gdnId 
        ? await db.select({ taxInclusive: goodsDeliveryNotes.taxInclusive }).from(goodsDeliveryNotes).where(eq(goodsDeliveryNotes.id, gdnId)).limit(1)
        : [null];
    const isGdnTaxInclusive = gdnRecord ? !!gdnRecord.taxInclusive : false;

    // Sum non-stock items to act as the auto-landed cost pool
    // Non-recoverable VAT gets added to the landed cost pool!
    const autoLandedCostPool = nonStockItemsInput.reduce((sum, item) => {
        const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity;
        const cost = typeof item.unitCost === "string" ? parseFloat(item.unitCost) : item.unitCost;
        const taxAmt = typeof item.taxAmount === "string" ? parseFloat(item.taxAmount) : (item.taxAmount || 0);
        
        let itemTotal = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(cost) ? cost : 0);
        
        // If tax inclusive, the cost already includes tax.
        if (isGdnTaxInclusive) {
            if (item.isRecoverable !== false) {
                itemTotal -= (Number.isFinite(taxAmt) ? taxAmt : 0); // Subtract recoverable tax from inventory cost
                totalRecoverableVat += (Number.isFinite(taxAmt) ? taxAmt : 0);
            } else {
                // If not recoverable, keep the full tax-inclusive amount as part of the cost pool
            }
        } else {
            // Tax exclusive
            if (item.isRecoverable !== false) {
                totalRecoverableVat += (Number.isFinite(taxAmt) ? taxAmt : 0);
            } else {
                itemTotal += (Number.isFinite(taxAmt) ? taxAmt : 0); // Capitalize non-recoverable VAT
            }
        }
        
        return sum + itemTotal;
    }, 0);
    
    // Process stock items
    for (const stockItem of stockItemsInput) {
        const qty = typeof stockItem.quantity === "string" ? parseFloat(stockItem.quantity) : stockItem.quantity;
        const cost = typeof stockItem.unitCost === "string" ? parseFloat(stockItem.unitCost) : stockItem.unitCost;
        const taxAmt = typeof stockItem.taxAmount === "string" ? parseFloat(stockItem.taxAmount) : (stockItem.taxAmount || 0);
        const isRecoverable = stockItem.isRecoverable !== false;

        if (isGdnTaxInclusive) {
            if (isRecoverable) {
                // Deduct recoverable tax from the unit cost
                if (qty > 0) {
                    stockItem.unitCost = cost - (taxAmt / qty);
                }
                totalRecoverableVat += (Number.isFinite(taxAmt) ? taxAmt : 0);
            } else {
                // Keep the cost as-is because it already includes the non-recoverable tax
            }
        } else {
            // Tax exclusive
            if (isRecoverable) {
                totalRecoverableVat += (Number.isFinite(taxAmt) ? taxAmt : 0);
            } else {
                // Capitalize tax by adding it to the unitCost
                if (qty > 0) {
                    stockItem.unitCost = cost + (taxAmt / qty);
                }
            }
        }
    }

    const totalLandedCosts = landedCosts + autoLandedCostPool;
    const allocatedItems = allocateLandedCosts(stockItemsInput, totalLandedCosts, allocationMethod);

    // Wrap in a transaction to ensure all or nothing
    await db.transaction(async (tx) => {
        for (const item of allocatedItems) {
            const quantity = item.quantity;
            const baseUnitCost = item.baseUnitCost;
            const effectiveUnitCost = baseUnitCost + (quantity > 0 ? item.landedCost / quantity : 0);

            // Fetch current stock and cost for weighted average
            const [product] = await tx
                .select({
                    stockLevel: products.stockLevel,
                    costPrice: products.costPrice,
                })
                .from(products)
                .where(eq(products.id, item.productId))
                .limit(1);

            const currentQty = parseFloat(product?.stockLevel?.toString() || "0") || 0;
            const currentCost = parseFloat(product?.costPrice?.toString() || "0") || 0;

            const totalNewQty = currentQty + quantity;
            let newCostPrice = baseUnitCost;

            if (totalNewQty > 0 && currentQty > 0) {
                newCostPrice = ((currentQty * currentCost) + (quantity * baseUnitCost)) / totalNewQty;
            }

            // 1. Record the transaction
            const [transaction] = await tx.insert(inventoryTransactions).values({
                companyId,
                productId: item.productId,
                supplierId: supplierId || null,
                type: "STOCK_IN",
                quantity: quantity.toString(),
                unitCost: baseUnitCost.toString(),
                totalCost: (quantity * baseUnitCost).toString(),
                referenceType: "GRN",
                referenceId: grvReference,
                remainingQuantity: quantity.toString(),
                notes: `${notes || "Batch GRV"}\nBase cost: ${(quantity * baseUnitCost).toFixed(2)}; landed cost: ${item.landedCost.toFixed(2)}; allocation: ${allocationMethod}`,
                createdBy: createdBy || null,
            }).returning();

            // 2. Create Cost Layers
            const components: Array<{ type: CostComponentType; unitCost: number; totalCost: number }> = [
                { type: 'BASE', unitCost: baseUnitCost, totalCost: quantity * baseUnitCost }
            ];
            
            if (item.landedCost > 0) {
                components.push({ 
                    type: 'FREIGHT' as const, 
                    unitCost: item.landedCost / quantity, 
                    totalCost: item.landedCost 
                });
            }

            await createCostLayer(transaction.id, components, tx);

            // 3. Update product stock level and moving average cost
            // We use null for branchId in batchStockIn for now as it doesn't specify branch per item yet
            const { avgCost } = await recalculateBranchAVCO(item.productId, null, companyId, tx);

            await tx
                .update(products)
                .set({
                    stockLevel: sql`stock_level + ${quantity}`,
                    costPrice: avgCost.toFixed(2),
                })
                .where(eq(products.id, item.productId));

            // 4. If linked to a PO, update quantity received for 3-way match tracking
            if (purchaseOrderId) {
                await tx
                    .update(purchaseOrderItems)
                    .set({ quantityReceived: sql`quantity_received + ${quantity}` })
                    .where(and(
                        eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId),
                        eq(purchaseOrderItems.productId, item.productId)
                    ));
            }
        }

        // Update PO quantities for non-stock items
        if (purchaseOrderId && nonStockItemsInput.length > 0) {
            for (const item of nonStockItemsInput) {
                const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity;
                await tx
                    .update(purchaseOrderItems)
                    .set({ quantityReceived: sql`quantity_received + ${qty}` })
                    .where(and(
                        eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId),
                        sql`${purchaseOrderItems.productId} IS NULL`,
                        eq(purchaseOrderItems.description, item.description || "")
                    ));
            }
        }

        // 5. Post GL: Dr Inventory (1300), Dr Input VAT (e.g. 1500), Cr GRNI (2010)
        // Lazy import to avoid circular dependency
        const { storage } = await import("../storage");
        const inventoryAccCode = await storage.getSystemAccountCode(companyId, "inventoryAccountCode");
        const grniAccCode = await storage.getSystemAccountCode(companyId, "grniAccountCode");
        const inputVatAccCode = await storage.getSystemAccountCode(companyId, "vatInputAccountCode"); // Key is vatInputAccountCode
        
        // Note: allocatedItems baseUnitCost values have already been adjusted in pre-processing
        // (i.e. if taxInclusive and recoverable, baseUnitCost = cost - taxAmt/qty).
        // Therefore, we can sum them directly to get totalInventoryCost.
        const totalInventoryCost = allocatedItems.reduce((sum, item) => sum + (item.quantity * item.baseUnitCost) + item.landedCost, 0);
        const grandTotal = totalInventoryCost + totalRecoverableVat;

        if (inventoryAccCode && grniAccCode && grandTotal > 0) {
            const lines: { accountCode: string, type: "DEBIT" | "CREDIT", amount: number }[] = [];
            
            if (totalInventoryCost > 0) {
                lines.push({ accountCode: inventoryAccCode, type: "DEBIT", amount: Number(totalInventoryCost.toFixed(2)) });
            }
            if (totalRecoverableVat > 0 && inputVatAccCode) {
                lines.push({ accountCode: inputVatAccCode, type: "DEBIT", amount: Number(totalRecoverableVat.toFixed(2)) });
            }
            if (grandTotal > 0) {
                lines.push({ accountCode: grniAccCode, type: "CREDIT", amount: Number((totalInventoryCost + totalRecoverableVat).toFixed(2)) });
            }

            await storage.postToLedger(companyId, {
                entryDate: new Date(),
                description: `GRV ${grvReference}${gdnId ? ` (GDN #${gdnId})` : ""}`,
                referenceType: "GRV",
                referenceId: grvReference,
                createdBy: createdBy,
                lines,
            });
        }
    });

    return {
        grvNumber: grvReference,
        lineCount: allocatedItems.length,
        totalQuantity: allocatedItems.reduce((sum, item) => sum + item.quantity, 0),
        totalCost: allocatedItems.reduce((sum, item) => sum + (item.quantity * (item.baseUnitCost + (item.quantity > 0 ? item.landedCost / item.quantity : 0))), 0),
    };
}

export async function recordAdjustment(
    companyId: number,
    data: { productId: number, variationId?: number, branchId?: number, quantity: number, type: string, notes?: string, userId: string }
) {
    await db.transaction(async (tx) => {
        const qty = data.quantity;
        const absQty = Math.abs(qty);

        // 1. Record the transaction
        await tx.insert(inventoryTransactions).values({
            companyId,
            branchId: data.branchId || null,
            productId: data.productId,
            variationId: data.variationId || null,
            type: data.type,
            quantity: qty.toString(),
            notes: data.notes || `Stock ${data.type.toLowerCase()}`,
            referenceType: "MANUAL",
            referenceId: `ADJ-${Date.now()}`,
            createdBy: data.userId,
            remainingQuantity: qty > 0 ? qty.toString() : "0"
        });

        // 2. Update stock level
        if (data.branchId) {
            const [existing] = await tx
              .select()
              .from(branchStocks)
              .where(and(eq(branchStocks.branchId, data.branchId), eq(branchStocks.productId, data.productId)));

            if (existing) {
              const newLevel = (Number(existing.stockLevel) + qty).toString();
              await tx.update(branchStocks).set({ stockLevel: newLevel }).where(eq(branchStocks.id, existing.id));
            } else {
              await tx.insert(branchStocks).values({
                branchId: data.branchId,
                productId: data.productId,
                stockLevel: qty.toString()
              });
            }
        } else {
            await tx.update(products)
                .set({ stockLevel: sql`stock_level + ${qty}` })
                .where(eq(products.id, data.productId));
        }

        // 3. If negative adjustment, reduce from existing batches (FIFO/AVCO)
        if (qty < 0) {
            await calculateCOGS(data.productId, absQty, companyId, data.branchId || null, tx);
        }
    });
}

export async function processStockTake(stockTakeId: number, companyId: number) {
    await db.transaction(async (tx) => {
        // 1. Get stock take and items
        const [stockTake] = await tx.select().from(stockTakes).where(eq(stockTakes.id, stockTakeId));
        if (!stockTake) throw new Error("Stock take not found");
        if (stockTake.status !== "draft") throw new Error("Stock take is not in draft status");

        const items = await tx.select().from(stockTakeItems).where(eq(stockTakeItems.stockTakeId, stockTakeId));

        for (const item of items) {
            const physical = parseFloat(item.physicalCount?.toString() || "0");
            const system = parseFloat(item.systemCount?.toString() || "0");
            const variance = physical - system;

            if (variance === 0) continue;

            const unitCost = parseFloat(item.unitCost?.toString() || "0");

            // 2. Record adjustment transaction
            await tx.insert(inventoryTransactions).values({
                companyId,
                productId: item.productId,
                type: "ADJUSTMENT",
                quantity: variance.toString(),
                unitCost: unitCost.toString(),
                totalCost: (variance * unitCost).toString(),
                referenceType: "STOCK_TAKE",
                referenceId: stockTakeId.toString(),
                notes: `Stock Take #${stockTakeId} Adjustment`,
                remainingQuantity: variance > 0 ? variance.toString() : "0", // Gains add to remaining stock
            });

            // 3. Update product stock level directly to physical count
            await tx.update(products)
                .set({ stockLevel: physical.toString() })
                .where(eq(products.id, item.productId));
            
            if (variance < 0) {
                await calculateCOGS(item.productId, Math.abs(variance), companyId, null, tx);
            }
        }

        // 4. Mark as completed
        await tx.update(stockTakes)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(stockTakes.id, stockTakeId));
    });
}

export async function recordTransfer(
    companyId: number,
    fromBranchId: number,
    toBranchId: number,
    items: { productId: number, quantity: number, unitCost?: number }[],
    notes?: string,
    userId?: string,
    tx?: any
) {
    const activeDb = tx || db;
    const referenceId = `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    for (const item of items) {
        const { productId, quantity } = item;
        const absQty = Math.abs(quantity);

        // 1. Consume from source branch (calculate cost)
        const { totalCogs, consumedLayers } = await consumeInventory(productId, fromBranchId, absQty, companyId, 'FIFO', activeDb);
        const unitCost = totalCogs / absQty;

        const baseNotes = `${notes || "Branch stock transfer"}; from branch ${fromBranchId} to branch ${toBranchId}`;

        // 2. Record TRANSFER_OUT
        const [outTx] = await activeDb.insert(inventoryTransactions).values({
            companyId,
            branchId: fromBranchId,
            productId,
            type: "TRANSFER_OUT",
            quantity: (-absQty).toString(),
            unitCost: unitCost.toString(),
            totalCost: totalCogs.toString(),
            referenceType: "TRANSFER",
            referenceId,
            notes: baseNotes,
            createdBy: userId || null,
            remainingQuantity: "0",
        }).returning();

        // 3. Record TRANSFER_IN
        const [inTx] = await activeDb.insert(inventoryTransactions).values({
            companyId,
            branchId: toBranchId,
            productId,
            type: "TRANSFER_IN",
            quantity: absQty.toString(),
            unitCost: unitCost.toString(),
            totalCost: totalCogs.toString(),
            referenceType: "TRANSFER",
            referenceId,
            notes: baseNotes,
            createdBy: userId || null,
            remainingQuantity: absQty.toString(),
        }).returning();

        // 4. Create identical layers in destination branch
        const components: Array<{ type: CostComponentType; unitCost: number; totalCost: number }> = [
            { type: 'BASE', unitCost: unitCost, totalCost: totalCogs }
        ];
        await createCostLayer(inTx.id, components, activeDb);

        // 5. Update branch stocks
        const [source] = await activeDb.select().from(branchStocks).where(and(eq(branchStocks.branchId, fromBranchId), eq(branchStocks.productId, productId))).limit(1);
        if (source) {
            await activeDb.update(branchStocks).set({ stockLevel: (Number(source.stockLevel) - absQty).toString() }).where(eq(branchStocks.id, source.id));
        }

        const [dest] = await activeDb.select().from(branchStocks).where(and(eq(branchStocks.branchId, toBranchId), eq(branchStocks.productId, productId))).limit(1);
        if (dest) {
            await activeDb.update(branchStocks).set({ stockLevel: (Number(dest.stockLevel) + absQty).toString() }).where(eq(branchStocks.id, dest.id));
        } else {
            await activeDb.insert(branchStocks).values({ branchId: toBranchId, productId, stockLevel: absQty.toString() });
        }

        // 6. Recalculate AVCO for destination
        await recalculateBranchAVCO(productId, toBranchId, companyId, activeDb);
    }

    return { referenceId };
}
