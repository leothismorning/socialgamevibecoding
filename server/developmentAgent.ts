import { type AIProvider, type AIResult, generateWithAI } from './ai.js';
import { addDebugLog } from './debugLog.js';
import { ensureStandalonePerformanceGuard } from './previewPerformance.js';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

type AgentIdea = {
  selection_rank?: number;
  selection_role?: string;
  participant_code?: string;
  content: string;
  invested?: number;
  investor_count?: number;
};

export type DevelopmentAgentInput = {
  provider: AIProvider;
  experimentTitle: string;
  roundNumber?: number;
  brief?: string;
  creatorPrompt?: string;
  selectedIdeas?: AgentIdea[];
  fusionPlan?: string;
  currentCode?: string;
  creatorMessage?: string;
  recentConversation?: string;
  signal?: AbortSignal;
  apiKey?: string;
  onProgress?: (progress: DevelopmentAgentProgress) => void;
  mode: 'initial-project' | 'round-candidate' | 'debug';
};

export type DevelopmentAgentProgress = {
  step: string;
  order: number;
  status: 'pending' | 'running' | 'completed' | 'warning' | 'failed' | 'cancelled';
  title: string;
  detail?: string;
};

export type DevelopmentAgentOutput = AIResult & {
  steps: string[];
};

const DEFAULT_AGENT_STEP_TIMEOUT_MS = 6 * 60 * 1000;
const DEFAULT_AGENT_TOTAL_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_AGENT_REPAIR_ATTEMPTS = 2;

function positiveTimeoutFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1000 ? value : fallback;
}

function timeoutMinutes(milliseconds: number) {
  return Math.max(1, Math.round(milliseconds / 60_000));
}

function repairAttemptsFromEnv() {
  const value = Number(process.env.AI_AGENT_REPAIR_ATTEMPTS);
  return Number.isInteger(value) && value >= 0 ? Math.min(value, 3) : DEFAULT_AGENT_REPAIR_ATTEMPTS;
}

async function withAbortTimeout<T>(
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  timeoutMessage: string,
  task: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  const signal = parentSignal
    ? AbortSignal.any([parentSignal, controller.signal])
    : controller.signal;
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(new Error(timeoutMessage));
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([task(signal), timeout]);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    if (parentSignal?.aborted) {
      throw new Error('AI 开发连接已经中断，本轮开发失败，请重试。');
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const TEXT_ONLY_SYSTEM =
  'You are one step in a web-development agent pipeline. Return only JSON with "text" containing the requested artifact and "code" set to an empty string. Do not use Markdown fences unless the user explicitly asks for fenced code.';

const FALLBACK_IMAGE_DATA_URI = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#dbeafe"/>
      <stop offset="1" stop-color="#ede9fe"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect x="380" y="210" width="440" height="255" rx="34" fill="#ffffff" opacity="0.76"/>
  <circle cx="510" cy="305" r="44" fill="#93c5fd"/>
  <path d="M420 420l135-120 95 82 65-58 85 96H420z" fill="#818cf8" opacity="0.86"/>
  <text x="600" y="535" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#334155">Image unavailable</text>
</svg>`)}`;

type ArtifactInspection = {
  usedClasses: string[];
  definedClasses: string[];
  missingClasses: string[];
  utilityClasses: string[];
  coverage: number;
};

export type InteractionStyleInspection = {
  usedStateClasses: string[];
  missingStateClasses: string[];
  coverage: number;
};

type ImageResolutionReport = {
  checked: number;
  preserved: number;
  replaced: number;
  fallbacks: number;
  invalidUrls: string[];
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function extractHtmlClasses(body: string) {
  return unique(
    [...body.matchAll(/\bclass=["']([^"']+)["']/gi)]
      .flatMap((match) => match[1].split(/\s+/))
      .map((value) => value.trim()),
  );
}

function extractCssClasses(css: string) {
  return unique([...css.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)].map((match) => match[1]));
}

function looksLikeTailwindUtility(value: string) {
  // Only flag syntax that strongly implies a framework dependency. Prefix-only
  // checks such as `left-`, `object-`, or `content-` also match ordinary
  // semantic names like `left-wall`, `object-core`, and `content-section`.
  return /^(?:(?:sm|md|lg|xl|2xl|dark|print|hover|focus|focus-within|active|disabled|group-hover|peer-checked):)/.test(value)
    || /^-?(?:m|p)[trblxy]?-(?:\d+(?:\.\d+)?|px|auto|\[[^\]]+\])$/.test(value)
    || /^(?:w|h|min-w|max-w|min-h|max-h)-\d+\/\d+$/.test(value)
    || /^content-(?:none|\[[^\]]+\])$/.test(value)
    || /\[[^\]]+\]/.test(value);
}

export function inspectAgentArtifacts(body: string, css: string): ArtifactInspection {
  const usedClasses = extractHtmlClasses(body);
  const definedClasses = extractCssClasses(css);
  const defined = new Set(definedClasses);
  const missingClasses = usedClasses.filter((value) => !defined.has(value));
  const utilityClasses = usedClasses.filter(looksLikeTailwindUtility);
  const coverage = usedClasses.length === 0 ? 1 : (usedClasses.length - missingClasses.length) / usedClasses.length;
  return { usedClasses, definedClasses, missingClasses, utilityClasses, coverage };
}

function extractJsStateClasses(js: string) {
  const values: string[] = [];
  const addQuotedValues = (source: string) => {
    for (const match of source.matchAll(/(["'`])([^"'`]+)\1/g)) {
      values.push(...match[2].split(/\s+/).filter(Boolean));
    }
  };
  for (const match of js.matchAll(/\.classList\.(?:add|remove|toggle|contains|replace)\s*\(([^)]*)\)/g)) {
    addQuotedValues(match[1]);
  }
  for (const match of js.matchAll(/\.className\s*=\s*([^;]+)/g)) {
    addQuotedValues(match[1]);
  }
  for (const match of js.matchAll(/\.setAttribute\s*\(\s*["']class["']\s*,\s*([^)]+)\)/g)) {
    addQuotedValues(match[1]);
  }
  return unique(values);
}

export function inspectAgentInteractionStyles(js: string, css: string): InteractionStyleInspection {
  const usedStateClasses = extractJsStateClasses(js);
  const defined = new Set(extractCssClasses(css));
  const missingStateClasses = usedStateClasses.filter((value) => !defined.has(value));
  const coverage = usedStateClasses.length === 0
    ? 1
    : (usedStateClasses.length - missingStateClasses.length) / usedStateClasses.length;
  return { usedStateClasses, missingStateClasses, coverage };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function repairAgentInteractionClassNames(js: string, css: string) {
  const inspection = inspectAgentInteractionStyles(js, css);
  const defined = new Set(extractCssClasses(css));
  const replacements: Array<{ from: string; to: string }> = [];
  let repairedJs = js;
  inspection.missingStateClasses.forEach((missing) => {
    const withoutStatePrefix = missing.startsWith('is-') ? missing.slice(3) : '';
    if (!withoutStatePrefix || !defined.has(withoutStatePrefix)) return;
    const quotedExactClass = new RegExp(`(["'\`])${escapeRegExp(missing)}\\1`, 'g');
    repairedJs = repairedJs.replace(quotedExactClass, (value, quote) => `${quote}${withoutStatePrefix}${quote}`);
    replacements.push({ from: missing, to: withoutStatePrefix });
  });
  return {
    js: repairedJs,
    replacements,
    inspection: inspectAgentInteractionStyles(repairedJs, css),
  };
}

function stripFence(value: string) {
  let text = value.trim();
  text = text.replace(/^```(?:html|css|js|javascript|json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return text;
}

function cleanBodyFragment(value: string) {
  return stripFence(value)
    .replace(/<!doctype[\s\S]*?<body[^>]*>/i, '')
    .replace(/<\/body>[\s\S]*$/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim();
}

function cleanCss(value: string) {
  return stripFence(value)
    .replace(/<\/?style[^>]*>/gi, '')
    .trim();
}

function cleanJs(value: string) {
  return stripFence(value)
    .replace(/<\/?script[^>]*>/gi, '')
    .trim();
}

export function removePlatformOwnedAgentToast(body: string) {
  return body
    .replace(/<([a-z][\w:-]*)\b(?=[^>]*\bid=["']agentToast["'])[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[a-z][\w:-]*\b(?=[^>]*\bid=["']agentToast["'])[^>]*\/?\s*>/gi, '')
    .trim();
}

type RepairArtifact = 'body' | 'css' | 'javascript';

function parseRepairArtifact(value: string): { artifact: RepairArtifact; content: string } {
  const text = stripFence(value);
  const match = text.match(/^ARTIFACT\s*:\s*(BODY|CSS|JAVASCRIPT|JS)\s*\r?\n/i);
  if (!match) {
    throw new Error('The correction agent did not identify the artifact it repaired.');
  }
  const artifact = match[1].toLowerCase() === 'js'
    ? 'javascript'
    : match[1].toLowerCase() as RepairArtifact;
  const content = stripFence(text.slice(match[0].length));
  if (!content) throw new Error(`The correction agent returned an empty ${artifact} artifact.`);
  return { artifact, content };
}

function truncate(value: string, max = 6000) {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max)}\n\n[truncated: ${value.length - max} characters omitted]`;
}

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase();
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    return parts[0] === 0
      || parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || parts[0] >= 224;
  }
  if (net.isIPv6(normalized)) {
    return normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith('::ffff:127.')
      || normalized.startsWith('::ffff:10.')
      || normalized.startsWith('::ffff:192.168.');
  }
  return true;
}

async function isPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.local')) return false;
  if (net.isIP(normalized)) return !isPrivateIp(normalized);
  try {
    const addresses = await lookup(normalized, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((entry) => !isPrivateIp(entry.address));
  } catch {
    return false;
  }
}

async function probeRemoteImage(value: string) {
  let current: URL;
  try {
    current = new URL(value);
  } catch {
    return false;
  }

  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    if (!['http:', 'https:'].includes(current.protocol) || !(await isPublicHostname(current.hostname))) return false;
    try {
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(7000),
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Range: 'bytes=0-2047',
          'User-Agent': 'VibecodingStudy/1.0 image-validator',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) return false;
        current = new URL(location, current);
        continue;
      }
      const contentType = response.headers.get('content-type') || '';
      const valid = response.ok && contentType.toLowerCase().startsWith('image/');
      await response.body?.cancel();
      return valid;
    } catch {
      return false;
    }
  }
  return false;
}

async function findWikimediaImage(query: string, probe: (url: string) => Promise<boolean>) {
  const normalizedQuery = query.replace(/[^\p{L}\p{N}\s._-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!normalizedQuery) return '';
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `file:${normalizedQuery}`,
    gsrnamespace: '6',
    gsrlimit: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '1280',
    format: 'json',
    origin: '*',
  });
  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'VibecodingStudy/1.0 image-resolver' },
    });
    if (!response.ok) return '';
    const data: any = await response.json();
    const pages = Object.values(data?.query?.pages || {}) as any[];
    pages.sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0));
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      const candidate = String(info?.thumburl || info?.url || '');
      if (candidate && String(info?.mime || '').startsWith('image/') && await probe(candidate)) return candidate;
    }
  } catch {
    return '';
  }
  return '';
}

function getTagAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return match?.[1]?.trim() || '';
}

function setTagAttribute(tag: string, name: string, value: string) {
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const existing = new RegExp(`\\b${name}=["'][^"']*["']`, 'i');
  if (existing.test(tag)) return tag.replace(existing, `${name}="${escaped}"`);
  return tag.replace(/\s*\/?>$/, (ending) => ` ${name}="${escaped}"${ending}`);
}

export async function resolveBodyImageAssets(body: string) {
  const matches = [...body.matchAll(/<img\b[^>]*>/gi)];
  const probeCache = new Map<string, Promise<boolean>>();
  const searchCache = new Map<string, Promise<string>>();
  const probe = (url: string) => {
    if (!probeCache.has(url)) probeCache.set(url, probeRemoteImage(url));
    return probeCache.get(url)!;
  };
  const search = (query: string) => {
    if (!searchCache.has(query)) searchCache.set(query, findWikimediaImage(query, probe));
    return searchCache.get(query)!;
  };

  const report: ImageResolutionReport = { checked: matches.length, preserved: 0, replaced: 0, fallbacks: 0, invalidUrls: [] };
  const replacements = await Promise.all(matches.map(async (match) => {
    const originalTag = match[0];
    const originalSrc = getTagAttribute(originalTag, 'src');
    const query = getTagAttribute(originalTag, 'data-image-query')
      || getTagAttribute(originalTag, 'alt')
      || getTagAttribute(originalTag, 'title');
    const isEmbedded = originalSrc.startsWith('data:image/');
    const isValidRemote = /^https?:\/\//i.test(originalSrc) && await probe(originalSrc);
    if (isEmbedded || isValidRemote) {
      report.preserved += 1;
      return { index: match.index!, length: originalTag.length, value: originalTag };
    }

    if (/^https?:\/\//i.test(originalSrc)) report.invalidUrls.push(originalSrc);
    const resolved = await search(query);
    let nextTag = setTagAttribute(originalTag, 'src', resolved || FALLBACK_IMAGE_DATA_URI);
    nextTag = setTagAttribute(nextTag, 'data-image-status', resolved ? 'resolved' : 'fallback');
    if (resolved) report.replaced += 1;
    else report.fallbacks += 1;
    return { index: match.index!, length: originalTag.length, value: nextTag };
  }));

  let resolvedBody = body;
  replacements.sort((left, right) => right.index - left.index).forEach((replacement) => {
    resolvedBody = `${resolvedBody.slice(0, replacement.index)}${replacement.value}${resolvedBody.slice(replacement.index + replacement.length)}`;
  });
  report.invalidUrls = unique(report.invalidUrls);
  return { body: resolvedBody, report };
}

async function resolveCssImageAssets(css: string, report: ImageResolutionReport) {
  const matches = [...css.matchAll(/url\(\s*(["']?)(https?:\/\/[^"')]+)\1\s*\)/gi)];
  const cache = new Map<string, Promise<boolean>>();
  const replacements = await Promise.all(matches.map(async (match) => {
    const url = match[2];
    if (!cache.has(url)) cache.set(url, probeRemoteImage(url));
    const valid = await cache.get(url)!;
    report.checked += 1;
    if (valid) {
      report.preserved += 1;
      return { index: match.index!, length: match[0].length, value: match[0] };
    }
    report.invalidUrls.push(url);
    report.fallbacks += 1;
    return { index: match.index!, length: match[0].length, value: `url("${FALLBACK_IMAGE_DATA_URI}")` };
  }));
  let resolvedCss = css;
  replacements.sort((left, right) => right.index - left.index).forEach((replacement) => {
    resolvedCss = `${resolvedCss.slice(0, replacement.index)}${replacement.value}${resolvedCss.slice(replacement.index + replacement.length)}`;
  });
  report.invalidUrls = unique(report.invalidUrls);
  return resolvedCss;
}

function ideaList(ideas: AgentIdea[] = []) {
  if (!ideas.length) return 'No ranked participant ideas are available for this step.';
  return ideas
    .map((idea, index) => {
      const rank = idea.selection_rank || index + 1;
      const role = idea.selection_role || (rank === 1 ? 'core' : 'supporting');
      return `${rank}. ${role.toUpperCase()} ${idea.participant_code ? `by ${idea.participant_code}` : ''}: ${idea.content}`;
    })
    .join('\n');
}

function ensurePlayableFallbackScript(js: string) {
  return `${js}

if (!window.__vibecodingAgentReady) {
  window.__vibecodingAgentReady = true;
  document.addEventListener('DOMContentLoaded', () => {
    const agentFallbackImage = ${JSON.stringify(FALLBACK_IMAGE_DATA_URI)};
    document.querySelectorAll('img').forEach((image) => {
      const useFallback = () => {
        if (image.src !== agentFallbackImage) {
          image.src = agentFallbackImage;
          image.dataset.imageStatus = 'fallback';
        }
      };
      image.addEventListener('error', useFallback, { once: true });
      if (image.complete && image.naturalWidth === 0) useFallback();
    });
    document.querySelectorAll('[data-action="toast"]').forEach((button) => {
      button.addEventListener('click', () => {
        const message = button.getAttribute('data-message') || 'Interaction received.';
        const toast = document.getElementById('agentToast');
        if (toast) {
          toast.textContent = message;
          toast.classList.add('show');
          window.setTimeout(() => toast.classList.remove('show'), 1800);
        }
      });
    });
  });
}`.trim();
}

function buildHtml(input: DevelopmentAgentInput, summary: string, body: string, css: string, js: string) {
  const safeTitle = input.experimentTitle || 'Vibecoding Prototype';
  const safeBody = removePlatformOwnedAgentToast(body);
  return ensureStandalonePerformanceGuard(`<!doctype html>
<!-- SUMMARY: ${summary.replace(/-->/g, '--&gt;')} -->
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
${css}
  </style>
</head>
<body>
${safeBody}
  <div id="agentToast" class="agent-toast" aria-live="polite"></div>
  <script>
${ensurePlayableFallbackScript(js)}
  </script>
</body>
</html>`);
}

function validateAssembledHtml(
  code: string,
  inspection: ArtifactInspection,
  interactionInspection?: InteractionStyleInspection,
) {
  const scriptOpen = (code.match(/<script\b/gi) || []).length;
  const scriptClose = (code.match(/<\/script>/gi) || []).length;
  if (!/<\/body>/i.test(code) || !/<\/html>/i.test(code) || scriptOpen !== scriptClose) {
    throw new Error('The development agent assembled an incomplete HTML document.');
  }
  const markupForIdValidation = code
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const ids = [...markupForIdValidation.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicateIds = unique(ids.filter((id, index) => ids.indexOf(id) !== index));
  if (duplicateIds.length > 0) {
    throw new Error(`The development agent generated duplicate HTML ids: ${duplicateIds.slice(0, 12).join(', ')}.`);
  }
  const scripts = [...code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  try {
    for (const script of scripts) new Function(script);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`The development agent generated invalid JavaScript: ${message}`);
  }
  if (/cdn\.tailwindcss\.com|tailwind\.min\.css/i.test(code)) {
    throw new Error('The development agent output still depends on Tailwind instead of self-contained CSS.');
  }
  if (inspection.utilityClasses.length > 0) {
    throw new Error(`The development agent left unsupported utility classes: ${inspection.utilityClasses.slice(0, 12).join(', ')}.`);
  }
  if (inspection.coverage < 0.9 || inspection.missingClasses.length > 4) {
    throw new Error(`The development agent CSS covers only ${Math.round(inspection.coverage * 100)}% of HTML classes. Missing: ${inspection.missingClasses.slice(0, 12).join(', ')}.`);
  }
  if (interactionInspection && interactionInspection.missingStateClasses.length > 0) {
    throw new Error(`The development agent JavaScript applies unstyled state classes: ${interactionInspection.missingStateClasses.slice(0, 12).join(', ')}.`);
  }
}

async function runAgentTextStep(
  provider: AIProvider,
  title: string,
  prompt: string,
  maxTokens = 3072,
  signal?: AbortSignal,
  apiKey?: string,
) {
  signal?.throwIfAborted();
  addDebugLog({
    kind: 'ai',
    phase: 'info',
    title: `Agent step: ${title}`,
    detail: { provider, promptLength: prompt.length, maxTokens },
  });
  const timeoutMs = positiveTimeoutFromEnv(
    'AI_AGENT_STEP_TIMEOUT_MS',
    DEFAULT_AGENT_STEP_TIMEOUT_MS,
  );
  const result = await withAbortTimeout(
    timeoutMs,
    signal,
    `AI 当前生成步骤超过 ${timeoutMinutes(timeoutMs)} 分钟未响应，本轮开发失败，请重试。`,
    (stepSignal) => generateWithAI(provider, prompt, {
      systemPrompt: TEXT_ONLY_SYSTEM,
      maxTokens,
      signal: stepSignal,
      apiKey,
    }),
  );
  return result.text.trim();
}

async function runAgentCorrectionStep(
  input: DevelopmentAgentInput,
  plan: string,
  failureReason: string,
  body: string,
  css: string,
  js: string,
  attempt: number,
) {
  const response = await runAgentTextStep(
    input.provider,
    `automatic correction ${attempt}`,
    `You are correcting one failed artifact in a self-contained web prototype.

Creator request:
${input.creatorMessage || input.creatorPrompt || input.brief || 'Preserve the existing prototype and make only the required correction.'}

Implementation plan:
${truncate(plan, 5000)}

Blocking validation error:
${truncate(failureReason, 1800)}

Current BODY INNER HTML:
${truncate(body, 22000)}

Current CSS:
${truncate(css, 18000)}

Current JavaScript:
${truncate(js, 16000)}

Choose the single artifact responsible for the blocking error and replace only that artifact.
Preserve every requirement, existing feature, id, section, interaction, visual direction, and unrelated behavior.
Make the smallest correction that resolves the exact validation error.
The platform owns #agentToast, so BODY must never include an element with id="agentToast".
Do not use Tailwind, Bootstrap, external CSS frameworks, inline onclick handlers, or remote CSS imports.
JavaScript must parse as a classic browser script, bind safely, and keep continuous animation bounded to at most 30 FPS.

Return the full replacement for exactly one artifact in this format:
ARTIFACT: BODY
<complete body inner HTML only>

or:
ARTIFACT: CSS
<complete CSS only>

or:
ARTIFACT: JAVASCRIPT
<complete JavaScript only>

Do not return Markdown fences, explanations, multiple artifacts, or a full HTML document.`,
    6144,
    input.signal,
    input.apiKey,
  );
  return parseRepairArtifact(response);
}

async function runAgentIntegrationAudit(
  input: DevelopmentAgentInput,
  code: string,
  body: string,
  css: string,
  js: string,
  inspection: ArtifactInspection,
  interactionInspection: InteractionStyleInspection,
  imageReport: ImageResolutionReport,
) {
  return runAgentTextStep(
    input.provider,
    'final integration gate',
    `Act as the final integration gate for a self-contained web prototype.

Deterministic validation:
- HTML class coverage: ${Math.round(inspection.coverage * 100)}%
- Missing HTML classes: ${inspection.missingClasses.join(', ') || 'none'}
- Unsupported utility classes: ${inspection.utilityClasses.join(', ') || 'none'}
- Images checked: ${imageReport.checked}
- Valid images preserved: ${imageReport.preserved}
- Invalid images replaced through Wikimedia: ${imageReport.replaced}
- Embedded image fallbacks: ${imageReport.fallbacks}
- HTML length: ${code.length}
- CSS length: ${css.length}
- JavaScript length: ${js.length}
- JavaScript state-class coverage: ${Math.round(interactionInspection.coverage * 100)}%
- Unstyled JavaScript state classes: ${interactionInspection.missingStateClasses.join(', ') || 'none'}

HTML body excerpt:
${truncate(body, 6000)}

CSS excerpt:
${truncate(css, 6000)}

JavaScript excerpt:
${truncate(js, 3500)}

Check that the visible layout has styling, images cannot render as broken icons, and required controls have matching ids. If the supplied requirements include a game, also check that it has real event logic. If the JavaScript contains continuous animation, also check that it uses one bounded loop, targets no more than 30 FPS, pauses work while document.hidden, and does not grow particle/history collections without a cap.
Reply exactly "PASS: concise reason" when the prototype is safe to show, otherwise "FAIL: concrete blocking reason".`,
    2048,
    input.signal,
    input.apiKey,
  );
}

async function runDevelopmentAgentPipeline(input: DevelopmentAgentInput): Promise<DevelopmentAgentOutput> {
  const startedAt = performance.now();
  const progress = (event: DevelopmentAgentProgress) => {
    try {
      input.onProgress?.(event);
    } catch (error) {
      addDebugLog({
        kind: 'server',
        phase: 'error',
        title: 'Unable to save public development progress',
        detail: { error: error instanceof Error ? error.message : String(error), event },
      });
    }
  };
  const preservationPolicy = input.currentCode?.trim()
    ? `Mandatory preservation policy:
The current HTML is the canonical working App. Treat every new comment/request as a scoped change, not permission to redesign the App. Preserve all existing content, features, pages, navigation, interactions, copy, layout, data, images, and working behavior unless the supplied comment/request explicitly asks to change that exact element. Never remove, replace, rename, restyle, or simplify an unspecified element. If an extension comment is supplied with an original comment, implement their combined intent. Make the smallest additive change that satisfies them.`
    : '';
  const context = `Experiment: ${input.experimentTitle}
Round: ${input.roundNumber || 1}
Mode: ${input.mode}
Brief: ${input.brief || 'No brief provided.'}
Creator prompt or latest request: ${input.creatorMessage || input.creatorPrompt || 'No creator message.'}

Selected participant ideas:
${ideaList(input.selectedIdeas)}

Fusion plan:
${input.fusionPlan || 'No fusion plan yet.'}

Recent transparent development conversation:
${input.recentConversation || 'No previous development messages.'}

${preservationPolicy}

Current HTML excerpt:
${truncate(input.currentCode || '', 18000)}

Mandatory performance contract:
- Any continuous animation must target at most 30 FPS and use one bounded requestAnimationFrame loop rather than overlapping loops.
- Pause animation work while document.hidden is true and resume safely when visible again.
- Keep particle, trail, object, and history collections explicitly bounded; reuse objects instead of allocating large collections every frame.
- For Canvas/WebGL, cap rendering density to Math.min(window.devicePixelRatio || 1, 1.5) and resize only when dimensions change.
- Avoid expensive blur, shadow, backdrop-filter, layout reads, DOM creation, and event-listener registration inside animation frames.
- Preserve ordinary clicks, forms, keyboard controls, timers, and non-animation interactions.`;

  const repairNotes: string[] = [];
  progress({ step: 'plan', order: 1, status: 'running', title: 'AI 正在制定修改计划', detail: '正在理解抽中的评论，并确认哪些现有内容必须保留。' });
  const plan = await runAgentTextStep(
    input.provider,
    '1/4 implementation plan',
    `${context}

Create a compact implementation plan for a self-contained web prototype.
Plan only work required by the Creator request, selected ideas, approved fusion plan, or existing functionality.
Do not introduce product features, themes, copy, branding, games, controls, or interactions that were not supplied in those sources.
For an existing App, list only the explicitly requested scoped edits and identify the existing parts that must remain unchanged.
When details are underspecified, choose the smallest neutral implementation rather than inventing content or product claims.
If a mini-game is requested, define its exact state, controls, win condition, and DOM ids.
Only when the supplied requirements or existing HTML require real images, specify a concrete Wikimedia Commons search phrase and meaningful fallback text for each required image.
Do not plan Tailwind, Bootstrap, external CSS frameworks, or invented image URLs.
Use the same language as the Creator request and keep the plan under 900 characters.`,
    2048,
    input.signal,
    input.apiKey,
  );
  progress({ step: 'plan', order: 1, status: 'completed', title: '修改计划已经完成', detail: plan });

  progress({ step: 'structure', order: 2, status: 'running', title: 'AI 正在修改页面结构', detail: '正在按照计划生成完整页面结构，并保留未被评论要求修改的内容。' });
  let body = cleanBodyFragment(await runAgentTextStep(
    input.provider,
    '2/4 body structure',
    `${context}

Implementation plan:
${plan}

Generate BODY INNER HTML ONLY. No <!doctype>, no <html>, no <head>, no <body>, no <style>, no <script>.
Make it compact and complete.
For an existing App, retain every existing section, control, text, image, id, and behavior that the supplied request does not explicitly target.
If there is a mini-game, include the board, controls, score/status elements, and clear instructions.
Use a small set of descriptive semantic kebab-case classes.
Do not use Tailwind, Bootstrap, utility classes, responsive prefixes, or external CSS frameworks. Every class must be styled by the separate CSS step.
Do not create an element with id="agentToast"; the platform appends that shared status element automatically.
Only for images required by the supplied requirements or existing project, use <img src="" data-image-query="specific Wikimedia search phrase" alt="meaningful fallback text">. Do not add decorative images, invent remote URLs, or use remote CSS background-image URLs.
Use stable ids that JavaScript can bind and preserve during later repair. Avoid inline onclick handlers.
Keep the fragment under 260 lines.`,
    6144,
    input.signal,
    input.apiKey,
  ));
  body = removePlatformOwnedAgentToast(body);

  let structureInspection = inspectAgentArtifacts(body, '');
  if (structureInspection.utilityClasses.length > 0) {
    progress({ step: 'structure', order: 2, status: 'running', title: '正在修复页面结构', detail: `检查发现 ${structureInspection.utilityClasses.length} 个不受支持的样式类，AI 正在改写。` });
    body = cleanBodyFragment(await runAgentTextStep(
      input.provider,
      '2b/4 semantic HTML repair',
      `${context}

Implementation plan:
${plan}

HTML body that incorrectly uses utility classes:
${truncate(body, 14000)}

Rewrite the BODY INNER HTML ONLY.
Preserve all content, sections, form controls, image intent, and every id used for JavaScript.
Replace every Tailwind/Bootstrap/utility class with a small set of descriptive semantic kebab-case classes.
Do not include style or script tags. Do not invent image URLs; use empty src plus descriptive data-image-query and alt attributes.
Keep it compact and complete.`,
      6144,
      input.signal,
      input.apiKey,
    ));
    body = removePlatformOwnedAgentToast(body);
    repairNotes.push(`Agent rewrote HTML to remove ${structureInspection.utilityClasses.length} unsupported utility classes.`);
    structureInspection = inspectAgentArtifacts(body, '');
  }
  if (structureInspection.utilityClasses.length > 0) {
    repairNotes.push(
      `Semantic HTML repair still left unsupported utility classes for final automatic correction: ${structureInspection.utilityClasses.slice(0, 12).join(', ')}.`,
    );
  }
  progress({ step: 'structure', order: 2, status: 'completed', title: '页面结构已经完成', detail: `已生成完整页面结构，包含 ${structureInspection.usedClasses.length} 组界面样式标记。` });

  progress({ step: 'images', order: 3, status: 'running', title: '系统正在检查图片资源', detail: '正在保留有效图片，并为无法使用的图片寻找可公开访问的替代资源。' });
  input.signal?.throwIfAborted();
  const imageResolution = await resolveBodyImageAssets(body);
  input.signal?.throwIfAborted();
  body = imageResolution.body;
  let imageReport = imageResolution.report;
  addDebugLog({
    kind: 'ai',
    phase: 'info',
    title: 'Agent image validation complete',
    detail: imageReport,
  });
  progress({
    step: 'images',
    order: 3,
    status: 'completed',
    title: '图片资源检查完成',
    detail: `保留 ${imageReport.preserved} 张，替换 ${imageReport.replaced} 张，使用备用图 ${imageReport.fallbacks} 张。`,
  });

  progress({ step: 'styles', order: 4, status: 'running', title: 'AI 正在编写视觉样式', detail: '正在为页面结构生成完整 CSS，并延续当前 App 的视觉风格。' });
  let css = cleanCss(await runAgentTextStep(
    input.provider,
    '3/4 CSS',
    `${context}

Implementation plan:
${plan}

Body fragment:
${truncate(body, 16000)}

Generate CSS ONLY. No <style> tag.
Create complete self-contained CSS for this exact body. Define a visible rule for every class used in the HTML.
Preserve the existing visual system and styling of all elements not explicitly targeted by the new request.
Do not use Tailwind, Bootstrap, @import, external stylesheets, or remote background-image URLs.
Preserve any visual direction explicitly supplied by the Creator, selected ideas, fusion plan, or current HTML. If none is supplied, use restrained neutral styling only for readability, layout, usability, and responsive behavior.
Include .agent-toast and .agent-toast.show styles.
Keep continuous decorative animation lightweight. Do not animate large blur, filter, backdrop-filter, box-shadow, or layout-affecting properties across many elements.
Keep CSS under 320 lines.`,
    6144,
    input.signal,
    input.apiKey,
  ));

  let inspection = inspectAgentArtifacts(body, css);
  if (inspection.coverage < 0.9 || inspection.missingClasses.length > 4) {
    progress({ step: 'styles', order: 4, status: 'running', title: '正在补全遗漏的视觉样式', detail: `自动检查发现 ${inspection.missingClasses.length} 个界面样式尚未覆盖，AI 正在修复。` });
    css = cleanCss(await runAgentTextStep(
      input.provider,
      '3b/4 CSS coverage repair',
      `${context}

Body fragment:
${truncate(body, 16000)}

First CSS attempt:
${truncate(css, 10000)}

Deterministic validation found ${inspection.missingClasses.length} unstyled classes and ${Math.round(inspection.coverage * 100)}% coverage.
Missing classes: ${inspection.missingClasses.join(', ')}

Generate replacement CSS ONLY, with no style tag. Define every HTML class, preserve only the visual direction present in the supplied requirements or existing project, include required responsive states, and include .agent-toast plus .agent-toast.show. Do not use any external framework or remote background image, and do not introduce a new visual theme.`,
      6144,
      input.signal,
      input.apiKey,
    ));
    repairNotes.push(`Agent regenerated CSS after detecting ${inspection.missingClasses.length} unstyled HTML classes.`);
    inspection = inspectAgentArtifacts(body, css);
  }

  css = await resolveCssImageAssets(css, imageReport);
  inspection = inspectAgentArtifacts(body, css);
  progress({ step: 'styles', order: 4, status: 'completed', title: '视觉样式已经完成', detail: `页面样式覆盖率为 ${Math.round(inspection.coverage * 100)}%。` });

  progress({ step: 'logic', order: 5, status: 'running', title: 'AI 正在实现交互逻辑', detail: '正在编写按钮、表单、动画或小游戏所需的 JavaScript 行为。' });
  let js = cleanJs(await runAgentTextStep(
    input.provider,
    '4/4 JavaScript',
    `${context}

Implementation plan:
${plan}

Body fragment:
${truncate(body, 14000)}

Existing CSS:
${truncate(css, 10000)}

Generate JavaScript ONLY. No <script> tag.
Bind event listeners on DOMContentLoaded.
Preserve every existing behavior not explicitly targeted by the new request; do not silently drop prior interactions.
If a mini-game is requested, implement the actual playable mechanics, not just placeholders.
Define all functions needed by the controls, but avoid relying on inline onclick.
When adding, removing, toggling, replacing, or checking a CSS class at runtime, reuse the exact state class names already defined in Existing CSS. Never invent an is-* variant when CSS defines the unprefixed name, or vice versa.
Ensure selected, correct, wrong, active, disabled, revealed, and completed states receive visibly different styles through an exact JavaScript-to-CSS class match.
For continuous animation, use a single requestAnimationFrame loop with an explicit 1000 / 30 frame interval, skip work while document.hidden is true, cap Canvas pixel ratio at 1.5, bound all growing collections, and never register listeners or create large DOM/object collections inside each frame.
Keep JavaScript under 260 lines.`,
    6144,
    input.signal,
    input.apiKey,
  ));
  const interactionClassRepair = repairAgentInteractionClassNames(js, css);
  js = interactionClassRepair.js;
  if (interactionClassRepair.replacements.length > 0) {
    repairNotes.push(
      `Agent aligned JavaScript state classes with existing CSS: ${interactionClassRepair.replacements
        .map((replacement) => `${replacement.from} -> ${replacement.to}`)
        .join(', ')}.`,
    );
  }
  let interactionInspection = interactionClassRepair.inspection;
  if (interactionInspection.missingStateClasses.length > 0) {
    progress({
      step: 'logic',
      order: 5,
      status: 'running',
      title: '正在补全交互状态样式',
      detail: `检查发现 ${interactionInspection.missingStateClasses.length} 个 JavaScript 状态缺少可见样式，AI 正在修复。`,
    });
    css = cleanCss(await runAgentTextStep(
      input.provider,
      '4b/4 interaction state CSS repair',
      `${context}

Body fragment:
${truncate(body, 14000)}

Current CSS:
${truncate(css, 12000)}

Final JavaScript:
${truncate(js, 8000)}

Deterministic validation found JavaScript-applied state classes with no matching CSS:
${interactionInspection.missingStateClasses.join(', ')}

Generate replacement CSS ONLY, with no style tag.
Preserve the complete current visual design and every existing HTML class rule.
Add clearly visible styling for every missing JavaScript state class, using the exact class names from the JavaScript.
Selected, correct, wrong, active, disabled, revealed, and completed states must be visibly distinguishable where present.
Keep .agent-toast and .agent-toast.show. Do not use external frameworks, @import, or remote background images.`,
      6144,
      input.signal,
      input.apiKey,
    ));
    css = await resolveCssImageAssets(css, imageReport);
    inspection = inspectAgentArtifacts(body, css);
    interactionInspection = inspectAgentInteractionStyles(js, css);
    repairNotes.push('Agent regenerated CSS to cover JavaScript-applied interaction state classes.');
  }
  if (interactionInspection.missingStateClasses.length > 0) {
    repairNotes.push(
      `Interaction CSS repair still left state classes for final automatic correction: ${interactionInspection.missingStateClasses.slice(0, 12).join(', ')}.`,
    );
  }
  progress({
    step: 'logic',
    order: 5,
    status: 'completed',
    title: '交互逻辑已经完成',
    detail: `已生成 ${js.length} 个字符的交互逻辑，运行时状态样式覆盖率为 ${Math.round(interactionInspection.coverage * 100)}%。`,
  });

  progress({ step: 'summary', order: 6, status: 'running', title: 'AI 正在整理本次修改', detail: '正在生成面向所有参与者的版本说明。' });
  const summary = await runAgentTextStep(
    input.provider,
    'summary',
    `Summarize this implemented prototype in one concise public sentence.

Plan:
${plan}

Body length: ${body.length}
CSS length: ${css.length}
JS length: ${js.length}
Image assets: ${imageReport.preserved} preserved, ${imageReport.replaced} replaced from Wikimedia, ${imageReport.fallbacks} using embedded fallback.`,
    1024,
    input.signal,
    input.apiKey,
  );
  progress({ step: 'summary', order: 6, status: 'completed', title: '本次修改说明已经完成', detail: summary });

  progress({ step: 'validation', order: 7, status: 'running', title: '系统正在进行最终检查', detail: '正在检查页面、样式、图片与交互是否完整连接。' });
  const maxRepairAttempts = repairAttemptsFromEnv();
  let code = '';
  let integrationAudit = '';
  let lastFailureReason = '';
  let validationPassed = false;

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    body = removePlatformOwnedAgentToast(body);
    inspection = inspectAgentArtifacts(body, css);
    const classRepair = repairAgentInteractionClassNames(js, css);
    js = classRepair.js;
    if (classRepair.replacements.length > 0) {
      repairNotes.push(
        `Automatic validation aligned JavaScript state classes: ${classRepair.replacements
          .map((replacement) => `${replacement.from} -> ${replacement.to}`)
          .join(', ')}.`,
      );
    }
    interactionInspection = classRepair.inspection;
    code = buildHtml(input, summary, body, css, js);
    lastFailureReason = '';

    try {
      validateAssembledHtml(code, inspection, interactionInspection);
    } catch (error) {
      lastFailureReason = error instanceof Error ? error.message : String(error);
    }

    if (!lastFailureReason) {
      integrationAudit = await runAgentIntegrationAudit(
        input,
        code,
        body,
        css,
        js,
        inspection,
        interactionInspection,
        imageReport,
      );
      if (/^PASS\s*:/i.test(integrationAudit.trim())) {
        validationPassed = true;
        break;
      }
      lastFailureReason = `The integration gate rejected the draft: ${integrationAudit.slice(0, 700)}`;
    }

    if (attempt >= maxRepairAttempts) break;
    const repairNumber = attempt + 1;
    progress({
      step: 'validation',
      order: 7,
      status: 'warning',
      title: `最终检查发现问题，正在自动纠错（${repairNumber}/${maxRepairAttempts}）`,
      detail: lastFailureReason,
    });
    addDebugLog({
      kind: 'ai',
      phase: 'info',
      title: `Development agent automatic correction ${repairNumber}`,
      detail: { provider: input.provider, mode: input.mode, failure: lastFailureReason },
    });

    try {
      const correction = await runAgentCorrectionStep(
        input,
        plan,
        lastFailureReason,
        body,
        css,
        js,
        repairNumber,
      );
      if (correction.artifact === 'body') {
        body = removePlatformOwnedAgentToast(cleanBodyFragment(correction.content));
        const repairedImages = await resolveBodyImageAssets(body);
        body = repairedImages.body;
        imageReport = repairedImages.report;
      } else if (correction.artifact === 'css') {
        css = cleanCss(correction.content);
        css = await resolveCssImageAssets(css, imageReport);
      } else {
        js = cleanJs(correction.content);
      }
      repairNotes.push(
        `Agent automatic correction ${repairNumber}/${maxRepairAttempts} replaced ${correction.artifact} after: ${lastFailureReason}`,
      );
      progress({
        step: 'validation',
        order: 7,
        status: 'running',
        title: `自动纠错 ${repairNumber} 已完成，正在重新检查`,
        detail: `已修复 ${correction.artifact.toUpperCase()}，系统正在重新运行完整验证。`,
      });
    } catch (error) {
      const correctionError = error instanceof Error ? error.message : String(error);
      repairNotes.push(`Agent automatic correction ${repairNumber}/${maxRepairAttempts} could not be applied: ${correctionError}`);
      addDebugLog({
        kind: 'ai',
        phase: 'error',
        title: `Development agent automatic correction ${repairNumber} could not be applied`,
        detail: { failure: lastFailureReason, correctionError },
      });
    }
  }

  if (!validationPassed) {
    throw new Error(
      `AI 已自动纠错 ${maxRepairAttempts} 次，但作品仍未通过最终检查：${lastFailureReason.slice(0, 700)}`,
    );
  }
  progress({ step: 'validation', order: 7, status: 'completed', title: '最终检查已经通过', detail: integrationAudit.replace(/^PASS\s*:\s*/i, '') });

  addDebugLog({
    kind: 'ai',
    phase: 'response',
    title: 'Development agent assembled complete HTML',
    durationMs: Math.round(performance.now() - startedAt),
    detail: {
      provider: input.provider,
      mode: input.mode,
      planLength: plan.length,
      bodyLength: body.length,
      cssLength: css.length,
      jsLength: js.length,
      codeLength: code.length,
      classCoverage: inspection.coverage,
      missingClasses: inspection.missingClasses,
      utilityClasses: inspection.utilityClasses,
      interactionInspection,
      imageReport,
      integrationAudit,
    },
  });

  return {
    text: summary,
    code,
    model: `${input.provider}-agent`,
    usage: null,
    steps: [
      `Agent plan:\n${plan}`,
      ...repairNotes,
      `Agent validated image assets: ${imageReport.preserved} preserved, ${imageReport.replaced} replaced, ${imageReport.fallbacks} embedded fallbacks.`,
      `Agent generated body fragment (${body.length} chars), CSS (${css.length} chars), and JavaScript (${js.length} chars).`,
      `Agent CSS coverage check passed at ${Math.round(inspection.coverage * 100)}% with ${inspection.missingClasses.length} missing classes.`,
      `Agent integration gate: ${integrationAudit}`,
      `Agent assembled and validated a complete HTML document (${code.length} chars).`,
    ],
  };
}

export async function runDevelopmentAgent(input: DevelopmentAgentInput): Promise<DevelopmentAgentOutput> {
  const timeoutMs = positiveTimeoutFromEnv(
    'AI_AGENT_TOTAL_TIMEOUT_MS',
    DEFAULT_AGENT_TOTAL_TIMEOUT_MS,
  );
  return withAbortTimeout(
    timeoutMs,
    input.signal,
    `AI 整体开发超过 ${timeoutMinutes(timeoutMs)} 分钟仍未完成，本轮开发失败，请重试。`,
    (signal) => runDevelopmentAgentPipeline({ ...input, signal }),
  );
}
