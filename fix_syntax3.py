with open("client/src/pages/create-sales-order.tsx", "r") as f:
    text = f.read()

text = text.replace('editId ? parseInt(editId) : 0', 'editId')
text = text.replace('id: parseInt(editId!)', 'id: editId!')

with open("client/src/pages/create-sales-order.tsx", "w") as f:
    f.write(text)

print("Fixed syntax 3")
