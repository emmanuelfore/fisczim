import json
import sys

log_path = r'C:\Users\Emmanuel\.gemini\antigravity\brain\bd3eea60-eefa-496c-a26d-0474106f4399\.system_generated\logs\transcript_full.jsonl'
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('source') == 'MODEL' and data.get('type') == 'PLANNER_RESPONSE':
                tool_calls = data.get('tool_calls', [])
                for tc in tool_calls:
                    if tc.get('name') == 'multi_replace_file_content' or tc.get('name') == 'write_to_file':
                        args = tc.get('args', {})
                        if 'Form1.cs' in args.get('TargetFile', ''):
                            print(f"Found edit at {data.get('created_at')}")
        except Exception as e:
            pass
