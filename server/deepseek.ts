import { addDebugLog, errorDetail } from './debugLog.js';

type DeepSeekResult = {
  text: string;
  code: string;
  model: string;
  usage: unknown;
};

type DeepSeekOptions = {
  systemPrompt?: string;
  maxTokens?: number;
};

const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

export async function generateWithDeepSeek(
  prompt: string,
  model = 'deepseek-v4-flash',
  options: DeepSeekOptions = {},
): Promise<DeepSeekResult> {
  const startedAt = performance.now();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured on the server.');
  }

  if (!prompt.trim()) {
    throw new Error('A non-empty prompt is required.');
  }

  const selectedModel = ALLOWED_MODELS.has(model) ? model : 'deepseek-v4-flash';
  const endpoint = 'https://api.deepseek.com/chat/completions';

  addDebugLog({
    kind: 'ai',
    phase: 'request',
    title: 'DeepSeek chat completions request',
    detail: {
      endpoint,
      model: selectedModel,
      promptLength: prompt.length,
      hasApiKey: Boolean(apiKey),
    },
  });

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: options.systemPrompt ||
              'You are an expert web developer creating study-ready web prototypes. Return only a JSON object with two keys: "text" for a concise explanation and "code" for a complete self-contained HTML document. Use Tailwind CSS via CDN when useful. Do not wrap the JSON in Markdown fences.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: options.maxTokens || 8192,
      }),
    });
  } catch (error) {
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'DeepSeek network request failed',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model: selectedModel,
        ...errorDetail(error),
      },
    });

    const detail = errorDetail(error);
    const reason = [detail.causeCode, detail.causeMessage || detail.message].filter(Boolean).join(': ');
    throw new Error(reason ? `DeepSeek network request failed: ${reason}` : 'DeepSeek network request failed.');
  }

  const data: any = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message = data?.error?.message || `DeepSeek request failed with HTTP ${upstream.status}.`;
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'DeepSeek returned non-OK response',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model: selectedModel,
        status: upstream.status,
        statusText: upstream.statusText,
        upstreamError: data?.error || data,
      },
    });
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'DeepSeek returned empty content',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model: selectedModel,
        status: upstream.status,
        responseKeys: data ? Object.keys(data) : [],
      },
    });
    throw new Error('DeepSeek returned an empty response.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'DeepSeek response JSON parse failed',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model: selectedModel,
        contentPreview: content.slice(0, 500),
        ...errorDetail(error),
      },
    });
    throw error;
  }

  const result = {
    text: parsed.text || 'Generation complete.',
    code: parsed.code || '',
    model: data.model || selectedModel,
    usage: data.usage || null,
  };

  addDebugLog({
    kind: 'ai',
    phase: 'response',
    title: 'DeepSeek response received',
    durationMs: Math.round(performance.now() - startedAt),
    detail: {
      endpoint,
      model: result.model,
      codeLength: result.code.length,
      textLength: result.text.length,
      usage: result.usage,
    },
  });

  return result;
}
