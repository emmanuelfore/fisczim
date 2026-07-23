import os
import re

files_to_fix = [
    "CashiersScreen.tsx",
    "CustomersScreen.tsx",
    "DashboardScreen.tsx",
    "ExpensesScreen.tsx",
    "InventoryScreen.tsx",
    "POSScreen.tsx",
    "ProfileScreen.tsx",
    "ReportsScreen.tsx",
    "StockInScreen.tsx",
    "StockOperationsScreen.tsx",
    "SuppliersScreen.tsx"
]

base_dir = "/home/emmanuel/Documents/PROJECTS/fisczim/mobile/src/screens/"

single_line_pattern = re.compile(r'\s*<TouchableOpacity[^>]*onPress={onOpenDrawer}[^>]*>\s*<Menu[^>]*/>\s*</TouchableOpacity>')

for filename in files_to_fix:
    path = os.path.join(base_dir, filename)
    if not os.path.exists(path):
        continue
    
    with open(path, 'r') as f:
        content = f.read()

    original_content = content

    if filename == "POSScreen.tsx":
        # Remove the multiline block in POSScreen
        block_pattern = re.compile(r'\s*<TouchableOpacity[^>]*\s*activeOpacity=\{0\.82\}\s*onPress=\{onOpenDrawer\}[\s\S]*?<Menu size=\{22\}.*?/>\s*</TouchableOpacity>')
        content = block_pattern.sub('', content)
    elif filename == "ProfileScreen.tsx":
        block_pattern = re.compile(r'\s*<TouchableOpacity onPress=\{onOpenDrawer\} style=\{\{[\s\S]*?<Menu size=\{20\}.*?/>\s*</TouchableOpacity>')
        content = block_pattern.sub('', content)
    elif filename == "ReportsScreen.tsx":
        block_pattern = re.compile(r'\s*<TouchableOpacity style=\{styles\.iconBtn\} onPress=\{onOpenDrawer\}>\s*<Menu size=\{20\}.*?/>\s*</TouchableOpacity>')
        content = block_pattern.sub('', content)
    else:
        # Standard one line removal
        content = single_line_pattern.sub('', content)

    if content != original_content:
        with open(path, 'w') as f:
            f.write(content)
        print(f"Fixed {filename}")
    else:
        print(f"No changes for {filename}")

