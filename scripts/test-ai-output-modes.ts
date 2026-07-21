import assert from 'node:assert/strict';
import { generateWithDeepSeek } from '../server/deepseek.js';
import { generateWithGemini } from '../server/gemini.js';
import { generateWithGLM } from '../server/glm.js';
import { generateWithSuiXiangGPT } from '../server/suixiang.js';

const originalFetch = globalThis.fetch;
const rawArtifact = '<section class="content-section">{"unfinished": true</section>';

async function withMockResponse(
  payload: unknown,
  task: () => Promise<{ text: string; code: string }>,
) {
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const result = await task();
  assert.equal(result.text, rawArtifact);
  assert.equal(result.code, '');
  assert.equal('response_format' in requestBody, false, 'plain-text requests must not require JSON output');
}

process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
process.env.GLM_API_KEY = 'test-glm-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

try {
  await withMockResponse(
    { model: 'deepseek-v4-flash', choices: [{ finish_reason: 'stop', message: { content: rawArtifact } }] },
    () => generateWithDeepSeek('Generate HTML', 'deepseek-v4-flash', { responseMode: 'text' }),
  );

  await withMockResponse(
    { model: 'gpt-5.5', choices: [{ finish_reason: 'stop', message: { content: rawArtifact } }] },
    () => generateWithSuiXiangGPT('Generate HTML', 'gpt-5.5', { apiKey: 'test-gpt-key', responseMode: 'text' }),
  );

  await withMockResponse(
    { model: 'glm-5.2', choices: [{ finish_reason: 'stop', message: { content: rawArtifact } }] },
    () => generateWithGLM('Generate HTML', 'glm-5.2', { responseMode: 'text' }),
  );

  await withMockResponse(
    {
      modelVersion: 'gemini-2.5-flash',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: rawArtifact }] } }],
    },
    () => generateWithGemini('Generate HTML', 'gemini-2.5-flash', { responseMode: 'text' }),
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('AI output-mode test passed: all agent providers accept long-form plain text without JSON parsing.');
