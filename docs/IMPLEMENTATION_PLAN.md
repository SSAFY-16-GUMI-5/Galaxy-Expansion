# Implementation Plan — Galaxy Expansion v0.1

## Project identity

- **Organization:** SSAFY-16-GUMI-5
- **Study focus:** object-oriented design and object pooling
- **Target languages:** no restriction, including C, C++, C#, Java, Python, Rust, Go, JavaScript
- **Study window:** 3–5 days **after the platform is ready**
- **Deliverable:** a locally executable program that demonstrates true instance reuse and publishes events to a shared WebGL galaxy

## Architecture

```text
Student program (any language)
  ⇅ UTF-8 JSON Lines over stdin/stdout
Local Bridge (Node.js 22+)
  ⇅ WebSocket (WSS in production)
Relay Server: validation + state + stage computation
  ↓ real-time snapshots/events
WebGL Viewer: Three.js 3D scene + statistics

GitHub Actions: build/tests separately from runtime communication
```

## Division of responsibilities

| Owner | Deliverable |
|-------|-------------|
| Platform operator | viewer, relay, local bridge, event schema, demo mode, CI templates |
| Participant | independently written model/object pool, acquire/release logic, object identity verification, runnable CLI, explanatory README |

The server never executes submitted code. The viewer cannot control participants' programs.

## Milestones

### M0 — Common contract (implemented)
- Stable object properties: name, color, size, type
- `participantId + poolSlotId + generation` namespace
- Acquire, release, reset semantics, validation, stage thresholds
- Tests independent of UI and networking

### M1 — 3D scene (implemented as browser MVP)
- Space scene, three-dimensional sphere geometry, glow and orbit camera
- Visual star acquisition and disappearance on release
- Four stage thresholds: 0, 10, 30, 100 active stars
- Demo controls and activity feed
- Explicit demo/live modes

### M2 — Realtime bridge (integration verified)
- Separate Node WebSocket relay
- Authenticated producer and read-only viewer roles
- Per-participant object namespace
- JSON Lines subprocess bridge for arbitrary languages
- Handle reconnects and bad messages, limit message size and event rate
- Verified producer ACKs and Edge WebGL updates through both localhost and a temporary HTTPS/WSS endpoint

### M3 — External participant pilot (next milestone)
- Share the viewer URL and starter ZIP with two participants. Share the producer token privately.
- Have each participant run their own code on a separate PC with a unique participant ID, using slot `1` for both.
- Confirm matching relay acknowledgments and viewer activity for acquire, release, and generation 2 acquire. Open a second viewer and confirm its snapshot matches the current counts.
- Record each participant's proof of reference reuse alongside the browser result.
- Choose a persistent HTTPS/WSS host and enable Pages if the team needs a separate static viewer.

### M4 — Study-ready starters
- JavaScript and C++ (`starter/cpp/`) starters and ZIP verified; add language scaffolds based on participant demand
- Common offline runner for behavioral verification
- Setup documentation and pull-request checklist
- Require tests that prove reference/instance reuse, not just reported events

## MVP acceptance criteria

1. Browser supports orbit and zoom in real 3D space.
2. Demo acquire/release affects active-star count and render state.
3. Active thresholds 10, 30, 100 change the galaxy stage.
4. Invalid messages cannot change server state.
5. Same slot ID can be reused with incremented generation.
6. Multiple participants can use identical local slot identifiers.
7. Browser viewer does not execute participant binaries.
8. Unit tests pass in GitHub Actions.
9. End-to-end live integration is verified **before** claiming the platform fully operational.

## Follow-up architecture decisions

- Persistence: live state survives producer disconnect. With `DATABASE_URL` configured, PostgreSQL also preserves state across relay restarts.
- Identity: token per participant instead of the shared dev token.
- LOD: instantiate optimized meshes per star group, use point-cloud galaxies at long distance.
- Sound and visual transitions: optional and outside study scope.
- Participants can choose object types and visuals, but server ultimately controls allowed fields.
