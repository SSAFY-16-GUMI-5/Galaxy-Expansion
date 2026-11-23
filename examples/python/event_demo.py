"""Demonstration of the JSONL protocol, not an ObjectPool implementation.
Run with: node bridge/local-bridge.mjs -- python examples/python/event_demo.py
"""
import json
import sys
import time

init = json.loads(sys.stdin.readline())
assert init['type'] == 'init'

def emit(message):
    print(json.dumps(message, ensure_ascii=False), flush=True)

palette = ['#5dcaff', '#a78bfa', '#f8cf86', '#59e5c8', '#fb789e']
for index in range(16):
    emit({'type': 'acquire', 'poolSlotId': str(index), 'generation': 1,
          'data': {'name': f'Cosmic Seed {index + 1}', 'type': 'star',
                   'color': palette[index % len(palette)], 'size': 0.7 + (index % 4) * 0.22}})
    time.sleep(0.15)
for index in range(6):
    emit({'type': 'release', 'poolSlotId': str(index), 'generation': 1})
    time.sleep(0.12)
for index in range(6):
    emit({'type': 'acquire', 'poolSlotId': str(index), 'generation': 2,
          'data': {'name': f'Reborn Star {index + 1}', 'type': 'star',
                   'color': '#80f7ff', 'size': 1.3}})
    time.sleep(0.12)
