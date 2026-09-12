with open("client/src/pages/create-sales-order.tsx", "r") as f:
    text = f.read()

text = text.replace("Sales Order", "SalesOrder")
text = text.replace("salesOrderNumber", "orderNumber")
text = text.replace("SalesOrder Details", "Sales Order Details")
text = text.replace("Create SalesOrder", "Create Sales Order")
text = text.replace("sales-orderss", "sales-orders")
text = text.replace("salesOrders", "salesOrders")

with open("client/src/pages/create-sales-order.tsx", "w") as f:
    f.write(text)
