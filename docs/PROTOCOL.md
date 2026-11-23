# Galaxy Expansion Protocol v1

## Transport

- Local student program ↔ local bridge: one UTF-8 JSON object per line (`JSONL`). **stdout reserved for messages**, stderr for logs.
- Bridge ↔ relay: WebSocket text frames containing JSON.
- Relay ↔ viewers: WebSocket read-only state broadcast.
- All producers operate within an authenticated `participantId` namespace.

## Handshake

Bridge → relay:
```json
{"type":"hello","role":"producer","participantId":"alice","token":"<secret>"}
```
Relay → bridge:
```json
{"type":"hello_ack","role":"producer","participantId":"alice"}
```
Bridge → student stdin:
```json
{"type":"init","participantId":"alice"}
```
Web viewer → relay:
```json
{"type":"hello","role":"viewer"}
```
Viewer receives `hello_ack`, followed by a `snapshot` containing `stars` and statistics.

## Acquire

Student stdout → bridge → relay:
```json
{"type":"acquire","poolSlotId":"7","generation":1,"data":{"name":"Aurora","type":"star","color":"#5dcaff","size":1.2}}
```

The server sets `participantId` from the authenticated connection. It is intentionally **ignored** if submitted by the participant. Valid types: `seed`, `star`, `planet` (v1 all render as simple stars). Color is `#RRGGBB`, size 0.3..3.5, name length 1..40.

After a successful acquire the slot is active. If the slot was previously released, it must be acquired with the previous generation plus one.

## Release

```json
{"type":"release","poolSlotId":"7","generation":1}
```

Only an active slot with exactly that generation can be released.

## Reset participant slots

```json
{"type":"reset"}
```

Resets only the authenticated participant's objects.

## Acknowledgment

```json
{"type":"ack","action":"acquire","revision":42}
```

Errors:
```json
{"type":"error","message":"Slot is already active"}
```

**Ordering:** a program should not assume immediate delivery; wait for `ack` or `error` on stdin if it needs confirmation. The server processes messages in arrival order. The example publisher sends at a conservative rate. This version does not provide exactly-once delivery or persistent event replay.

## Viewer event and snapshot

```json
{"type":"event","event":{"type":"release","participantId":"alice","poolSlotId":"7","generation":1,"revision":43},"stats":{"type":"snapshot","stage":{"id":1,"name":"COSMIC SEED","min":0,"max":9},"activeCount":0,"pooledCount":1,"availableCount":1,"totalAcquired":1,"reuseCount":0,"participants":1,"stars":[]}}
```

Viewer clients must not issue acquire/release commands. The server determines stage solely from active objects: 0–9, 10–29, 30–99, 100+.

## Safety constraints (MVP)

- Maximum 8 KiB WebSocket message and 90 messages/second per connection.
- At most 1200 active stars across the relay, at most 500 distinct slots per participant.
- No client-submitted HTML, scripts, free-form shader code, arbitrary asset URLs, or code execution.
- Secrets belong on bridge/server only, never in a public webpage.
