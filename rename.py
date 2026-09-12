import re

with open("client/src/pages/create-sales-order.tsx", "r") as f:
    text = f.read()

# Replace hooks
text = text.replace('import { useCreateQuotation } from "@/hooks/use-quotations";', 'import { useCreateSalesOrder } from "@/hooks/use-sales-orders";')
text = text.replace('useCreateQuotation', 'useCreateSalesOrder')
text = text.replace('createQuotation', 'createSalesOrder')
text = text.replace('Quotation Details', 'Sales Order Details')
text = text.replace('Create Quotation', 'Create Sales Order')
text = text.replace('quotation', 'salesOrder')
text = text.replace('Quotation', 'Sales Order')
text = text.replace('quotations', 'sales-orders')

with open("client/src/pages/create-sales-order.tsx", "w") as f:
    f.write(text)
