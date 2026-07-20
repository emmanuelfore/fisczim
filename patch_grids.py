import os
import re

target_dir = "/home/emmanuel/Documents/PROJECTS/fisczim/client/src"

# Regex to match grid-cols-X that are NOT preceded by a responsive prefix (like sm:, md:, lg:, xl:, 2xl:)
# Negative lookbehind: (?<!sm:)(?<!md:)(?<!lg:)(?<!xl:)(?<!2xl:)
pattern = re.compile(r'(?<!sm:)(?<!md:)(?<!lg:)(?<!xl:)(?<!2xl:)\bgrid-cols-([2-6])\b')

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # If the file doesn't have "grid-cols", skip
    if "grid-cols-" not in content:
        return False

    # Find all matches
    new_content, count = pattern.subn(r'grid-cols-1 md:grid-cols-\1', content)

    if count > 0:
        # Avoid "grid-cols-1 md:grid-cols-1 md:grid-cols-2" if grid-cols-1 was already there
        # This is a bit brute force, but effective
        new_content = new_content.replace('grid-cols-1 grid-cols-1', 'grid-cols-1')
        new_content = new_content.replace('grid-cols-1 md:grid-cols-1 md:grid-cols-2', 'grid-cols-1 md:grid-cols-2')

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Patched {count} grids in {filepath}")
        return True
    return False

modified_files = 0
for root, _, files in os.walk(target_dir):
    for file in files:
        if file.endswith(('.tsx', '.jsx', '.tsx', '.ts')):
            filepath = os.path.join(root, file)
            if process_file(filepath):
                modified_files += 1

print(f"\nTotal files modified: {modified_files}")
