import { strict as assert } from 'node:assert';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { mapConcurrently } from './promise';

test('mapConcurrently preserves original ordering', async () => {
  const input = [1, 2, 3, 4, 5];

  const output = await mapConcurrently(input, 2, async (value) => {
    await sleep(1);
    return value * 2;
  });

  assert.deepEqual(output, [2, 4, 6, 8, 10]);
});

test('mapConcurrently does not exceed the concurrency limit', async () => {
  const input = Array.from({ length: 6 }, (_, index) => index);
  let active = 0;
  let peak = 0;

  const output = await mapConcurrently(input, 3, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await sleep(10);
    active -= 1;
    return value;
  });

  assert.deepEqual(output, input);
  assert.equal(peak <= 3, true, `Expected peak concurrency <= 3 but got ${peak}`);
});
