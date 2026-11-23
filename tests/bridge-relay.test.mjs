import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { on, once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { WebSocket } from 'ws';

const platform = fileURLToPath(new URL('../', import.meta.url));
const bridge = fileURLToPath(new URL('../bridge/local-bridge.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/bridge-producer.mjs', import.meta.url));
const token = 'local-integration-token';

function start(t, args, options) {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const closed = once(child, 'close');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed.catch(() => {});
  });
  // A startup failure may arrive before the test starts awaiting the result.
  closed.catch(() => {});
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  child.stdout.resume();
  return { child, closed, stderr: () => stderr };
}

async function startRelay(t) {
  // Let the OS select a loopback port and release it before starting Relay.
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  reservation.close();
  await once(reservation, 'close');
  const relay = start(t, ['server/relay.mjs'], {
    cwd: platform,
    env: { ...process.env, GALAXY_HOST: '127.0.0.1', GALAXY_PORT: String(port), GALAXY_PRODUCER_TOKEN: token },
  });
  const origin = `127.0.0.1:${port}`;
  while (!t.signal.aborted && relay.child.exitCode === null && relay.child.signalCode === null) {
    const response = await fetch(`http://${origin}/health`, {
      signal: AbortSignal.any([t.signal, AbortSignal.timeout(500)]),
    }).catch(() => null);
    if (response?.ok) {
      assert.equal((await response.json()).active, 0);
      return `ws://${origin}/ws`;
    }
    await delay(25, undefined, { signal: t.signal });
  }
  assert.fail(`Relay failed to start: ${relay.stderr()}`);
}

async function watch(t, url) {
  const ws = new WebSocket(url);
  t.after(() => ws.terminate());
  const events = [];
  // Attach the iterator before sending hello so even the initial snapshot is captured.
  const messages = on(ws, 'message', { signal: t.signal, close: ['close'] });
  await once(ws, 'open', { signal: t.signal });
  ws.send(JSON.stringify({ type: 'hello', role: 'viewer' }));
  async function read() {
    const { value, done } = await messages.next();
    assert.equal(done, false, 'Viewer disconnected before receiving the expected message');
    return JSON.parse(value[0]);
  }
  assert.deepEqual(await read(), { type: 'hello_ack', role: 'viewer' });
  const snapshot = await read();
  assert.equal(snapshot.type, 'snapshot');
  return {
    events,
    snapshot,
    async untilOffline(participantId) {
      for (;;) {
        const message = await read();
        if (message.type === 'event') events.push(message);
        if (message.type === 'participant_status' && message.participantId === participantId && !message.online) return;
      }
    },
  };
}

async function runBridge(t, url, participantId, command, { status = 0, cwd = platform, producerToken = token } = {}) {
  const run = start(t, [bridge, '--', ...command], {
    cwd,
    env: { ...process.env, GALAXY_WS: url, GALAXY_TOKEN: producerToken, GALAXY_PARTICIPANT_ID: participantId },
  });
  assert.deepEqual(await run.closed, [status, null], run.stderr());
  return run.stderr();
}

function producer(participantId, batches, exitCode = 0) {
  return [process.execPath, fixture, JSON.stringify({ participantId, batches, exitCode })];
}

const data = { name: '은하 Aurora', type: 'star', color: '#5dcaff', size: 1.2 };
const acquire = (poolSlotId, generation = 1) => ({ type: 'acquire', poolSlotId, generation, data });
const release = (poolSlotId, generation = 1) => ({ type: 'release', poolSlotId, generation });
const ack = (action, revision) => ({ type: 'ack', action, revision });
const reject = message => ({ type: 'error', message });

test('live Relay and Bridge preserve ordered replies, participant ownership and Stage thresholds', { timeout: 15000 }, async t => {
  const url = await startRelay(t);
  const viewer = await watch(t, url);
  assert.equal(viewer.snapshot.revision, 0);
  await runBridge(t, url, 'alice', producer('alice', [[
    [acquire('same'), ack('acquire', 1)],
    [acquire('same'), reject('Slot is already active')],
    [release('same'), ack('release', 2)],
    [acquire('same', 2), ack('acquire', 3)],
    [release('same'), reject('Stale release generation')],
    [{ ...acquire('bad'), data: { ...data, color: 'blue' } }, reject('Invalid color')],
    ...Array.from({ length: 48 }, (_, i) => [acquire(`a${i}`), ack('acquire', i + 4)]),
  ]]));
  await viewer.untilOffline('alice');
  assert.equal(viewer.events.length, 51, 'Rejected events must not be broadcast or advance revision');

  await runBridge(t, url, 'bob', producer('bob', [[
    [{ ...acquire('same'), participantId: 'alice' }, ack('acquire', 52)],
    ...Array.from({ length: 50 }, (_, i) => [acquire(`b${i}`), ack('acquire', i + 53)]),
    [release('b49'), ack('release', 103)],
    [release('b48'), ack('release', 104)],
    [{ type: 'reset', participantId: 'alice' }, ack('reset', 105)],
  ]]));
  await viewer.untilOffline('bob');

  const at = revision => viewer.events[revision - 1];
  assert.deepEqual(viewer.events.map(({ event }) => event.revision), Array.from({ length: 105 }, (_, i) => i + 1));
  assert.equal(at(3).event.star.generation, 2);
  assert.equal(at(3).event.star.reused, true);
  assert.equal(at(3).event.star.name, data.name);
  assert.equal(at(52).event.star.generation, 1);
  assert.deepEqual(at(52).stats.stars.filter(star => star.poolSlotId === 'same').map(star => star.key), ['alice:same', 'bob:same']);
  assert.deepEqual(
    [11, 12, 31, 32, 101, 102, 103, 104, 105].map(revision => [at(revision).stats.activeCount, at(revision).stats.stage.id]),
    [[9, 1], [10, 2], [29, 2], [30, 3], [99, 3], [100, 4], [99, 3], [98, 3], [49, 3]],
  );
  assert.deepEqual(at(105).event, { type: 'reset', participantId: 'bob', revision: 105 });
  assert.ok(at(105).stats.stars.every(star => star.participantId === 'alice'));
  assert.equal(at(105).stats.reuseCount, 1);
  assert.deepEqual((await watch(t, url)).snapshot, at(105).stats);
});

test('Bridge reports child exit codes and drains its final stdout', { timeout: 15000 }, async t => {
  const url = await startRelay(t);
  const viewer = await watch(t, url);
  // Write and exit without waiting for an ack, as older v1 producers may do.
  await runBridge(t, url, 'fire_and_forget', producer('fire_and_forget', [[[acquire('last')]]]));
  await viewer.untilOffline('fire_and_forget');
  assert.equal(viewer.events[0]?.event.star.key, 'fire_and_forget:last');

  await runBridge(t, url, 'failed', producer('failed', [[
    [acquire('failed-child'), ack('acquire', 2)],
  ]], 17), { status: 17 });
  await viewer.untilOffline('failed');
  assert.equal(viewer.events[1]?.event.star.key, 'failed:failed-child');

  const launchError = await runBridge(t, url, 'missing', ['galaxy-nonexistent-integration-executable'], { status: 1 });
  assert.match(launchError, /launch error/);
  const authError = await runBridge(t, url, 'unauthorized', producer('unauthorized', []), {
    status: 1, producerToken: 'invalid-token',
  });
  assert.match(authError, /Invalid producer credentials/);
});

const starter = process.env.GALAXY_TEST_STARTER_DIR;
const python = process.env.GALAXY_TEST_PYTHON ?? 'python';
test('Starter Python Runner reaches the live Relay through the Bridge', {
  skip: !starter && 'Set GALAXY_TEST_STARTER_DIR to the integrated Starter checkout',
  timeout: 20000,
}, async t => {
  const url = await startRelay(t);
  const viewer = await watch(t, url);
  const participantId = 'python_runner';
  const command = [
    python, '-m', 'framework.adapters.python', '--module', 'tests.fixtures.python_runner_demo',
  ];
  await runBridge(t, url, participantId, command, { cwd: starter });
  await viewer.untilOffline(participantId);

  assert.deepEqual(viewer.events.map(({ event }) => event.type), [
    ...Array(10).fill('acquire'), 'release', 'acquire',
  ]);
  assert.deepEqual(
    [0, 9, 10, 11].map(i => [viewer.events[i].stats.activeCount, viewer.events[i].stats.stage.id]),
    [[1, 1], [10, 2], [9, 1], [10, 2]],
  );
  const initial = viewer.events[0].event.star;
  const released = viewer.events[10].event;
  const reborn = viewer.events[11].event.star;
  assert.equal(initial.participantId, participantId);
  assert.equal(initial.name, '새벽');
  assert.equal(initial.generation, 1);
  assert.equal(released.poolSlotId, initial.poolSlotId);
  assert.equal(released.generation, 1);
  assert.equal(reborn.key, initial.key);
  assert.equal(reborn.generation, 2);
  assert.equal(reborn.name, 'Reborn Nova');
  assert.equal(reborn.reused, true);
  assert.deepEqual((await watch(t, url)).snapshot, viewer.events.at(-1).stats);

  const stderr = await runBridge(t, url, participantId, command, { cwd: starter, status: 1 });
  await viewer.untilOffline(participantId);
  assert.match(stderr, /\[galaxy runner\].*Slot is already active/);
  assert.equal(viewer.events.length, 12);

  await runBridge(t, url, participantId, [...command, '--reset-on-start'], { cwd: starter });
  await viewer.untilOffline(participantId);
  assert.equal(viewer.events[12].event.type, 'reset');
  assert.equal(viewer.events[12].stats.activeCount, 0);
  assert.deepEqual(viewer.events[13].event.star, initial);
  assert.equal(viewer.events.length, 25);
  assert.deepEqual(viewer.events.at(-1).event.star, reborn);
});
