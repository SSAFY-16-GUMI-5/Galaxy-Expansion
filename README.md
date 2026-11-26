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
- Downloadable JavaScript participant starter with relay acknowledgments
- Tests for slot reuse, stale releases, multi-participant isolation, thresholds, validation
- GitHub Actions CI and optional GitHub Pages deployment

> This is an **MVP**. Production authentication and performance benchmarking are not complete. WebGL rendering requires a browser with WebGL support and internet access to load the pinned Three.js modules from jsDelivr.

## 1. Run web viewer (no installation needed)

Requires **Node.js 22+**.

```bash
npm run dev
```

Open **http://localhost:4173**. Demo mode works without a backend. Click **CREATE STAR**, **+10 STARS**, **RELEASE LAST**, **RESET**. Drag to orbit and scroll to zoom.

> `npm run dev` serves the static files using only Node built-in modules; it does **not** require npm install.

## 2. Run a live session

Install dependencies:

```bash
npm ci
npm run relay
```

Open **http://127.0.0.1:8787** and click **CONNECT**. The relay serves the viewer and accepts WebSocket connections at **ws://127.0.0.1:8787/ws**. To send an event from the JavaScript starter, run the following in a second terminal.

```bash
node bridge/local-bridge.mjs -- node starter/participant.mjs
```

Check the `[ack] acquire` in the participant terminal and look for **My First Star** in **Cosmic Activity**. See the [starter guide](starter/README.md) for participant setup and the slot lifecycle.

To publish the starter ZIP on the same server, run this from the repository root in PowerShell.

```powershell
New-Item -ItemType Directory -Force public/downloads | Out-Null
Compress-Archive -Path starter,bridge,LICENSE -DestinationPath public/downloads/galaxy-expansion-starter.zip -Force
```

The download is served at `/downloads/galaxy-expansion-starter.zip`. For a remote pilot, route HTTPS requests and WebSocket upgrades on `/ws` to the relay, set a dedicated `GALAXY_PRODUCER_TOKEN`, and share the token privately with participants. The viewer automatically uses the current origin for WSS.

To try the Python protocol demonstration, run the following command.

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

### Persist live state with PostgreSQL

Run [the database setup SQL](server/galaxy-state.sql) once in the target database. For Neon, use the SQL Editor on the branch the relay will connect to. Re-running the setup keeps the saved state.

Set `DATABASE_URL` in the relay's environment to the connection string from Neon. On Render, set it in the Web Service's Environment settings. The relay restores state before serving requests and sends an ACK after the event is committed. With no `DATABASE_URL`, the relay uses in-memory state for local development.

To verify persistence, acquire a star and release a different slot, wait for both ACKs, then restart the relay. Connect a viewer and check that the star remains. Reacquire the released slot using the next generation. The bundled sample programs start with a participant reset, so use a separate test program that can send individual events for this check.

### Deploy the relay on Render

Create a Node Web Service. Use `npm run relay` as the start command and `/health` as the health check path. Set `GALAXY_HOST=0.0.0.0`, `GALAXY_PRODUCER_TOKEN`, and `DATABASE_URL` in the service environment. The relay uses Render's `PORT` automatically.

Use this build command to package only the committed starter, bridge, and license files:

```bash
npm ci && mkdir -p public/downloads && git archive --format=zip --output=public/downloads/galaxy-expansion-starter.zip HEAD starter bridge LICENSE
```

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
starter/                  Participant instructions, JavaScript and C++ JSONL scaffolds
tests/                    Domain unit tests
docs/                     Architecture, implementation plan, protocol
.github/workflows/        CI and Pages publishing
```

## Design limits in version 0.1

- Stage is based on **current active star count**; releasing stars can lower the stage.
- All clients display the shared universe. Configure PostgreSQL to preserve the live state across relay restarts.
- One publisher can own one participant ID at a time. Duplicate IDs are rejected.
- Invalid events, stale generation numbers and duplicate acquisitions are rejected.
- Demo data exists only in the browser and is **not** shared with other viewers.
- The basic rendering path uses instanced meshes and point halos. Further LOD and multigallery management are future upgrades.
