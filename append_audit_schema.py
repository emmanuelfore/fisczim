import re

with open("shared/schema.ts", "r") as f:
    content = f.read()

audit_table = """
export const salesOrderAuditLogs = pgTable("sales_order_audit_logs", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id).notNull(),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: integer("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").defaultNow().notNull()
});
export const insertSalesOrderAuditLogSchema = createInsertSchema(salesOrderAuditLogs).omit({ id: true, changedAt: true });
export type SalesOrderAuditLog = typeof salesOrderAuditLogs.$inferSelect;
"""

if "salesOrderAuditLogs =" not in content:
    content += "\n" + audit_table

with open("shared/schema.ts", "w") as f:
    f.write(content)

print("Added salesOrderAuditLogs to schema.ts")
