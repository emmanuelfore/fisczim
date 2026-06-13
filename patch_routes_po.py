import re

with open('server/routes.ts', 'r') as f:
    content = f.read()

po_payload_target = """        currency: z.string().default("USD"),
        items: z.array(z.object({
          productId: z.coerce.number().int().positive().optional().nullable(),
          description: z.string().optional().nullable(),
          accountCode: z.string().optional().nullable(),
          quantity: z.coerce.number().positive(),
          unitCost: z.coerce.number().nonnegative(),
          notes: z.string().optional().nullable(),
        })).min(1),"""
po_payload_replacement = """        currency: z.string().default("USD"),
        taxInclusive: z.boolean().default(false),
        items: z.array(z.object({
          productId: z.coerce.number().int().positive().optional().nullable(),
          description: z.string().optional().nullable(),
          accountCode: z.string().optional().nullable(),
          quantity: z.coerce.number().positive(),
          unitCost: z.coerce.number().nonnegative(),
          taxTypeId: z.coerce.number().int().positive().optional().nullable(),
          taxRate: z.coerce.number().nonnegative().optional().default(0),
          taxAmount: z.coerce.number().nonnegative().optional().default(0),
          isRecoverable: z.boolean().default(true),
          notes: z.string().optional().nullable(),
        })).min(1),"""

content = content.replace(po_payload_target, po_payload_replacement)

po_insert_target = """          currency: payload.currency,
          createdBy: (req.user as any)?.id,
        })).returning();

        await tx.insert(purchaseOrderItems).values(payload.items.map((item) =>
          insertPurchaseOrderItemSchema.parse({
            purchaseOrderId: created.id,
            productId: item.productId || null,
            description: item.description || null,
            accountCode: item.accountCode || null,
            quantity: item.quantity.toFixed(2),
            unitCost: item.unitCost.toFixed(2),
            notes: item.notes || null,
          })
        ));"""
po_insert_replacement = """          currency: payload.currency,
          taxInclusive: payload.taxInclusive,
          createdBy: (req.user as any)?.id,
        })).returning();

        await tx.insert(purchaseOrderItems).values(payload.items.map((item) =>
          insertPurchaseOrderItemSchema.parse({
            purchaseOrderId: created.id,
            productId: item.productId || null,
            description: item.description || null,
            accountCode: item.accountCode || null,
            quantity: item.quantity.toFixed(2),
            unitCost: item.unitCost.toFixed(2),
            taxTypeId: item.taxTypeId || null,
            taxRate: item.taxRate.toFixed(2),
            taxAmount: item.taxAmount.toFixed(2),
            isRecoverable: item.isRecoverable,
            notes: item.notes || null,
          })
        ));"""

content = content.replace(po_insert_target, po_insert_replacement)

with open('server/routes.ts', 'w') as f:
    f.write(content)

