import { addDebugLog, errorDetail } from './debugLog.js';

type SuiXiangResult = {
  text: string;
  code: string;
  model: string;
  usage: unknown;
};

type SuiXiangOptions = {
  systemPrompt?: string;
  maxTokens?: number;
};

export const SUIXIANG_GPT_MODEL = 'gpt-5.5';

export async function generateWithSuiXiangGPT(
  prompt: string,
  model = SUIXIANG_GPT_MODEL,
  options: SuiXiangOptions = {},
): Promise<SuiXiangResult> {
  const startedAt = performance.now();
  const apiKey = process.env.SUIXIANG_API_KEY;
  const baseUrl = (process.env.SUIXIANG_BASE_URL || 'https://sui-xiang.com').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/v1/chat/completions`;

  if (!apiKey) {
    throw new Error('SUIXIANG_API_KEY is not configured on the server.');
  }
  if (!prompt.trim()) {
    throw new Error('A non-empty prompt is required.');
  }

  addDebugLog({
    kind: 'ai',
    phase: 'request',
    title: 'Sui-Xiang GPT-5.5 chat completions request',
    detail: {
      endpoint,
      model,
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
        model,
        messages: [
          {
            role: 'system',
            content:
              options.systemPrompt ||
              'You are an expert web developer. Follow the supplied user requirements exactly and do not invent features, themes, text, branding, games, or controls that were not requested. When requirements are underspecified, produce a minimal neutral implementation instead of fabricating content or product claims. Return only a JSON object with two keys: "text" for a concise explanation and "code" for one complete self-contained HTML document with all required CSS and JavaScript. Do not wrap the JSON in Markdown fences.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: options.maxTokens || 8192,
      }),
    });
  } catch (error) {
    const detail = errorDetail(error);
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'Sui-Xiang GPT-5.5 network request failed',
      durationMs: Math.round(performance.now() - startedAt),
      detail: { endpoint, model, ...detail },
    });
    const reason = [detail.causeCode, detail.causeMessage || detail.message].filter(Boolean).join(': ');
    throw new Error(reason ? `Sui-Xiang GPT-5.5 network request failed: ${reason}` : 'Sui-Xiang GPT-5.5 network request failed.');
  }

  const data: any = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message = data?.error?.message || `Sui-Xiang GPT-5.5 request failed with HTTP ${upstream.status}.`;
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'Sui-Xiang GPT-5.5 returned non-OK response',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model,
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
      title: 'Sui-Xiang GPT-5.5 returned empty content',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model,
        status: upstream.status,
        finishReason: data?.choices?.[0]?.finish_reason,
        responseKeys: data ? Object.keys(data) : [],
        usage: data?.usage || null,
      },
    });
    throw new Error('Sui-Xiang GPT-5.5 returned an empty response.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'Sui-Xiang GPT-5.5 response JSON parse failed',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model,
        contentPreview: content.slice(0, 500),
        ...errorDetail(error),
      },
    });
    throw new Error('Sui-Xiang GPT-5.5 returned content that could not be parsed as JSON.');
  }

  const result = {
    text: parsed.text || 'Generation complete.',
    code: parsed.code || '',
    model: data.model || model,
    usage: data.usage || null,
  };

  addDebugLog({
    kind: 'ai',
    phase: 'response',
    title: 'Sui-Xiang GPT-5.5 response received',
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
