import os
import re

directories = ["client/src/components", "client/src/pages"]

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content

    # 1. Remove w-XX from QuantityInput
    # We find all `<QuantityInput ...>` tags and remove `w-\d+`
    def replacer(match):
        tag = match.group(0)
        # remove w-20, w-16, w-24, w-32
        tag = re.sub(r'\bw-(16|20|24|28|32)\b', '', tag)
        # clean up any empty classNames like className=" " or className=""
        tag = re.sub(r'className=["\']\s*["\']', '', tag)
        return tag

    content = re.sub(r'<QuantityInput[^>]*>', replacer, content)

    # 2. Update table headers or cells that contain "Quantity"
    # e.g., <th className="... w-20 ...">Quantity</th>
    def th_replacer(match):
        tag = match.group(1)
        inner = match.group(2)
        tag = re.sub(r'\bw-(16|20|24|28|32)\b', 'min-w-[140px]', tag)
        # If there's no width specified but it contains Quantity, maybe we don't do anything, but let's just replace narrow widths
        return f"<{tag}>{inner}</"
    
    content = re.sub(r'<((?:th|td)[^>]*)>([^<]*Quantity[^<]*)</', th_replacer, content, flags=re.IGNORECASE)

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Widened inputs/headers in {filepath}")

for d in directories:
    for root, dirs, files in os.walk(d):
        for file in files:
            if file.endswith(".tsx"):
                process_file(os.path.join(root, file))
