import assert from 'node:assert/strict';
import {
  generateWithDeepSeek,
  isDeepSeekRecoverableResponseError,
} from '../server/deepseek.js';

const originalFetch = globalThis.fetch;
const requestBodies: any[] = [];
let calls = 0;

function completionResponse(content: string | null, finishReason = 'stop') {
  return new Response(JSON.stringify({
    model: 'deepseek-v4-flash',
    choices: [{
      finish_reason: finishReason,
      message: {
        content,
        reasoning_content: '',
      },
    }],
    usage: { completion_tokens: 1 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

try {
  globalThis.fetch = (async (_input, init) => {
    calls += 1;
    requestBodies.push(JSON.parse(String(init?.body || '{}')));
    return calls < 3
      ? completionResponse('', 'stop')
      : completionResponse(JSON.stringify({ text: 'recovered', code: '' }));
  }) as typeof fetch;

  const recovered = await generateWithDeepSeek('Return a compact artifact.', 'deepseek-v4-flash', {
    apiKey: 'test-key',
    maxTokens: 2048,
  });
  assert.equal(calls, 3);
  assert.equal(recovered.text, 'recovered');
  assert.ok(requestBodies.every((body) => body.thinking?.type === 'disabled'));
  assert.ok(requestBodies.every((body) => body.max_tokens >= 16_384));
  assert.ok(requestBodies.every((body) => body.response_format?.type === 'json_object'));

  calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return completionResponse(null, 'length');
  }) as typeof fetch;

  await assert.rejects(
    () => generateWithDeepSeek('Return another artifact.', 'deepseek-v4-flash', {
      apiKey: 'test-key',
    }),
    (error) => isDeepSeekRecoverableResponseError(error),
  );
  assert.equal(calls, 3);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('DeepSeek non-thinking, retry, diagnostics, and fallback signal tests passed');
