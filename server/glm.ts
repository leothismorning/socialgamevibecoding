import { addDebugLog, errorDetail } from './debugLog.js';

export type GLMResult = {
  text: string;
  code: string;
  model: string;
  usage: unknown;
};

export type GLMOptions = {
  systemPrompt?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  responseMode?: 'json' | 'text';
};

export const GLM_MODEL = 'glm-5.2';

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  return JSON.parse(withoutFence);
}

function stripFence(content: string) {
  const trimmed = content.trim();
  return trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:html|json)?\s*/i, '').replace(/\s*```$/, '').trim()
    : trimmed;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractHtml(content: string) {
  const stripped = stripFence(content);
  const start = stripped.search(/<!doctype\s+html|<html[\s>]/i);
  if (start < 0) return null;

  const code = stripped.slice(start).trim();
  const summaryMatch = code.match(/<!--\s*SUMMARY:\s*([\s\S]*?)-->/i);
  return {
    text: summaryMatch?.[1]?.trim() || 'Generation complete.',
    code,
  };
}

function validateCompleteHtml(code: string, finishReason: unknown) {
  const openScripts = (code.match(/<script\b/gi) || []).length;
  const closeScripts = (code.match(/<\/script>/gi) || []).length;
  const missingDocumentEnd = !/<\/body>/i.test(code) || !/<\/html>/i.test(code);
  const truncated = finishReason === 'length' || openScripts !== closeScripts || missingDocumentEnd;

  if (!truncated) return;

  const reasons = [
    finishReason === 'length' ? 'the model stopped at the output token limit' : '',
    openScripts !== closeScripts ? `script tags are unbalanced (${openScripts} open, ${closeScripts} closed)` : '',
    missingDocumentEnd ? 'the HTML document is missing </body> or </html>' : '',
  ].filter(Boolean);

  throw new Error(`GLM returned an incomplete HTML document: ${reasons.join('; ')}. Try a shorter prompt, ask GLM for a simpler version, or switch to DeepSeek for full-page generation.`);
}

export async function generateWithGLM(
  prompt: string,
  model = GLM_MODEL,
  options: GLMOptions = {},
): Promise<GLMResult> {
  const startedAt = performance.now();
  const apiKey = process.env.GLM_API_KEY || process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error('GLM_API_KEY is not configured on the server.');
  if (!prompt.trim()) throw new Error('A non-empty prompt is required.');

  const selectedModel = model === GLM_MODEL ? model : GLM_MODEL;
  const endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  const textResponse = options.responseMode === 'text';
  const systemPrompt = textResponse
    ? options.systemPrompt ||
      'Return only the requested artifact as plain text. Do not wrap it in JSON or Markdown fences.'
    : `${options.systemPrompt || 'You are an expert web developer. Follow the supplied user requirements exactly and do not invent features, themes, text, branding, games, or controls that were not requested. When requirements are underspecified, produce a minimal neutral implementation instead of fabricating content or product claims.'}

Output override for GLM reliability:
Return a complete self-contained HTML document only, not JSON and not Markdown.
Start with <!doctype html>.
Place a concise public summary in an HTML comment near the top in this exact form:
<!-- SUMMARY: one-sentence summary of what you built or changed -->
Include all CSS and JavaScript in the same document.`;

  addDebugLog({
    kind: 'ai',
    phase: 'request',
    title: 'GLM chat completions request',
    detail: {
      endpoint,
      provider: 'glm',
      model: selectedModel,
      promptLength: prompt.length,
      outputMode: textResponse ? 'text' : 'direct_html',
      hasApiKey: Boolean(apiKey),
    },
  });

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
            content: systemPrompt,
          },
          { role: 'user', content: prompt },
        ],
        thinking: { type: 'disabled' },
        reasoning_effort: 'none',
        max_tokens: options.maxTokens || (textResponse ? 2048 : 12288),
        temperature: 0.6,
      }),
    });
  } catch (error) {
    const detail = errorDetail(error);
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'GLM network request failed',
      durationMs: Math.round(performance.now() - startedAt),
      detail: { endpoint, provider: 'glm', model: selectedModel, ...detail },
    });
    const reason = [detail.causeCode, detail.causeMessage || detail.message].filter(Boolean).join(': ');
    throw new Error(reason ? `GLM network request failed: ${reason}` : 'GLM network request failed.');
  }

  const data: any = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message = data?.error?.message || `GLM request failed with HTTP ${upstream.status}.`;
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'GLM returned non-OK response',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        provider: 'glm',
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
      title: 'GLM returned empty content',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        provider: 'glm',
        model: selectedModel,
        status: upstream.status,
        finishReason: data?.choices?.[0]?.finish_reason,
        messageKeys: data?.choices?.[0]?.message ? Object.keys(data.choices[0].message) : [],
        contentLength: String(data?.choices?.[0]?.message?.content || '').length,
        reasoningLength: String(data?.choices?.[0]?.message?.reasoning_content || '').length,
        usage: data?.usage || null,
        responseKeys: data ? Object.keys(data) : [],
      },
    });
    throw new Error('GLM returned an empty response.');
  }

  if (textResponse) {
    const result = {
      text: String(content).trim(),
      code: '',
      model: data?.model || selectedModel,
      usage: data?.usage || null,
    };
    addDebugLog({
      kind: 'ai',
      phase: 'response',
      title: 'GLM text response received',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        provider: 'glm',
        model: result.model,
        textLength: result.text.length,
        finishReason: data?.choices?.[0]?.finish_reason,
        usage: result.usage,
      },
    });
    return result;
  }

  const htmlResult = extractHtml(content);
  if (htmlResult) {
    validateCompleteHtml(htmlResult.code, data?.choices?.[0]?.finish_reason);
    const result = {
      text: htmlResult.text,
      code: htmlResult.code,
      model: data?.model || selectedModel,
      usage: data?.usage || null,
    };

    addDebugLog({
      kind: 'ai',
      phase: 'response',
      title: 'GLM HTML response received',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        provider: 'glm',
        model: result.model,
        codeLength: result.code.length,
        textLength: result.text.length,
        finishReason: data?.choices?.[0]?.finish_reason,
        usage: result.usage,
      },
    });

    return result;
  }

  let parsed: any;
  try {
    parsed = parseJsonContent(content);
  } catch (error) {
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'GLM response JSON parse failed',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        provider: 'glm',
        model: selectedModel,
        finishReason: data?.choices?.[0]?.finish_reason,
        contentLength: content.length,
        reasoningLength: String(data?.choices?.[0]?.message?.reasoning_content || '').length,
        usage: data?.usage || null,
        contentPreview: content.slice(0, 500),
        ...errorDetail(error),
      },
    });
    throw new Error('GLM returned content that could not be parsed as JSON or HTML.');
  }

  const normalizedCode = pickString(
    parsed.code,
    parsed.html,
    parsed.HTML,
    parsed.full_html,
    parsed.fullHtml,
    parsed.document,
    parsed.content,
    parsed.result,
  );
  const normalizedText = pickString(parsed.text, parsed.summary, parsed.explanation, parsed.message) || 'Generation complete.';

  if (!normalizedCode && !options.systemPrompt?.includes('"code" set to an empty string')) {
    addDebugLog({
      kind: 'ai',
      phase: 'error',
      title: 'GLM returned JSON without usable HTML code',
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        endpoint,
        provider: 'glm',
        model: selectedModel,
        parsedKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [],
        contentPreview: content.slice(0, 500),
      },
    });
  }

  const result = {
    text: normalizedText,
    code: normalizedCode,
    model: data?.model || selectedModel,
    usage: data?.usage || null,
  };

  addDebugLog({
    kind: 'ai',
    phase: 'response',
    title: 'GLM response received',
    durationMs: Math.round(performance.now() - startedAt),
    detail: {
      endpoint,
      provider: 'glm',
      model: result.model,
      codeLength: result.code.length,
      textLength: result.text.length,
      usage: result.usage,
    },
  });

  return result;
}
