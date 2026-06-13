import re

with open('client/src/App.tsx', 'r') as f:
    content = f.read()

content = content.replace('<ProtectedRoute path="/inventory/grvs/:id" component={GrvDetailsPage} />',
"""<ProtectedRoute path="/inventory/grvs/new" component={CreateGrv} />
      <ProtectedRoute path="/inventory/grvs/:id" component={GrvDetailsPage} />""")

with open('client/src/App.tsx', 'w') as f:
    f.write(content)
