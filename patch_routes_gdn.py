import re

with open('server/routes.ts', 'r') as f:
    content = f.read()

gdn_insert_target = """      const { gdnNumber, supplierId, purchaseOrderId, notes, items } = req.body || {};
      const cleanGdnNumber = String(gdnNumber || "").trim();"""
gdn_insert_replacement = """      const { gdnNumber, supplierId, purchaseOrderId, notes, taxInclusive, items } = req.body || {};
      const cleanGdnNumber = String(gdnNumber || "").trim();"""

content = content.replace(gdn_insert_target, gdn_insert_replacement)

gdn_db_target = """          gdnNumber: cleanGdnNumber,
          status: "DRAFT",
          notes: notes || null,
          createdBy: (req.user as any)?.id || null,
        }).returning();"""
gdn_db_replacement = """          gdnNumber: cleanGdnNumber,
          status: "DRAFT",
          taxInclusive: !!taxInclusive,
          notes: notes || null,
          createdBy: (req.user as any)?.id || null,
        }).returning();"""
content = content.replace(gdn_db_target, gdn_db_replacement)

gdn_item_target = """          await tx.insert(goodsDeliveryNoteItems).values({
            gdnId: gdn.id,
            productId,
            accountCode: raw.accountCode || null,
            description: raw.description || raw.productName || null,
            unitCost: (raw.unitCost !== undefined && raw.unitCost !== null) ? raw.unitCost.toString() : "0",
            quantityReceived: quantity.toString(),
            notes: raw.notes || null,
          });"""
gdn_item_replacement = """          await tx.insert(goodsDeliveryNoteItems).values({
            gdnId: gdn.id,
            productId,
            accountCode: raw.accountCode || null,
            description: raw.description || raw.productName || null,
            unitCost: (raw.unitCost !== undefined && raw.unitCost !== null) ? raw.unitCost.toString() : "0",
            quantityReceived: quantity.toString(),
            taxTypeId: raw.taxTypeId ? Number(raw.taxTypeId) : null,
            taxRate: (raw.taxRate !== undefined && raw.taxRate !== null) ? raw.taxRate.toString() : "0",
            taxAmount: (raw.taxAmount !== undefined && raw.taxAmount !== null) ? raw.taxAmount.toString() : "0",
            isRecoverable: raw.isRecoverable !== undefined ? !!raw.isRecoverable : true,
            notes: raw.notes || null,
          });"""
content = content.replace(gdn_item_target, gdn_item_replacement)

with open('server/routes.ts', 'w') as f:
    f.write(content)

