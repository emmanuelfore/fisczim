with open("client/src/pages/create-sales-order.tsx", "r") as f:
    text = f.read()

text = text.replace('use-salesOrders', 'use-sales-orders')
text = text.replace('existingSalesOrder.items.map((item) =>', 'existingSalesOrder.items.map((item: any) =>')

with open("client/src/pages/create-sales-order.tsx", "w") as f:
    f.write(text)

with open("client/src/pages/sales-orders.tsx", "r") as f:
    text = f.read()

text = text.replace('action={', 'actions={')

with open("client/src/pages/sales-orders.tsx", "w") as f:
    f.write(text)

print("Fixed syntax")
