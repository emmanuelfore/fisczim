import re

with open('server/routes.ts', 'r') as f:
    content = f.read()

target = """      const invoice = await storage.createSupplierInvoice({
        ...input,
        companyId,
        items: (req.body.items || []).map((item: any) => ({
          ...item,
          description: item.description || "Supplier bill line",
        })),
        createdBy: (req.user as any)?.id
      });"""

replacement = """      const invoice = await storage.createSupplierInvoice({
        ...input,
        companyId,
        items: (req.body.items || []).map((item: any) => ({
          ...item,
          description: item.description || "Supplier bill line",
          taxTypeId: item.taxTypeId ? Number(item.taxTypeId) : undefined,
          taxRate: item.taxRate ? String(item.taxRate) : "0.00",
          taxAmount: item.taxAmount ? String(item.taxAmount) : "0.00",
          isRecoverable: item.isRecoverable !== undefined ? Boolean(item.isRecoverable) : true,
          accountCode: item.accountCode || undefined,
          productId: item.productId ? Number(item.productId) : undefined,
        })),
        createdBy: (req.user as any)?.id
      });"""

if target in content:
    content = content.replace(target, replacement)
    with open('server/routes.ts', 'w') as f:
        f.write(content)
    print("Patched POST supplier-invoices route successfully")
else:
    print("Target not found")

