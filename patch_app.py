import re

with open("client/src/App.tsx", "r") as f:
    content = f.read()

content = content.replace(
    'import SalesOrdersPage from "@/pages/sales-orders";',
    'import SalesOrdersPage from "@/pages/sales-orders";\nimport CreateSalesOrderPage from "@/pages/create-sales-order";'
)

content = content.replace(
    '<Route path="/sales-orders/:id">',
    '<Route path="/sales-orders/new">\n        <ProtectedRoute component={CreateSalesOrderPage} />\n      </Route>\n      <Route path="/sales-orders/:id">'
)

with open("client/src/App.tsx", "w") as f:
    f.write(content)

print("Patched App.tsx")
