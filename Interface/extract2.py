import json
import sys

log_path = r'C:\Users\Emmanuel\.gemini\antigravity\brain\bd3eea60-eefa-496c-a26d-0474106f4399\.system_generated\logs\transcript_full.jsonl'
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'TOOL_RESPONSE' and data.get('source') == 'SYSTEM':
                content = data.get('content', '')
                if '1092 lines' in content:
                    print(content)
                    with open('truncated_diff.txt', 'w', encoding='utf-8') as out:
                        out.write(content)
                    sys.exit(0)
        except Exception as e:
            pass
