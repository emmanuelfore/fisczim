import json
import sys

log_path = r'C:\Users\Emmanuel\.gemini\antigravity\brain\bd3eea60-eefa-496c-a26d-0474106f4399\.system_generated\logs\transcript_full.jsonl'
form1_path = r'C:\Users\Emmanuel\Documents\PROJECTS\fisczim\Interface\Form1.cs'

with open(form1_path, 'r', encoding='utf-8') as f:
    content = f.read()

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('source') == 'MODEL' and data.get('type') == 'PLANNER_RESPONSE':
                created_at = data.get('created_at', '')
                if created_at > '2026-07-26T19:00:00Z':
                    break # Stop at the recent bad edits
                
                tool_calls = data.get('tool_calls', [])
                for tc in tool_calls:
                    if tc.get('name') == 'multi_replace_file_content':
                        args = tc.get('args', {})
                        if 'Form1.cs' in args.get('TargetFile', ''):
                            chunks = args.get('ReplacementChunks', [])
                            for chunk in chunks:
                                target = chunk.get('TargetContent', '')
                                replacement = chunk.get('ReplacementContent', '')
                                if target in content:
                                    content = content.replace(target, replacement)
                                    print(f"Applied chunk from {created_at}")
                                else:
                                    print(f"Failed to apply chunk from {created_at}")
        except Exception as e:
            pass

with open('Form1_recovered.cs', 'w', encoding='utf-8') as f:
    f.write(content)
print("Saved Form1_recovered.cs")
