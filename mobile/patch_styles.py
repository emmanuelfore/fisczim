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
            
        original_content = content
        
        # Regex to match: const styles = makeStyles(args...);
        pattern = re.compile(r'const\s+styles\s*=\s*makeStyles\s*\(([^)]+)\)\s*;')
        
        def replacement(match):
            args = match.group(1)
            # The deps should be the same as the args for useMemo
            deps = args
            return f'const styles = useMemo(() => makeStyles({args}), [{deps}]);'
            
        content, count = pattern.subn(replacement, content)
        
        if count > 0:
            # Need to ensure useMemo is imported from 'react'
            # Look for import React... or import { ... } from 'react'
            if 'useMemo' not in content:
                # Add useMemo to existing react import
                if re.search(r'import\s+.*from\s+[\'"]react[\'"]', content):
                    # Has a react import, let's try to add useMemo
                    # This regex tries to add it to the destructured part
                    content = re.sub(r'(import\s+(?:[^,]+,\s*)?)\{([^}]+)\}(\s*from\s*[\'"]react[\'"])',
                                     lambda m: m.group(1) + '{' + m.group(2) + ', useMemo }' + m.group(3),
                                     content)
                    
                    if 'useMemo' not in content:
                        # If the regex didn't match (e.g. import React from 'react')
                        content = re.sub(r'import\s+([A-Za-z0-9_]+)\s+from\s+[\'"]react[\'"]',
                                         r'import \1, { useMemo } from "react"',
                                         content)
                else:
                    # Prepend it
                    content = 'import React, { useMemo } from "react";\n' + content
            
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Updated {filepath} with {count} replacements.")
