import assert from 'node:assert/strict';
import {
  configuredSuiXiangKeys,
  SuiXiangKeyPool,
} from '../server/suixiangKeyPool.js';
import {
  generateWithSuiXiangGPT,
  isSuiXiangTransientUpstreamError,
  suiXiangAttemptTimeoutMs,
  suiXiangReasoningEffort,
  suiXiangReasoningRetrySequence,
} from '../server/suixiang.js';

assert.equal(suiXiangReasoningEffort({}), 'high');
assert.equal(suiXiangReasoningEffort({ SUIXIANG_REASONING_EFFORT: 'medium' }), 'medium');
assert.equal(suiXiangReasoningEffort({ SUIXIANG_REASONING_EFFORT: 'invalid' }), 'high');
assert.deepEqual(suiXiangReasoningRetrySequence('high'), ['high', 'medium']);
assert.deepEqual(suiXiangReasoningRetrySequence('medium'), ['medium', 'low']);
assert.deepEqual(suiXiangReasoningRetrySequence('low'), ['low', 'none']);
assert.equal(suiXiangAttemptTimeoutMs({}), 90_000);
assert.equal(suiXiangAttemptTimeoutMs({ SUIXIANG_ATTEMPT_TIMEOUT_MS: '60000' }), 60_000);
assert.equal(suiXiangAttemptTimeoutMs({ SUIXIANG_ATTEMPT_TIMEOUT_MS: '999999' }), 150_000);

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

  requestedEfforts.length = 0;
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body || '{}'));
    requestedEfforts.push(request.reasoning_effort);
    return new Response(JSON.stringify({ error: { message: 'gateway timeout' } }), {
      status: 504,
      statusText: 'Gateway Timeout',
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await assert.rejects(
    () => generateWithSuiXiangGPT('test bounded retry', undefined, { apiKey: 'test-key' }),
    (error) => {
      assert.equal(isSuiXiangTransientUpstreamError(error), true);
      if (isSuiXiangTransientUpstreamError(error)) assert.equal(error.attempts, 2);
      return true;
    },
  );
  assert.deepEqual(
    requestedEfforts,
    ['high', 'medium'],
    'a gateway timeout must stop after one fallback request',
  );

  requestedEfforts.length = 0;
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body || '{}'));
    requestedEfforts.push(request.reasoning_effort);
    if (requestedEfforts.length === 1) {
      const connectionTimeout = new TypeError('fetch failed', {
        cause: Object.assign(new Error('headers timeout'), { code: 'UND_ERR_HEADERS_TIMEOUT' }),
      });
      throw connectionTimeout;
    }
    return new Response(JSON.stringify({
      model: 'gpt-5.5',
      choices: [{ message: { content: JSON.stringify({ text: 'network recovered', code: '' }) } }],
      usage: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const networkRecovered = await generateWithSuiXiangGPT(
    'test network timeout retry',
    undefined,
    { apiKey: 'test-key', reasoningEffort: 'medium' },
  );
  assert.equal(networkRecovered.text, 'network recovered');
  assert.deepEqual(
    requestedEfforts,
    ['medium', 'low'],
    'a connection-layer timeout must also lower reasoning effort',
  );
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
