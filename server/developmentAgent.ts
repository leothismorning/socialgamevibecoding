import { type AIProvider, type AIResult, generateWithAI } from './ai.js';
import { addDebugLog } from './debugLog.js';
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
  return `<!doctype html>
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
${body}
  <div id="agentToast" class="agent-toast" aria-live="polite"></div>
  <script>
${ensurePlayableFallbackScript(js)}
  </script>
</body>
</html>`;
}

function validateAssembledHtml(code: string, inspection: ArtifactInspection) {
  const scriptOpen = (code.match(/<script\b/gi) || []).length;
  const scriptClose = (code.match(/<\/script>/gi) || []).length;
  if (!/<\/body>/i.test(code) || !/<\/html>/i.test(code) || scriptOpen !== scriptClose) {
    throw new Error('The development agent assembled an incomplete HTML document.');
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
  const result = await generateWithAI(provider, prompt, {
    systemPrompt: TEXT_ONLY_SYSTEM,
    maxTokens,
    signal,
    apiKey,
  });
  return result.text.trim();
}

export async function runDevelopmentAgent(input: DevelopmentAgentInput): Promise<DevelopmentAgentOutput> {
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
${truncate(input.currentCode || '', 18000)}`;

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
Only for images required by the supplied requirements or existing project, use <img src="" data-image-query="specific Wikimedia search phrase" alt="meaningful fallback text">. Do not add decorative images, invent remote URLs, or use remote CSS background-image URLs.
Use stable ids that JavaScript can bind and preserve during later repair. Avoid inline onclick handlers.
Keep the fragment under 260 lines.`,
    6144,
    input.signal,
    input.apiKey,
  ));

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
    repairNotes.push(`Agent rewrote HTML to remove ${structureInspection.utilityClasses.length} unsupported utility classes.`);
    structureInspection = inspectAgentArtifacts(body, '');
  }
  if (structureInspection.utilityClasses.length > 0) {
    throw new Error(`The development agent kept unsupported utility classes after repair: ${structureInspection.utilityClasses.slice(0, 12).join(', ')}.`);
  }
  progress({ step: 'structure', order: 2, status: 'completed', title: '页面结构已经完成', detail: `已生成完整页面结构，包含 ${structureInspection.usedClasses.length} 组界面样式标记。` });

  progress({ step: 'images', order: 3, status: 'running', title: '系统正在检查图片资源', detail: '正在保留有效图片，并为无法使用的图片寻找可公开访问的替代资源。' });
  input.signal?.throwIfAborted();
  const imageResolution = await resolveBodyImageAssets(body);
  input.signal?.throwIfAborted();
  body = imageResolution.body;
  const imageReport = imageResolution.report;
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
  const js = cleanJs(await runAgentTextStep(
    input.provider,
    '4/4 JavaScript',
    `${context}

Implementation plan:
${plan}

Body fragment:
${truncate(body, 14000)}

Generate JavaScript ONLY. No <script> tag.
Bind event listeners on DOMContentLoaded.
Preserve every existing behavior not explicitly targeted by the new request; do not silently drop prior interactions.
If a mini-game is requested, implement the actual playable mechanics, not just placeholders.
Define all functions needed by the controls, but avoid relying on inline onclick.
Keep JavaScript under 260 lines.`,
    6144,
    input.signal,
    input.apiKey,
  ));
  progress({ step: 'logic', order: 5, status: 'completed', title: '交互逻辑已经完成', detail: `已生成 ${js.length} 个字符的交互逻辑。` });

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

  const code = buildHtml(input, summary, body, css, js);
  validateAssembledHtml(code, inspection);

  progress({ step: 'validation', order: 7, status: 'running', title: '系统正在进行最终检查', detail: '正在检查页面、样式、图片与交互是否完整连接。' });
  const integrationAudit = await runAgentTextStep(
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

HTML body excerpt:
${truncate(body, 6000)}

CSS excerpt:
${truncate(css, 6000)}

JavaScript excerpt:
${truncate(js, 3500)}

Check that the visible layout has styling, images cannot render as broken icons, and required controls have matching ids. If the supplied requirements include a game, also check that it has real event logic.
Reply exactly "PASS: concise reason" when the prototype is safe to show, otherwise "FAIL: concrete blocking reason".`,
    2048,
    input.signal,
    input.apiKey,
  );
  if (!/^PASS\s*:/i.test(integrationAudit.trim())) {
    throw new Error(`The development agent integration gate rejected the draft: ${integrationAudit.slice(0, 500)}`);
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
