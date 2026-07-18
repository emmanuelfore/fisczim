import os
import re

directories = ["client/src/components", "client/src/pages"]

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content
    modified = False

    # 1. Add import if not present
    if "QuantityInput" not in content and "quantity" in content.lower() and "<Input" in content:
        # We will add it later if we actually modify the file
        pass

    # Find FormField blocks with name containing "quantity"
    # This regex is a bit complex. We look for name="..." or name={...} containing quantity
    # then we look for the next <Input
    
    # We will just do a simpler search:
    # Split content by "<Input"
    parts = content.split("<Input")
    if len(parts) == 1:
        return

    new_content = parts[0]
    for i in range(1, len(parts)):
        part = parts[i]
        
        # Check context before "<Input" to see if it's quantity related
        context_before = new_content[-300:].lower()
        
        # Check context inside the input tag
        # The input tag ends at the first ">" or "/>"
        tag_end_idx = part.find(">")
        if tag_end_idx == -1:
            new_content += "<Input" + part
            continue
            
        tag_content = part[:tag_end_idx].lower()
        
        is_quantity = False
        if "name=\"quantity\"" in context_before or "name={'quantity'}" in context_before or "name={`quantity`}" in context_before:
            is_quantity = True
        elif re.search(r'name=\{?[`\'"].*?quantity.*?[`\'"]\}?', context_before):
            is_quantity = True
        elif "quantity" in tag_content:
            is_quantity = True
        elif "qty" in tag_content:
            is_quantity = True
        elif re.search(r'name=[\'"]actualQuantity[\'"]', context_before):
            is_quantity = True
        elif "formlabel>quantity" in context_before.replace(" ", "").replace("\n", ""):
            is_quantity = True
            
        if is_quantity:
            # Replace className="w-..." with nothing or just remove it if we use QuantityInput
            # Or we just use QuantityInput and the component will append its classes
            # Wait, QuantityInput is `<QuantityInput`
            new_content += "<QuantityInput" + part
            modified = True
            print(f"Patched an input in {filepath}")
        else:
            new_content += "<Input" + part

    if modified:
        # add import
        if "QuantityInput" not in original_content:
            # Find last import
            imports = list(re.finditer(r'^import .*;?$', new_content, re.MULTILINE))
            if imports:
                last_import = imports[-1]
                new_content = new_content[:last_import.end()] + '\nimport { QuantityInput } from "@/components/ui/quantity-input";\n' + new_content[last_import.end():]
            else:
                new_content = 'import { QuantityInput } from "@/components/ui/quantity-input";\n' + new_content
        
        with open(filepath, 'w') as f:
            f.write(new_content)

for d in directories:
    for root, dirs, files in os.walk(d):
        for file in files:
            if file.endswith(".tsx"):
                process_file(os.path.join(root, file))
