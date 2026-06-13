import re

with open('server/lib/inventory.ts', 'r') as f:
    content = f.read()

type_target = """export interface StockInItemInput {
    productId?: number | null;
    accountCode?: string | null;
    description?: string | null;
    quantity: number | string;
    unitCost: number | string;
    landedCost?: number;
    notes?: string;
}"""
type_replacement = """export interface StockInItemInput {
    productId?: number | null;
    accountCode?: string | null;
    description?: string | null;
    quantity: number | string;
    unitCost: number | string;
    taxTypeId?: number | null;
    taxRate?: number | string;
    taxAmount?: number | string;
    isRecoverable?: boolean;
    landedCost?: number;
    notes?: string;
}"""

content = content.replace(type_target, type_replacement)

# We need to calculate the actual capitalizable cost and recoverable VAT
record_batch_target = """    const stockItemsInput = items.filter(i => i.productId);
    const nonStockItemsInput = items.filter(i => !i.productId);

    // Sum non-stock items to act as the auto-landed cost pool
    const autoLandedCostPool = nonStockItemsInput.reduce((sum, item) => {
        const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity;
        const cost = typeof item.unitCost === "string" ? parseFloat(item.unitCost) : item.unitCost;
        return sum + ((qty if str(qty) != "NaN" else 0) * (cost if str(cost) != "NaN" else 0));
    }, 0);"""

record_batch_replacement = """    const stockItemsInput = items.filter(i => i.productId);
    const nonStockItemsInput = items.filter(i => !i.productId);

    let totalRecoverableVat = 0;

    // Sum non-stock items to act as the auto-landed cost pool
    // Non-recoverable VAT gets added to the landed cost pool!
    const autoLandedCostPool = nonStockItemsInput.reduce((sum, item) => {
        const qty = typeof item.quantity === "string" ? parseFloat(item.quantity) : item.quantity;
        const cost = typeof item.unitCost === "string" ? parseFloat(item.unitCost) : item.unitCost;
        const taxAmt = typeof item.taxAmount === "string" ? parseFloat(item.taxAmount) : (item.taxAmount || 0);
        
        let itemTotal = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(cost) ? cost : 0);
        
        if (item.isRecoverable) {
            totalRecoverableVat += (Number.isFinite(taxAmt) ? taxAmt : 0);
        } else {
            itemTotal += (Number.isFinite(taxAmt) ? taxAmt : 0); // Capitalize non-recoverable VAT
        }
        
        return sum + itemTotal;
    }, 0);
    
    // Also add non-recoverable VAT from STOCK items into their respective unit costs!
    for (const stockItem of stockItemsInput) {
        if (!stockItem.isRecoverable) {
            const qty = typeof stockItem.quantity === "string" ? parseFloat(stockItem.quantity) : stockItem.quantity;
            const cost = typeof stockItem.unitCost === "string" ? parseFloat(stockItem.unitCost) : stockItem.unitCost;
            const taxAmt = typeof stockItem.taxAmount === "string" ? parseFloat(stockItem.taxAmount) : (stockItem.taxAmount || 0);
            
            if (qty > 0 && taxAmt > 0) {
                // Add the tax per unit to the base unit cost
                stockItem.unitCost = cost + (taxAmt / qty);
            }
        } else {
            const taxAmt = typeof stockItem.taxAmount === "string" ? parseFloat(stockItem.taxAmount) : (stockItem.taxAmount || 0);
            totalRecoverableVat += (Number.isFinite(taxAmt) ? taxAmt : 0);
        }
    }"""

# python string replace for target above doesn't work well due to JS/TS code mixed with python's format expectations.
# Let me use regex or just be careful. Wait, I wrote `(qty if str(qty) != "NaN" else 0)` in JS earlier?
# YES, I accidentally injected python syntax `if str(qty) != "NaN" else 0` into typescript earlier!
# Let's fix that too!
