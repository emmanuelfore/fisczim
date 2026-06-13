import re

with open('shared/schema.ts', 'r') as f:
    content = f.read()

# 1. Update purchaseOrders
po_target = """  notes: text("notes"),
  currency: text("currency").default("USD").notNull(),"""
po_replacement = """  notes: text("notes"),
  currency: text("currency").default("USD").notNull(),
  taxInclusive: boolean("tax_inclusive").default(false),"""
content = content.replace(po_target, po_replacement)

# 2. Update purchaseOrderItems
poi_target = """  quantityReceived: decimal("quantity_received", { precision: 10, scale: 2 }).default("0.00").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),"""
poi_replacement = """  quantityReceived: decimal("quantity_received", { precision: 10, scale: 2 }).default("0.00").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  isRecoverable: boolean("is_recoverable").default(true),
  notes: text("notes"),"""
content = content.replace(poi_target, poi_replacement)

# 3. Update goodsDeliveryNotes
gdn_target = """  notes: text("notes"),
  confirmedGrvNumber: text("confirmed_grv_number"),"""
gdn_replacement = """  notes: text("notes"),
  taxInclusive: boolean("tax_inclusive").default(false),
  confirmedGrvNumber: text("confirmed_grv_number"),"""
content = content.replace(gdn_target, gdn_replacement)

# 4. Update goodsDeliveryNoteItems
gdn_item_target = """  quantityRejected: decimal("quantity_rejected", { precision: 10, scale: 2 }),
  notes: text("notes"),"""
gdn_item_replacement = """  quantityRejected: decimal("quantity_rejected", { precision: 10, scale: 2 }),
  taxTypeId: integer("tax_type_id").references(() => taxTypes.id),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00").notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  isRecoverable: boolean("is_recoverable").default(true),
  notes: text("notes"),"""
content = content.replace(gdn_item_target, gdn_item_replacement)

with open('shared/schema.ts', 'w') as f:
    f.write(content)

