import { addDebugLog, errorDetail } from './debugLog.js';
import { isTextOnlyAIRequest, normalizeAITextArtifact } from './aiResponse.js';

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
};

export type SuiXiangReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export class SuiXiangTransientUpstreamError extends Error {
  readonly status: number | null;
  readonly attempts: number;
  readonly reasoningEfforts: SuiXiangReasoningEffort[];

  constructor(
    message: string,
    options: {
      status?: number | null;
      attempts: number;
      reasoningEfforts: SuiXiangReasoningEffort[];
    },
  ) {
    super(message);
    this.name = 'SuiXiangTransientUpstreamError';
    this.status = options.status ?? null;
    this.attempts = options.attempts;
    this.reasoningEfforts = options.reasoningEfforts;
  }
}

export function isSuiXiangTransientUpstreamError(
  error: unknown,
): error is SuiXiangTransientUpstreamError {
  return error instanceof SuiXiangTransientUpstreamError;
}

export function suiXiangReasoningEffort(environment: NodeJS.ProcessEnv = process.env) {
  const configured = String(environment.SUIXIANG_REASONING_EFFORT || 'high').trim().toLowerCase();
  return (['none', 'low', 'medium', 'high'].includes(configured) ? configured : 'high') as SuiXiangReasoningEffort;
}

export function suiXiangReasoningRetrySequence(
  initial: SuiXiangReasoningEffort = suiXiangReasoningEffort(),
) {
  const levels: SuiXiangReasoningEffort[] = ['none', 'low', 'medium', 'high'];
  const initialIndex = levels.indexOf(initial);
  return Array.from({ length: 2 }, (_, attempt) => (
    levels[Math.max(0, initialIndex - attempt)]
  ));
}

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
const NETWORK_RETRY_DELAYS_MS = [650];
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 524]);
const REASONING_TIMEOUT_HTTP_STATUSES = new Set([408, 504, 524]);

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
  const initialReasoningEffort = suiXiangReasoningEffort();
  const timeoutRetryEfforts = suiXiangReasoningRetrySequence(initialReasoningEffort);

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
      reasoningEffort: initialReasoningEffort,
      hasApiKey: Boolean(apiKey),
    },
  });

  let upstream: Response | null = null;
  const totalAttempts = NETWORK_RETRY_DELAYS_MS.length + 1;
  let reasoningEffort = initialReasoningEffort;
  const attemptedReasoningEfforts: SuiXiangReasoningEffort[] = [];
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    attemptedReasoningEfforts.push(reasoningEffort);
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
          response_format: { type: 'json_object' },
          reasoning_effort: reasoningEffort,
          max_completion_tokens: options.maxTokens || 8192,
        }),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const detail = errorDetail(error);
      const canRetry = isRetryableNetworkError(error) && attempt < totalAttempts;
      if (canRetry) {
        const retryInMs = NETWORK_RETRY_DELAYS_MS[attempt - 1];
        addDebugLog({
          kind: 'ai',
          phase: 'info',
          title: 'Sui-Xiang GPT-5.5 connection interrupted; retrying',
          durationMs: Math.round(performance.now() - startedAt),
          detail: {
            endpoint,
            model,
            attempt,
            totalAttempts,
            retryInMs,
            reasoningEffort,
            ...detail,
          },
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
      throw new SuiXiangTransientUpstreamError(
        reason
          ? `随想 GPT-5.5 网络连接在自动重试 ${attempt} 次后仍失败：${reason}`
          : '随想 GPT-5.5 网络连接失败，请稍后重试。',
        { attempts: attempt, reasoningEfforts: attemptedReasoningEfforts },
      );
    }

    if (upstream.ok) break;

    const errorData: any = await upstream.json().catch(() => null);
    const status = upstream.status;
    const canRetry = RETRYABLE_HTTP_STATUSES.has(status) && attempt < totalAttempts;
    if (canRetry) {
      const retryInMs = NETWORK_RETRY_DELAYS_MS[attempt - 1];
      const nextReasoningEffort = REASONING_TIMEOUT_HTTP_STATUSES.has(status)
        ? timeoutRetryEfforts[attempt]
        : reasoningEffort;
      addDebugLog({
        kind: 'ai',
        phase: 'info',
        title: 'Sui-Xiang GPT-5.5 upstream response retrying',
        durationMs: Math.round(performance.now() - startedAt),
        detail: {
          endpoint,
          model,
          status,
          statusText: upstream.statusText,
          attempt,
          totalAttempts,
          retryInMs,
          reasoningEffort,
          nextReasoningEffort,
          upstreamError: errorData?.error || errorData,
        },
      });
      reasoningEffort = nextReasoningEffort;
      await new Promise((resolve) => setTimeout(resolve, retryInMs));
      continue;
    }

    const upstreamMessage = errorData?.error?.message;
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'Sui-Xiang GPT-5.5 returned non-OK response',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        model,
        status,
        statusText: upstream.statusText,
        attempt,
        totalAttempts,
        reasoningEfforts: attemptedReasoningEfforts,
        upstreamError: errorData?.error || errorData,
      },
    });
    if (RETRYABLE_HTTP_STATUSES.has(status)) {
      const effortLabel = attemptedReasoningEfforts.join(' → ');
      throw new SuiXiangTransientUpstreamError(
        REASONING_TIMEOUT_HTTP_STATUSES.has(status)
          ? `随想 GPT-5.5 上游网关超时（HTTP ${status}）。系统已按 ${effortLabel} 推理强度自动重试 ${attempt} 次，但仍未及时返回；请点击“失败后重试”，上一版本不受影响。`
          : `随想 GPT-5.5 上游服务暂时不可用（HTTP ${status}），系统已自动重试 ${attempt} 次；请稍后点击“失败后重试”。`,
        {
          status,
          attempts: attempt,
          reasoningEfforts: attemptedReasoningEfforts,
        },
      );
    }
    throw new Error(upstreamMessage || `Sui-Xiang GPT-5.5 request failed with HTTP ${status}.`);
  }

  if (!upstream) throw new Error('Sui-Xiang GPT-5.5 network request failed without a response.');

  const data: any = await upstream.json().catch(() => null);
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
    text: normalizeAITextArtifact(parsed, isTextOnlyAIRequest(options.systemPrompt)),
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
      attempts: attemptedReasoningEfforts.length,
      reasoningEfforts: attemptedReasoningEfforts,
      usage: result.usage,
    },
  });

  return result;
}
