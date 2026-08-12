import assert from 'node:assert/strict';
import {
  configuredDeepSeekFallbackKeys,
  DevelopmentChannelPool,
} from '../server/developmentChannelPool.js';

assert.deepEqual(configuredDeepSeekFallbackKeys({
  DEEPSEEK_API_KEY: 'normal-deepseek',
}), ['normal-deepseek']);
assert.deepEqual(configuredDeepSeekFallbackKeys({
  DEEPSEEK_API_KEY: 'normal-deepseek',
  DEEPSEEK_FALLBACK_API_KEY: 'fallback-one',
  DEEPSEEK_FALLBACK_API_KEY_2: 'fallback-two',
  DEEPSEEK_FALLBACK_API_KEYS: 'fallback-three,fallback-two',
}), ['fallback-one', 'fallback-two', 'fallback-three']);

const pool = new DevelopmentChannelPool(
  ['gpt-one'],
  ['deepseek-one', 'deepseek-two', 'deepseek-three'],
);
assert.deepEqual(pool.stats(), {
  waiting: 0,
  active: 0,
  capacity: 4,
  gptActive: 0,
  gptCapacity: 1,
  deepSeekActive: 0,
  deepSeekCapacity: 3,
});

const firstDeepSeek = await pool.acquire();
const secondDeepSeek = await pool.acquire();
const thirdDeepSeek = await pool.acquire();
const gpt = await pool.acquire();
assert.equal(firstDeepSeek.provider, 'deepseek');
assert.equal(secondDeepSeek.provider, 'deepseek');
assert.equal(thirdDeepSeek.provider, 'deepseek');
assert.equal(gpt.provider, 'gpt5');
assert.deepEqual(pool.stats(), {
  waiting: 0,
  active: 4,
  capacity: 4,
  gptActive: 1,
  gptCapacity: 1,
  deepSeekActive: 3,
  deepSeekCapacity: 3,
});

const queueSnapshots: Array<{ task: string; position: number; waiting: number }> = [];
const fifthPromise = pool.acquire((snapshot) => queueSnapshots.push({
  task: 'fifth',
  position: snapshot.position,
  waiting: snapshot.waiting,
}));
const sixthPromise = pool.acquire((snapshot) => queueSnapshots.push({
  task: 'sixth',
  position: snapshot.position,
  waiting: snapshot.waiting,
}));
await Promise.resolve();
assert.deepEqual(queueSnapshots.filter((item) => item.task === 'fifth').at(-1), {
  task: 'fifth', position: 1, waiting: 2,
});
assert.deepEqual(queueSnapshots.filter((item) => item.task === 'sixth').at(-1), {
  task: 'sixth', position: 2, waiting: 2,
});

firstDeepSeek.release();
const fifth = await fifthPromise;
assert.equal(fifth.provider, 'deepseek');

gpt.release();
const sixth = await sixthPromise;
assert.equal(sixth.provider, 'gpt5');

secondDeepSeek.release();
thirdDeepSeek.release();
fifth.release();
sixth.release();
assert.deepEqual(pool.stats(), {
  waiting: 0,
  active: 0,
  capacity: 4,
  gptActive: 0,
  gptCapacity: 1,
  deepSeekActive: 0,
  deepSeekCapacity: 3,
});

const fallbackPool = new DevelopmentChannelPool(
  ['gpt-fallback'],
  ['deepseek-primary'],
);
const primaryLease = await fallbackPool.acquire();
assert.equal(primaryLease.provider, 'deepseek');
const fallbackLease = await fallbackPool.acquire(undefined, ['gpt5']);
assert.equal(fallbackLease.provider, 'gpt5');
primaryLease.release();
fallbackLease.release();

const evolutionPool = new DevelopmentChannelPool(
  ['gpt-evolution-one', 'gpt-evolution-two'],
  ['deepseek-evolution-one', 'deepseek-evolution-two'],
);
const firstEvolution = await evolutionPool.acquire(undefined, ['deepseek']);
const secondEvolution = await evolutionPool.acquire(undefined, ['deepseek']);
assert.equal(firstEvolution.provider, 'deepseek');
assert.equal(secondEvolution.provider, 'deepseek');
const queuedEvolution = evolutionPool.acquire(undefined, ['deepseek']);
firstEvolution.release();
const thirdEvolution = await queuedEvolution;
assert.equal(thirdEvolution.provider, 'deepseek');
secondEvolution.release();
thirdEvolution.release();

console.log('DeepSeek-only creation and evolution, isolated provider selection, and FIFO development channel tests passed');
