import { db } from "../db";
import { 
    inventoryTransactions, 
    inventoryCostComponents, 
    products, 
    companies,
    landedCostAllocations,
    landedCostDocuments
} from "@shared/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";

export type CostComponentType = 'BASE' | 'FREIGHT' | 'DUTY' | 'INSURANCE' | 'ADJUSTMENT';
export type ConsumedLayer = {
    transactionId: number;
    quantity: number;
    unitCost: number;
    totalCost: number;
};

/**
 * Recalculates the Weighted Average Cost (AVCO) for a product in a specific branch.
 * Independent valuation per warehouse as per spec 4.1.
 */
export async function recalculateBranchAVCO(
    productId: number, 
    branchId: number | null, 
    companyId: number,
    tx?: any
) {
    const activeDb = tx || db;
    
    // Inventory Value = Σ (All Cost Layers Remaining in Stock)
    const result = await activeDb
        .select({
            totalQuantity: sql<number>`SUM(remaining_quantity)`,
            totalCost: sql<number>`SUM(remaining_quantity * unit_cost)`,
        })
        .from(inventoryTransactions)
        .where(
            and(
                eq(inventoryTransactions.productId, productId),
                eq(inventoryTransactions.companyId, companyId),
                branchId ? eq(inventoryTransactions.branchId, branchId) : sql`branch_id IS NULL`,
                sql`remaining_quantity > 0`,
                sql`type IN ('STOCK_IN', 'ADJUSTMENT')`
            )
        );

    const { totalQuantity, totalCost } = result[0];
    const avgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    // We might want to store this somewhere, or just return it.
    // The spec says costPrice on product is updated.
    // If we have independent valuation per branch, we might need branch_stocks.cost_price.
    
    return { avgCost, totalQuantity, totalCost };
}

/**
 * Creates a new cost layer for an inventory transaction.
 */
export async function createCostLayer(
    transactionId: number,
    components: Array<{
        type: CostComponentType;
        unitCost: number;
        totalCost: number;
        currency?: string;
        exchangeRate?: number;
    }>,
    tx?: any
) {
    const activeDb = tx || db;
    
    const values = components.map(c => ({
        inventoryTransactionId: transactionId,
        type: c.type,
        unitCost: c.unitCost.toString(),
        totalCost: c.totalCost.toString(),
        currency: c.currency || 'USD',
        exchangeRate: (c.exchangeRate || 1).toString(),
    }));

    await activeDb.insert(inventoryCostComponents).values(values);
}

/**
 * Consumes inventory units from available layers based on the company's valuation method.
 */
export async function consumeInventory(
    productId: number,
    branchId: number | null,
    quantityToConsume: number,
    companyId: number,
    method: 'FIFO' | 'LIFO' | 'AVCO',
    tx?: any
) {
    const activeDb = tx || db;
    const order = method === 'LIFO' ? desc : asc;

    // For AVCO, we still consume units from layers, but the COST used for COGS 
    // is the current average cost at the time of sale.
    let unitCostForCogs: number | null = null;
    if (method === 'AVCO') {
        const { avgCost } = await recalculateBranchAVCO(productId, branchId, companyId, activeDb);
        unitCostForCogs = avgCost;
    }

    const layers = await activeDb
        .select()
        .from(inventoryTransactions)
        .where(
            and(
                eq(inventoryTransactions.productId, productId),
                eq(inventoryTransactions.companyId, companyId),
                branchId ? eq(inventoryTransactions.branchId, branchId) : sql`branch_id IS NULL`,
                sql`remaining_quantity > 0`,
                sql`type IN ('STOCK_IN', 'ADJUSTMENT')`
            )
        )
        .orderBy(order(inventoryTransactions.createdAt));

    let remainingToConsume = quantityToConsume;
    let totalCogs = 0;
    const consumedLayers: ConsumedLayer[] = [];

    for (const layer of layers) {
        if (remainingToConsume <= 0) break;

        const available = Number(layer.remainingQuantity);
        const take = Math.min(available, remainingToConsume);
        
        // If AVCO, use the calculated avgCost. If FIFO/LIFO, use the layer's specific unit cost.
        const costPerUnit = unitCostForCogs !== null ? unitCostForCogs : Number(layer.unitCost);
        
        totalCogs += take * costPerUnit;
        remainingToConsume -= take;
        consumedLayers.push({
            transactionId: layer.id,
            quantity: take,
            unitCost: costPerUnit,
            totalCost: take * costPerUnit,
        });

        await activeDb
            .update(inventoryTransactions)
            .set({ remainingQuantity: (available - take).toFixed(2) })
            .where(eq(inventoryTransactions.id, layer.id));
    }

    return {
        totalCogs,
        consumedLayers,
        fullyConsumed: remainingToConsume === 0,
        unmetQuantity: remainingToConsume
    };
}
