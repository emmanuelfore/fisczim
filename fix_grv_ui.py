import re

with open('client/src/pages/grv-details.tsx', 'r') as f:
    content = f.read()

target = """              {(grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).some((l: any) => l.productId === null) && ("""
replacement = """              {((grv.status === "DRAFT" && editableLines.length > 0 ? editableLines : grv.lines).some((l: any) => l.productId === null) || grv.status === "DRAFT") && ("""

content = content.replace(target, replacement)

with open('client/src/pages/grv-details.tsx', 'w') as f:
    f.write(content)

