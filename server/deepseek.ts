import { addDebugLog, errorDetail } from './debugLog.js';
import { isTextOnlyAIRequest, normalizeAITextArtifact } from './aiResponse.js';

type DeepSeekResult = {
  text: string;
  code: string;
  model: string;
  usage: unknown;
};

type DeepSeekOptions = {
  systemPrompt?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey?: string;
};

const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
const RESPONSE_RETRY_DELAYS_MS = [500, 1200];
const MIN_DEEPSEEK_MAX_TOKENS = 16_384;

export class DeepSeekRecoverableResponseError extends Error {
  readonly code = 'DEEPSEEK_RECOVERABLE_RESPONSE_ERROR';
}

export function isDeepSeekRecoverableResponseError(error: unknown) {
  return (error as { code?: unknown } | null)?.code === 'DEEPSEEK_RECOVERABLE_RESPONSE_ERROR';
}

export async function generateWithDeepSeek(
  prompt: string,
  model = 'deepseek-v4-flash',
  options: DeepSeekOptions = {},
): Promise<DeepSeekResult> {
  const startedAt = performance.now();
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured on the server.');
  }

  if (!prompt.trim()) {
    throw new Error('A non-empty prompt is required.');
  }

  const selectedModel = ALLOWED_MODELS.has(model) ? model : 'deepseek-v4-flash';
  const endpoint = 'https://api.deepseek.com/chat/completions';
  const maxTokens = Math.max(options.maxTokens || 8192, MIN_DEEPSEEK_MAX_TOKENS);

  addDebugLog({
    kind: 'ai',
    phase: 'request',
    title: 'DeepSeek chat completions request',
    detail: {
      endpoint,
      model: selectedModel,
      promptLength: prompt.length,
      maxTokens,
      thinking: 'disabled',
      hasApiKey: Boolean(apiKey),
    },
  });

  const totalAttempts = RESPONSE_RETRY_DELAYS_MS.length + 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    options.signal?.throwIfAborted();
    let upstream: Response;
    try {
      upstream = await fetch(endpoint, {
        method: 'POST',
        signal: options.signal,
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
                'You are an expert web developer. Follow the supplied user requirements exactly and do not invent features, themes, text, branding, games, or controls that were not requested. When requirements are underspecified, produce a minimal neutral implementation instead of fabricating content or product claims. Return only a JSON object with two keys: "text" for a concise explanation and "code" for one complete self-contained HTML document with all required CSS and JavaScript. Do not wrap the JSON in Markdown fences.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          max_tokens: maxTokens,
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
          attempt,
          totalAttempts,
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
          attempt,
          totalAttempts,
          status: upstream.status,
          statusText: upstream.statusText,
          upstreamError: data?.error || data,
        },
      });
      throw new Error(message);
    }

    const choice = data?.choices?.[0];
    const content = String(choice?.message?.content || '');
    const finishReason = String(choice?.finish_reason || 'unknown');
    let parsed: any = null;
    let parseError: unknown = null;
    if (content.trim()) {
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        parseError = error;
      }
    }

    const hasJsonObject = Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
    if (!content.trim() || parseError || !hasJsonObject) {
      const retryInMs = RESPONSE_RETRY_DELAYS_MS[attempt - 1];
      const canRetry = attempt < totalAttempts;
      addDebugLog({
        kind: 'ai',
        phase: canRetry ? 'info' : 'error',
        title: canRetry
          ? 'DeepSeek returned unusable content; retrying automatically'
          : 'DeepSeek repeatedly returned unusable content',
        durationMs: Math.round(performance.now() - startedAt),
        detail: {
          endpoint,
          model: selectedModel,
          attempt,
          totalAttempts,
          retryInMs: canRetry ? retryInMs : null,
          status: upstream.status,
          finishReason,
          responseKeys: data ? Object.keys(data) : [],
          messageKeys: choice?.message ? Object.keys(choice.message) : [],
          contentLength: content.length,
          reasoningLength: String(choice?.message?.reasoning_content || '').length,
          parsedType: parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed,
          usage: data?.usage || null,
          ...(parseError ? errorDetail(parseError) : {}),
        },
      });
      if (canRetry) {
        await new Promise((resolve) => setTimeout(resolve, retryInMs));
        continue;
      }
      throw new DeepSeekRecoverableResponseError(
        `DeepSeek returned unusable content after ${totalAttempts} attempts (finish_reason=${finishReason}).`,
      );
    }

    const result = {
      text: normalizeAITextArtifact(parsed, isTextOnlyAIRequest(options.systemPrompt)),
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
        attempt,
        finishReason,
        codeLength: result.code.length,
        textLength: result.text.length,
        usage: result.usage,
      },
    });

    return result;
  }

  throw new DeepSeekRecoverableResponseError('DeepSeek did not return usable content.');
}
