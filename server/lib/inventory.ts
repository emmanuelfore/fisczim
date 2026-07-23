import { db } from "../db";
import { inventoryTransactions, products, companies, stockTakes, stockTakeItems, branchStocks, inventoryCostComponents, purchaseOrderItems, goodsDeliveryNotes, accounts, productSerialNumbers, productVariations, productBatches } from "@shared/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { createCostLayer, consumeInventory, recalculateBranchAVCO, type CostComponentType } from "./costing";
import { adjustLocationStock, resolveReceivingLocation } from "./location-stock";

export function generateGrvReference() {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `GRV-${stamp}-${suffix}`;
}

type LandedCostAllocationMethod = "quantity" | "value" | "manual";

type StockInItemInput = {
    productId?: number | null;
    variationId?: number | null;
    accountCode?: string | null;
    description?: string | null;
    quantity: number | string;
    unitCost: number | string;
    landedCost?: number | string;
    taxTypeId?: number | null;
    taxRate?: number | string;
    taxAmount?: number | string;
    isRecoverable?: boolean;
    serialNumbers?: string[];
    batchNumber?: string;
    manufacturingDate?: string;
    expiryDate?: string;
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
            serialNumbers: item.serialNumbers || [],
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

    return await db.transaction(async (tx) => {
        const receivingLocation = await resolveReceivingLocation(tx, companyId, branchId);

        const [transaction] = await tx.insert(inventoryTransactions).values({
            companyId,
            productId,
            branchId: branchId,
            locationId: receivingLocation.id,
            supplierId: supplierId || null,
            type: "STOCK_IN",
            quantity: quantity.toString(),
            unitCost: unitCost.toString(),
            totalCost: (quantity * unitCost).toString(),
            referenceType: "GRN",
            referenceId: grvReference,
            remainingQuantity: quantity.toString(),
            notes: notes,
        }).returning();

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

        await createCostLayer(transaction.id, components, tx);

        const { avgCost } = await recalculateBranchAVCO(productId, branchId, companyId, tx);
        await adjustLocationStock(tx, productId, quantity, receivingLocation);
        await tx
            .update(products)
            .set({ costPrice: avgCost.toFixed(2) })
            .where(eq(products.id, productId));

        return { grvNumber: grvReference, transactionId: transaction.id };
    });
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
    gdnId?: number,
    customerId?: number
) {
    const grvReference = grvNumber?.trim() || generateGrvReference();
    
    // Apply variation UoM conversions before processing
    for (const item of items) {
        if ((item as any).variationId) {
            const [variation] = await db.select().from(productVariations).where(eq(productVariations.id, (item as any).variationId));
            if (variation && variation.baseUnitMultiplier) {
                const multiplier = parseFloat(variation.baseUnitMultiplier.toString());
                const oldQty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity;
                const oldCost = typeof item.unitCost === "string" ? parseFloat(item.unitCost) : item.unitCost;
                
                item.quantity = oldQty * multiplier;
                item.unitCost = oldCost / multiplier;
                // Note: taxAmount is total for the line, so it doesn't need to be changed
            }
        }
    }

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
        const receivingLocation = await resolveReceivingLocation(tx, companyId, null);

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
                locationId: receivingLocation.id,
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

            if (item.serialNumbers && item.serialNumbers.length > 0) {
                const serialVals = item.serialNumbers.map(sn => ({
                    companyId,
                    productId: item.productId,
                    serialNumber: sn,
                    receivedInventoryTransactionId: transaction.id,
                    status: "IN_STOCK",
                }));
                await tx.insert(productSerialNumbers).values(serialVals);
            }

            if ((item as any).batchNumber && (item as any).expiryDate) {
                // Check if batch exists
                const [existingBatch] = await tx
                    .select()
                    .from(productBatches)
                    .where(and(
                        eq(productBatches.productId, item.productId),
                        eq(productBatches.batchNumber, (item as any).batchNumber)
                    ))
                    .limit(1);

                if (existingBatch) {
                    await tx.update(productBatches)
                        .set({ stockLevel: sql`stock_level + ${quantity}` })
                        .where(eq(productBatches.id, existingBatch.id));
                } else {
                    await tx.insert(productBatches).values({
                        productId: item.productId,
                        variationId: (item as any).variationId || null,
                        batchNumber: (item as any).batchNumber,
                        manufacturingDate: (item as any).manufacturingDate ? new Date((item as any).manufacturingDate).toISOString() : null,
                        expiryDate: new Date((item as any).expiryDate).toISOString(),
                        stockLevel: quantity.toString(),
                    });
                }
            }

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

            // 3. Update location stock (and derived product stock) plus moving average cost
            if (customerId) {
                const stockCheck = await tx.execute(sql`SELECT id FROM customer_stock WHERE customer_id = ${customerId} AND product_id = ${item.productId}`);
                if (stockCheck.rows && stockCheck.rows.length > 0) {
                    await tx.execute(sql`UPDATE customer_stock SET quantity = quantity + ${quantity}, last_movement_date = CURRENT_TIMESTAMP WHERE customer_id = ${customerId} AND product_id = ${item.productId}`);
                } else {
                    await tx.execute(sql`INSERT INTO customer_stock (company_id, location_id, product_id, customer_id, quantity) VALUES (${companyId}, ${receivingLocation.id}, ${item.productId}, ${customerId}, ${quantity})`);
                }
            } else {
                const { avgCost } = await recalculateBranchAVCO(item.productId, null, companyId, tx);
                await adjustLocationStock(tx, item.productId, quantity, receivingLocation);
                await tx
                    .update(products)
                    .set({ costPrice: avgCost.toFixed(2) })
                    .where(eq(products.id, item.productId));
            }

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

        if (inventoryAccCode && grniAccCode && grandTotal > 0 && !customerId) {
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
        let qty = data.quantity;
        
        if (data.variationId) {
            const [variation] = await tx.select().from(productVariations).where(eq(productVariations.id, data.variationId));
            if (variation && variation.baseUnitMultiplier) {
                qty = qty * parseFloat(variation.baseUnitMultiplier.toString());
            }
        }

        const absQty = Math.abs(qty);

        const location = await resolveReceivingLocation(tx, companyId, data.branchId);

        // 1. Record the transaction
        await tx.insert(inventoryTransactions).values({
            companyId,
            branchId: data.branchId || null,
            locationId: location.id,
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
        await adjustLocationStock(tx, data.productId, qty, location);

        // 3. If negative adjustment, reduce from existing batches (FIFO/AVCO)
        if (qty < 0) {
            await calculateCOGS(data.productId, absQty, companyId, data.branchId || null, tx);
        }
    });
}

export async function processStockTake(stockTakeId: number, companyId: number, userId?: string) {
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

            const location = await resolveReceivingLocation(tx, companyId, stockTake.branchId);

            // 2. Record adjustment transaction
            await tx.insert(inventoryTransactions).values({
                companyId,
                branchId: stockTake.branchId || null,
                locationId: location.id,
                productId: item.productId,
                type: "ADJUSTMENT",
                quantity: variance.toString(),
                unitCost: unitCost.toString(),
                totalCost: (variance * unitCost).toString(),
                referenceType: "STOCK_TAKE",
                referenceId: stockTakeId.toString(),
                notes: `Stock Take #${stockTakeId} Adjustment`,
                remainingQuantity: variance > 0 ? variance.toString() : "0", // Gains add to remaining stock
                createdBy: userId || null,
            });

            // 3. Update stock level using adjustLocationStock
            await adjustLocationStock(tx, item.productId, variance, location);
            
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

        const sourceLocation = await resolveReceivingLocation(activeDb, companyId, fromBranchId);
        const destLocation = await resolveReceivingLocation(activeDb, companyId, toBranchId);

        // 2. Record TRANSFER_OUT
        const [outTx] = await activeDb.insert(inventoryTransactions).values({
            companyId,
            branchId: fromBranchId,
            locationId: sourceLocation.id,
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
            locationId: destLocation.id,
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

        // 5. Update location stocks
        await adjustLocationStock(activeDb, productId, -absQty, sourceLocation);
        await adjustLocationStock(activeDb, productId, absQty, destLocation);

        // 6. Recalculate AVCO for destination
        await recalculateBranchAVCO(productId, toBranchId, companyId, activeDb);
    }

    return { referenceId };
}
