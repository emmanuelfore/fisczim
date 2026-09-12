import os
import re

directory = '/home/emmanuel/Documents/PROJECTS/fisczim/mobile/src'

for root, _, files in os.walk(directory):
    for file in files:
        if not (file.endswith('.tsx') or file.endswith('.ts')):
            continue
            
        filepath = os.path.join(root, file)
        with open(filepath, 'r') as f:
            content = f.read()
            
        if 'useMemo' in content and 'useMemo' not in content.split('\n')[0:20]:
            # Let's properly check if it's imported
            # Check lines for import .* useMemo .* from 'react'
            imported = False
            for line in content.split('\n'):
                if line.startswith('import ') and 'useMemo' in line and 'react' in line:
                    imported = True
                    break
            
            if not imported:
                # Add useMemo to the React import
                def add_usememo(match):
                    # Check if it already has useMemo
                    if 'useMemo' in match.group(0):
                        return match.group(0)
                    if '{' in match.group(0):
                        return match.group(0).replace('{', '{ useMemo, ')
                    else:
                        return match.group(0).replace('import React', 'import React, { useMemo }')
                        
                new_content = re.sub(r'import\s+.*?from\s+[\'"]react[\'"];?', add_usememo, content, count=1)
                
                if new_content != content:
                    with open(filepath, 'w') as f:
                        f.write(new_content)
                    print(f"Fixed imports in {filepath}")
