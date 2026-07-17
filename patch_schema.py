with open("shared/schema.ts", "r") as f:
    text = f.read()

allocation_table = """
export const stockAllocations = pgTable("stock_allocations", {
  id: serial("id").primaryKey(),
  stockId: integer("stock_id").references(() => customerStock.id).notNull(),
  salesOrderLineId: integer("sales_order_line_id").references(() => salesOrderItems.id).notNull(),
  quantityAllocated: decimal("quantity_allocated", { precision: 10, scale: 2 }).notNull(),
  allocatedAt: timestamp("allocated_at").defaultNow().notNull(),
  releasedAt: timestamp("released_at"),
});

export const stockAllocationsRelations = relations(stockAllocations, ({ one }) => ({
  stock: one(customerStock, { fields: [stockAllocations.stockId], references: [customerStock.id] }),
  salesOrderLine: one(salesOrderItems, { fields: [stockAllocations.salesOrderLineId], references: [salesOrderItems.id] }),
}));

export const insertStockAllocationSchema = createInsertSchema(stockAllocations).omit({ id: true, allocatedAt: true });
"""

text = text.replace('export const customerStock = pgTable("customer_stock", {', allocation_table + '\nexport const customerStock = pgTable("customer_stock", {')

with open("shared/schema.ts", "w") as f:
    f.write(text)
