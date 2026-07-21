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
  signal?: AbortSignal;
  apiKey?: string;
  responseMode?: 'json' | 'text';
};

export const SUIXIANG_GPT_MODEL = 'gpt-5.5';

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);
const NETWORK_RETRY_DELAYS_MS = [500, 1200];

function isRetryableNetworkError(error: unknown) {
  const err = error as any;
  const code = String(err?.cause?.code || err?.code || '').toUpperCase();
  const message = String(err?.cause?.message || err?.message || '').toLowerCase();
  return RETRYABLE_NETWORK_CODES.has(code)
    || message.includes('socket disconnected')
    || message.includes('before secure tls connection')
    || message.includes('fetch failed');
}

export async function generateWithSuiXiangGPT(
  prompt: string,
  model = SUIXIANG_GPT_MODEL,
  options: SuiXiangOptions = {},
): Promise<SuiXiangResult> {
  const startedAt = performance.now();
  const apiKey = options.apiKey || process.env.SUIXIANG_API_KEY;
  const baseUrl = (process.env.SUIXIANG_BASE_URL || 'https://sui-xiang.com').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/v1/chat/completions`;
  const textResponse = options.responseMode === 'text';

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
      outputMode: textResponse ? 'text' : 'json',
      hasApiKey: Boolean(apiKey),
    },
  });

  let upstream: Response | null = null;
  const totalAttempts = NETWORK_RETRY_DELAYS_MS.length + 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      upstream = await fetch(endpoint, {
        method: 'POST',
        signal: options.signal,
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
          ...(textResponse ? {} : { response_format: { type: 'json_object' } }),
          max_completion_tokens: options.maxTokens || 8192,
        }),
      });
      break;
    } catch (error) {
      const detail = errorDetail(error);
      const canRetry = isRetryableNetworkError(error) && attempt < totalAttempts;
      if (canRetry) {
        const retryInMs = NETWORK_RETRY_DELAYS_MS[attempt - 1];
        addDebugLog({
          kind: 'ai',
          phase: 'info',
          title: 'Sui-Xiang GPT-5.5 connection interrupted; retrying',
          durationMs: Math.round(performance.now() - startedAt),
          detail: { endpoint, model, attempt, totalAttempts, retryInMs, ...detail },
        });
        await new Promise((resolve) => setTimeout(resolve, retryInMs));
        continue;
      }

      addDebugLog({
        kind: 'ai',
        phase: 'error',
        title: 'Sui-Xiang GPT-5.5 network request failed',
        durationMs: Math.round(performance.now() - startedAt),
        detail: { endpoint, model, attempt, totalAttempts, ...detail },
      });
      const reason = [detail.causeCode, detail.causeMessage || detail.message].filter(Boolean).join(': ');
      throw new Error(reason ? `Sui-Xiang GPT-5.5 network request failed after ${attempt} attempt(s): ${reason}` : 'Sui-Xiang GPT-5.5 network request failed.');
    }
  }

  if (!upstream) throw new Error('Sui-Xiang GPT-5.5 network request failed without a response.');

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

  if (textResponse) {
    const result = {
      text: String(content).trim(),
      code: '',
      model: data.model || model,
      usage: data.usage || null,
    };
    addDebugLog({
      kind: 'ai',
      phase: 'response',
      title: 'Sui-Xiang GPT-5.5 text response received',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model: result.model,
        textLength: result.text.length,
        finishReason: data?.choices?.[0]?.finish_reason,
        usage: result.usage,
      },
    });
    return result;
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
