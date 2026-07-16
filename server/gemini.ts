import { addDebugLog, errorDetail } from './debugLog.js';

export type GeminiResult = {
  text: string;
  code: string;
  model: string;
  usage: unknown;
};

export type GeminiOptions = {
  systemPrompt?: string;
  maxTokens?: number;
};

export const GEMINI_MODEL = 'gemini-2.5-flash';

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  return JSON.parse(withoutFence);
}

export async function generateWithGemini(
  prompt: string,
  model = GEMINI_MODEL,
  options: GeminiOptions = {},
): Promise<GeminiResult> {
  const startedAt = performance.now();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');
  if (!prompt.trim()) throw new Error('A non-empty prompt is required.');

  const selectedModel = model === GEMINI_MODEL ? model : GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

  addDebugLog({
    kind: 'ai',
    phase: 'request',
    title: 'Gemini generateContent request',
    detail: {
      endpoint,
      provider: 'gemini',
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
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: options.systemPrompt ||
              'You are an expert web developer. Follow the supplied user requirements exactly and do not invent features, themes, text, branding, games, or controls that were not requested. When requirements are underspecified, produce a minimal neutral implementation instead of fabricating content or product claims. Return only a JSON object with two keys: "text" for a concise explanation and "code" for one complete self-contained HTML document with all required CSS and JavaScript. Do not wrap the JSON in Markdown fences.',
          }],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: options.maxTokens || 8192,
        },
      }),
    });
  } catch (error) {
    const detail = errorDetail(error);
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'Gemini network request failed',
      durationMs: Math.round(performance.now() - startedAt),
      detail: { endpoint, provider: 'gemini', model: selectedModel, ...detail },
    });
    const reason = [detail.causeCode, detail.causeMessage || detail.message].filter(Boolean).join(': ');
    throw new Error(reason ? `Gemini network request failed: ${reason}` : 'Gemini network request failed.');
  }

  const data: any = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message = data?.error?.message || `Gemini request failed with HTTP ${upstream.status}.`;
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'Gemini returned non-OK response',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        provider: 'gemini',
        model: selectedModel,
        status: upstream.status,
        statusText: upstream.statusText,
        upstreamError: data?.error || data,
      },
    });
    throw new Error(message);
  }

  const content = (data?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => part?.text || '')
    .join('')
    .trim();
  if (!content) {
    const blockReason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    throw new Error(blockReason ? `Gemini returned no content (${blockReason}).` : 'Gemini returned an empty response.');
  }

  let parsed: any;
  try {
    parsed = parseJsonContent(content);
  } catch (error) {
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'Gemini response JSON parse failed',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        provider: 'gemini',
        model: selectedModel,
        contentPreview: content.slice(0, 500),
        ...errorDetail(error),
      },
    });
    throw new Error('Gemini returned content that could not be parsed as JSON.');
  }

  const result = {
    text: parsed.text || 'Generation complete.',
    code: parsed.code || '',
    model: data?.modelVersion || selectedModel,
    usage: data?.usageMetadata || null,
  };

  addDebugLog({
    kind: 'ai',
    phase: 'response',
    title: 'Gemini response received',
    durationMs: Math.round(performance.now() - startedAt),
    detail: {
      endpoint,
      provider: 'gemini',
      model: result.model,
      codeLength: result.code.length,
      textLength: result.text.length,
      usage: result.usage,
    },
  });

  return result;
}
