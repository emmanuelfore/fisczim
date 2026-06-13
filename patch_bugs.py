import re

# 1. Fix create-grv.tsx
with open('client/src/pages/create-grv.tsx', 'r') as f:
    create_grv = f.read()

create_grv = create_grv.replace(
    'import { useAuth } from "@/hooks/use-auth";',
    'import { useActiveCompany } from "@/hooks/use-active-company";'
)
create_grv = create_grv.replace(
    'const { user } = useAuth();\n  const companyId = user?.activeCompanyId;',
    'const { activeCompanyId } = useActiveCompany();\n  const companyId = activeCompanyId || 0;'
)

# Extract Document Details Card
doc_details_match = re.search(r'(<div className="space-y-6">\s*<Card className="rounded-\[18px\] border-slate-200 shadow-sm">.*?<\/Card>\s*<\/div>)', create_grv, re.DOTALL)
if doc_details_match:
    doc_details_html = doc_details_match.group(1)
    
    # Remove it from its current position
    create_grv = create_grv.replace(doc_details_html, '')
    
    # Remove the grid layout wrappers that we don't need
    create_grv = create_grv.replace('<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">\n        <div className="lg:col-span-2 space-y-6">', '<div className="space-y-6">')
    
    # Also clean up the closing tags for the grid
    create_grv = create_grv.replace('</Card>\n        </div>\n\n        \n      </div>', '</Card>\n        </div>')

    # Insert Document details before the items table
    # Wait, the structure is:
    # <div className="space-y-6">
    #   <Card> (Received Items)
    
    # Let's just insert it right after <div className="space-y-6">
    # Also, we should change doc_details_html to be a grid layout itself so it takes less vertical space.
    doc_details_html_modified = doc_details_html.replace('className="p-5 space-y-4"', 'className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4"')
    doc_details_html_modified = doc_details_html_modified.replace('rows={4}', 'rows={1}')
    
    create_grv = create_grv.replace('<div className="space-y-6">\n          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">', f'<div className="space-y-6">\n          {doc_details_html_modified}\n          <Card className="rounded-[18px] border-slate-200 shadow-sm overflow-hidden">')

with open('client/src/pages/create-grv.tsx', 'w') as f:
    f.write(create_grv)

# 2. Fix grv-details.tsx
with open('client/src/pages/grv-details.tsx', 'r') as f:
    grv_details = f.read()

grv_details = grv_details.replace(
    '<Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>',
    '{grv.status !== "DRAFT" && (\n              <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>'
)
grv_details = grv_details.replace(
    '</Dialog>\n            </CardContent>',
    '</Dialog>\n              )}\n            </CardContent>'
)

with open('client/src/pages/grv-details.tsx', 'w') as f:
    f.write(grv_details)

# 3. Fix routes.ts
with open('server/routes.ts', 'r') as f:
    routes = f.read()

mapping_orig = """        const landedCost = raw.landedCost === undefined ? 0 : Number(raw.landedCost);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Each confirmation line needs a valid quantity.");
        if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Each confirmation line needs a valid unit cost.");
        return { productId, accountCode, description, quantity, unitCost, landedCost: Number.isFinite(landedCost) ? landedCost : 0 };"""

mapping_new = """        const landedCost = raw.landedCost === undefined ? 0 : Number(raw.landedCost);
        const taxTypeId = raw.taxTypeId ? Number(raw.taxTypeId) : null;
        const taxRate = Number(raw.taxRate || 0);
        const taxAmount = Number(raw.taxAmount || 0);
        const isRecoverable = raw.isRecoverable !== false;
        
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Each confirmation line needs a valid quantity.");
        if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Each confirmation line needs a valid unit cost.");
        return { productId, accountCode, description, quantity, unitCost, landedCost: Number.isFinite(landedCost) ? landedCost : 0, taxTypeId, taxRate, taxAmount, isRecoverable };"""

routes = routes.replace(mapping_orig, mapping_new)

update_orig = """            await tx
              .update(goodsDeliveryNoteItems)
              .set({
                quantityAccepted: item.quantity.toString(),
                quantityRejected: "0",
              })
              .where(and(eq(goodsDeliveryNoteItems.gdnId, gdnId), eq(goodsDeliveryNoteItems.productId, item.productId)));"""

update_new = """            await tx
              .update(goodsDeliveryNoteItems)
              .set({
                quantityAccepted: item.quantity.toString(),
                quantityRejected: "0",
                taxTypeId: item.taxTypeId,
                taxRate: item.taxRate.toString(),
                taxAmount: item.taxAmount.toString(),
                isRecoverable: item.isRecoverable
              })
              .where(and(eq(goodsDeliveryNoteItems.gdnId, gdnId), eq(goodsDeliveryNoteItems.productId, item.productId)));"""

routes = routes.replace(update_orig, update_new)

update_nonstock_orig = """            await tx
              .update(goodsDeliveryNoteItems)
              .set({
                quantityAccepted: item.quantity.toString(),
                quantityRejected: "0",
              })
              .where(and(eq(goodsDeliveryNoteItems.gdnId, gdnId), sql`${goodsDeliveryNoteItems.productId} IS NULL`, eq(goodsDeliveryNoteItems.description, item.description || "")));"""

update_nonstock_new = """            await tx
              .update(goodsDeliveryNoteItems)
              .set({
                quantityAccepted: item.quantity.toString(),
                quantityRejected: "0",
                taxTypeId: item.taxTypeId,
                taxRate: item.taxRate.toString(),
                taxAmount: item.taxAmount.toString(),
                isRecoverable: item.isRecoverable
              })
              .where(and(eq(goodsDeliveryNoteItems.gdnId, gdnId), sql`${goodsDeliveryNoteItems.productId} IS NULL`, eq(goodsDeliveryNoteItems.description, item.description || "")));"""

routes = routes.replace(update_nonstock_orig, update_nonstock_new)

with open('server/routes.ts', 'w') as f:
    f.write(routes)

print("All fixes applied successfully")
