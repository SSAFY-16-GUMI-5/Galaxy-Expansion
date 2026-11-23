import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';

const { participantId, batches, exitCode } = JSON.parse(process.argv[2]);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
const replies = lines[Symbol.asyncIterator]();

async function read() {
  const { value, done } = await replies.next();
  assert.equal(done, false, 'Bridge closed stdin before the expected reply');
  return JSON.parse(value);
}

assert.deepEqual(await read(), { type: 'init', participantId });
for (const batch of batches) {
  for (const [event] of batch) process.stdout.write(JSON.stringify(event) + '\n');
  for (const [, expected] of batch) {
    if (expected) assert.deepEqual(await read(), expected);
  }
}
lines.close();
process.stdin.destroy();
process.exitCode = exitCode;
