import re

files_to_fix = [
    "client/src/pages/bulk-adjustment.tsx",
    "client/src/pages/create-quotation.tsx",
    "client/src/pages/create-sales-order.tsx"
]

for filepath in files_to_fix:
    with open(filepath, 'r') as f:
        content = f.read()

    # The issue is we injected `\nimport { QuantityInput } from "@/components/ui/quantity-input";\n` inside a multi-line import.
    # We should extract this line, remove it, and prepend it to the top.
    
    import_line = 'import { QuantityInput } from "@/components/ui/quantity-input";'
    
    if import_line in content:
        # Remove all instances of it
        content = content.replace(import_line + '\n', '')
        content = content.replace(import_line, '')
        
        # Also, check if there's an orphaned `import {\n\n`
        # wait, the file has:
        # import {
        # import { QuantityInput }...
        # Let's just prepend it at the very beginning of the file.
        content = import_line + '\n' + content
        
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")
