# Galaxy Expansion — Object Pooling Study Platform

**SSAFY-16-GUMI-5 · PROJECT 01**  
Language-agnostic object pooling mini-project with a shared three-dimensional universe.

A participant's code **runs on their own computer**, publishes `acquire` and `release` events through a local bridge, and lights up stars in a shared WebGL scene. The relay server does **not** execute student code. A built-in demo mode works before the relay is connected.

## What's implemented in this MVP

- A real **3D WebGL scene** with colorful spherical stars, glow, orbit/zoom, and dark background (Three.js)
- `Cosmic Seed` (0–9), `Star Cluster` (10–29), `Proto Galaxy` (30–99), `Galaxy` (100+) transitions
- Built-in demo actions: spawn, spawn 10, release, reset
- Shared per-participant slot tracking, reuse generation validation, stage statistics
- WebSocket relay for viewers and authenticated local producers
- Language-independent **JSON Lines** subprocess bridge (Node.js 22+) and protocol example in Python
- Tests for slot reuse, stale releases, multi-participant isolation, thresholds, validation
- GitHub Actions CI and optional GitHub Pages deployment

> This is an **MVP**. The full server deployment, persistence, production authentication and performance benchmarking are not complete. WebGL rendering requires a browser with WebGL support and internet access to load the pinned Three.js modules from jsDelivr.

## 1. Run web viewer (no installation needed)

Requires **Node.js 22+**.

```bash
npm run dev
```

Open **http://localhost:4173**. Demo mode works without a backend. Click **CREATE STAR**, **+10 STARS**, **RELEASE LAST**, **RESET**. Drag to orbit and scroll to zoom.

> `npm run dev` serves the static files using only Node built-in modules; it does **not** require npm install.

## 2. Run realtime relay (optional)

Install dependencies:

```bash
npm install
npm run relay
```

Local relay listens on **ws://127.0.0.1:8787/ws**. Open the web page and click **CONNECT**. Run a participant program in a second terminal:

```bash
node bridge/local-bridge.mjs -- python examples/python/event_demo.py
```

The example creates stars, releases several slots, and reuses them. This example demonstrates protocol transmission; it is **not** a completed object-pool solution.

### Participant-specific environment

Set `GALAXY_PARTICIPANT_ID` to a unique name (letters, digits, `_`, `-`); `GALAXY_TOKEN` must match the relay token. Example in Bash:

```bash
GALAXY_PARTICIPANT_ID=alice GALAXY_TOKEN=local-demo-token node bridge/local-bridge.mjs -- python examples/python/event_demo.py
```

On PowerShell:

```powershell
$env:GALAXY_PARTICIPANT_ID="alice"
$env:GALAXY_TOKEN="local-demo-token"
node bridge/local-bridge.mjs -- python examples/python/event_demo.py
```

For Java, C++, C#, Rust, Go, etc., pass the corresponding execution command after `--`. The bridge uses `spawn` with `shell:false`. Programs must print one JSON object per line on stdout (and flush), and read JSON lines from stdin. Write normal logs to stderr.

**Security:** `local-demo-token` only works with the relay bound to `127.0.0.1`, and is never suitable for an internet-facing server. For remote connections configure `GALAXY_PRODUCER_TOKEN`, restrict who receives credentials, and use HTTPS/WSS at the reverse proxy. Anyone with a producer token can currently publish as any unoccupied participant ID; per-user identities and persistent authentication remain future work. Do not publish tokens in client-side JavaScript.

## 3. Object Pooling study assignment

Participants select **any language**, then implement their own object pool. The suggested model is:

- `CosmicObject { name, color, size, type }`
- `Acquire` a new or reusable slot; every first acquisition has generation `1`
- `Release` a previously acquired slot without treating it as a new allocation
- Acquire that slot again with generation `2`, new properties and the same pool slot ID
- Use stdout JSONL to report `acquire` / `release`, while managing identity and real references in the participant's language

**The server cannot prove physical object reuse** based only on event messages. That is a participant-side test/review requirement. Do not conflate graphical object IDs with language-level heap identity.

Suggested duration: 3–5 days. See [Project plan](docs/IMPLEMENTATION_PLAN.md) and [Protocol](docs/PROTOCOL.md).

## 4. Test

```bash
npm test
```

Tests only use Node's built-in test runner; no external dependencies are required.

## 5. GitHub organization deployment

Recommended new repository: `SSAFY-16-GUMI-5/galaxy-expansion`.

1. Create an empty repository in the organization.
2. Extract this project into it and push to the `main` branch.
3. For a public demo, enable **GitHub Pages → Build and deployment → GitHub Actions**. The `deploy-pages.yml` workflow publishes **only `public/`**.
4. Host the WebSocket relay separately if you need live participants. GitHub Pages is static hosting and **cannot run the relay server**.
5. For a deployed HTTPS site, enter a `wss://` endpoint in the Connect field; `ws://` mixed-content connections are blocked.

## Source layout

```text
public/                   WebGL site, CSS, and shared domain model
server/static.mjs         Built-in local static server (zero dependencies)
server/relay.mjs          WebSocket server (requires npm install)
bridge/local-bridge.mjs   Runs any local language program over JSONL
examples/python/          Minimal protocol event demonstration
tests/                    Domain unit tests
docs/                     Architecture, implementation plan, protocol
.github/workflows/        CI and Pages publishing
```

## Design limits in version 0.1

- Stage is based on **current active star count**; releasing stars can lower the stage.
- All clients display the shared universe in memory; restarting the relay resets the universe.
- One publisher can own one participant ID at a time. Duplicate IDs are rejected.
- Invalid events, stale generation numbers and duplicate acquisitions are rejected.
- Demo data exists only in the browser and is **not** shared with other viewers.
- The basic rendering path uses instanced meshes and point halos. Further LOD and multigallery management are future upgrades.
