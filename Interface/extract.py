import json
import sys

log_path = r'C:\Users\Emmanuel\.gemini\antigravity\brain\bd3eea60-eefa-496c-a26d-0474106f4399\.system_generated\logs\transcript_full.jsonl'
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'TOOL_RESPONSE' and data.get('source') == 'SYSTEM':
                content = data.get('content', '')
                if '1092 lines' in content and '+        // ── Smart Feature: Initialise all background services' in content:
                    # We found the git diff output! Let's extract the actual diff text.
                    # The content usually looks like: The command completed successfully.\nOutput:\n<truncated X lines>\n...
                    # Wait, the output field in the JSON might contain it.
                    print(content)
                    with open('full_diff.patch', 'w', encoding='utf-8') as out:
                        out.write(content)
                    sys.exit(0)
        except Exception as e:
            pass
