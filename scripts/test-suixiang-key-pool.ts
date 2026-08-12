import assert from 'node:assert/strict';
import {
  configuredSuiXiangKeys,
  SuiXiangKeyPool,
} from '../server/suixiangKeyPool.js';
import {
  generateWithSuiXiangGPT,
  suiXiangReasoningEffort,
  suiXiangReasoningRetrySequence,
} from '../server/suixiang.js';

assert.equal(suiXiangReasoningEffort({}), 'high');
assert.equal(suiXiangReasoningEffort({ SUIXIANG_REASONING_EFFORT: 'medium' }), 'medium');
assert.equal(suiXiangReasoningEffort({ SUIXIANG_REASONING_EFFORT: 'invalid' }), 'high');
assert.deepEqual(suiXiangReasoningRetrySequence('high'), ['high', 'medium', 'low']);
assert.deepEqual(suiXiangReasoningRetrySequence('medium'), ['medium', 'low', 'none']);
assert.deepEqual(suiXiangReasoningRetrySequence('low'), ['low', 'none', 'none']);

const originalFetch = globalThis.fetch;
const originalReasoningEffort = process.env.SUIXIANG_REASONING_EFFORT;
const requestedEfforts: string[] = [];
try {
  process.env.SUIXIANG_REASONING_EFFORT = 'high';
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body || '{}'));
    requestedEfforts.push(request.reasoning_effort);
    if (requestedEfforts.length === 1) {
      return new Response(JSON.stringify({ error: { message: 'gateway timeout' } }), {
        status: 504,
        statusText: 'Gateway Timeout',
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      model: 'gpt-5.5',
      choices: [{ message: { content: JSON.stringify({ text: 'recovered', code: '' }) } }],
      usage: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const recovered = await generateWithSuiXiangGPT('test retry', undefined, { apiKey: 'test-key' });
  assert.equal(recovered.text, 'recovered');
  assert.deepEqual(requestedEfforts, ['high', 'medium']);
} finally {
  globalThis.fetch = originalFetch;
  if (originalReasoningEffort === undefined) delete process.env.SUIXIANG_REASONING_EFFORT;
  else process.env.SUIXIANG_REASONING_EFFORT = originalReasoningEffort;
}

assert.deepEqual(configuredSuiXiangKeys({
  SUIXIANG_API_KEY: 'primary',
  SUIXIANG_API_KEY_APP2: 'legacy-two',
  SUIXIANG_API_KEY_POOL_4: 'pool-four',
  SUIXIANG_API_KEYS: 'list-five,list-six\nlist-seven',
}), ['primary', 'legacy-two', 'pool-four', 'list-five', 'list-six', 'list-seven']);

const pool = new SuiXiangKeyPool(['key-one', 'key-two', 'key-one']);
assert.deepEqual(pool.stats(), { capacity: 2, active: 0, waiting: 0 });

const first = await pool.acquire();
const second = await pool.acquire();
assert.deepEqual(pool.stats(), { capacity: 2, active: 2, waiting: 0 });

const snapshots: Array<{ position: number; active: number; waiting: number; capacity: number }> = [];
const order: string[] = [];
const thirdPromise = pool.acquire((snapshot) => snapshots.push(snapshot))
  .then((lease) => {
    order.push('third');
    return lease;
  });
const fourthPromise = pool.acquire()
  .then((lease) => {
    order.push('fourth');
    return lease;
  });

await Promise.resolve();
assert.deepEqual(pool.stats(), { capacity: 2, active: 2, waiting: 2 });
assert.equal(snapshots.at(-1)?.position, 1);
assert.equal(snapshots.at(-1)?.capacity, 2);

first.release();
const third = await thirdPromise;
assert.deepEqual(order, ['third']);
assert.deepEqual(pool.stats(), { capacity: 2, active: 2, waiting: 1 });

second.release();
const fourth = await fourthPromise;
assert.deepEqual(order, ['third', 'fourth']);
assert.deepEqual(pool.stats(), { capacity: 2, active: 2, waiting: 0 });

third.release();
fourth.release();
fourth.release();
assert.deepEqual(pool.stats(), { capacity: 2, active: 0, waiting: 0 });

console.log('Sui-Xiang key pool capacity, deduplication, queue position, and FIFO tests passed');
