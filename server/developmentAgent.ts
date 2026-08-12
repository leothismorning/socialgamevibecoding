import { type AIProvider, type AIResult, generateWithAI } from './ai.js';
import { isSuiXiangTransientUpstreamError } from './suixiang.js';
import { addDebugLog } from './debugLog.js';
import { ensureStandalonePerformanceGuard } from './previewPerformance.js';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { Script } from 'node:vm';

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

export type AgentPatchOperation = {
  type: 'replace' | 'insert_before' | 'insert_after';
  search: string;
  content: string;
  reason: string;
};

export type AgentPatchDraft = {
  summary: string;
  operations: AgentPatchOperation[];
  scope?: AgentModificationScope;
};

export type AgentModificationScope = {
  mode: 'additive' | 'targeted';
  targetIds: string[];
  removableIds: string[];
  targetFunctions: string[];
  targetAnchors: string[];
  rationale: string;
};

export type AgentAdditiveModuleDraft = {
  summary: string;
  html: string;
  css: string;
  javascript: string;
};

export class EmptyAgentPatchError extends Error {
  readonly draft: AgentPatchDraft;

  constructor(draft: AgentPatchDraft) {
    super('增量开发没有生成任何修改。');
    this.name = 'EmptyAgentPatchError';
    this.draft = draft;
  }
}

export type AgentPreservationInspection = {
  baselineIds: string[];
  candidateIds: string[];
  missingIds: string[];
  authorizedRemovedIds: string[];
  unexpectedMissingIds: string[];
  addedIds: string[];
  baselineControls: Record<string, number>;
  candidateControls: Record<string, number>;
  reducedControls: string[];
  authorizedControlReductions: Record<string, number>;
  baselineEventBindings: number;
  candidateEventBindings: number;
  authorizedEventReduction: number;
  retainedIdCoverage: number;
  lengthRatio: number;
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
      const matchIndex = match.index || 0;
      const before = source.slice(0, matchIndex).trimEnd();
      const after = source.slice(matchIndex + match[0].length).trimStart();
      const isConcatenatedFragment = before.endsWith('+') || after.startsWith('+');
      const isInterpolatedTemplate = match[1] === '`' && match[2].includes('${');
      if (isConcatenatedFragment || isInterpolatedTemplate) continue;
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

export function appendAgentCss(baseCss: string, additions: string) {
  return [baseCss.trim(), additions.trim()].filter(Boolean).join('\n\n');
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

type RepairArtifact = 'body' | 'css-append' | 'javascript';

function parseRepairArtifact(value: string): { artifact: RepairArtifact; content: string } {
  const text = stripFence(value);
  const match = text.match(/^ARTIFACT\s*:\s*(BODY|CSS_APPEND|JAVASCRIPT|JS)\s*\r?\n/i);
  if (!match) {
    throw new Error('The correction agent did not identify the artifact it repaired.');
  }
  const normalizedArtifact = match[1].toLowerCase();
  const artifact = normalizedArtifact === 'js'
    ? 'javascript'
    : normalizedArtifact === 'css_append'
      ? 'css-append'
      : normalizedArtifact as RepairArtifact;
  const content = stripFence(text.slice(match[0].length));
  if (!content) throw new Error(`The correction agent returned an empty ${artifact} artifact.`);
  return { artifact, content };
}

function truncate(value: string, max = 6000) {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max)}\n\n[truncated: ${value.length - max} characters omitted]`;
}

function extractJsonObject(value: string) {
  const text = stripFence(value);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('增量开发没有返回有效的 JSON 补丁。');
  return text.slice(start, end + 1);
}

function parseAgentModificationScope(value: any): AgentModificationScope | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const stringList = (candidate: unknown, max: number) => unique(
    (Array.isArray(candidate) ? candidate : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ).slice(0, max);
  const mode = value.mode === 'targeted' ? 'targeted' : 'additive';
  return {
    mode,
    targetIds: stringList(value.target_ids ?? value.targetIds, 12),
    removableIds: stringList(value.removable_ids ?? value.removableIds, 12),
    targetFunctions: stringList(value.target_functions ?? value.targetFunctions, 12),
    targetAnchors: stringList(value.target_anchors ?? value.targetAnchors, 8),
    rationale: String(value.rationale || '').trim(),
  };
}

export function parseAgentPatchDraft(value: string): AgentPatchDraft {
  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonObject(value));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`增量开发返回的补丁无法解析：${message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.operations)) {
    throw new Error('增量开发补丁缺少 operations 数组。');
  }
  const scope = parseAgentModificationScope(parsed.scope);
  if (parsed.operations.length === 0) {
    throw new EmptyAgentPatchError({
      summary: String(parsed.summary || '').trim() || '增量开发没有生成任何修改。',
      operations: [],
      scope,
    });
  }
  if (parsed.operations.length > 24) {
    throw new Error('增量开发一次返回了过多修改，已停止以避免整页重写。');
  }
  const operations = parsed.operations.map((operation: any, index: number): AgentPatchOperation => {
    const type = String(operation?.type || '') as AgentPatchOperation['type'];
    const search = String(operation?.search || '');
    const content = String(operation?.content ?? '');
    const reason = String(operation?.reason || '').trim();
    if (!['replace', 'insert_before', 'insert_after'].includes(type)) {
      throw new Error(`第 ${index + 1} 个增量修改使用了不支持的类型。`);
    }
    if (!search.trim()) throw new Error(`第 ${index + 1} 个增量修改缺少精确查找内容。`);
    if (type === 'replace' && !content.trim()) {
      throw new Error(`第 ${index + 1} 个增量修改试图删除原有内容，已停止以保护旧功能。`);
    }
    return { type, search, content, reason };
  });
  return {
    summary: String(parsed.summary || '').trim() || '已按照入选评论增量更新应用。',
    operations,
    ...(scope ? { scope } : {}),
  };
}

export function parseAgentAdditiveModule(value: string): AgentAdditiveModuleDraft {
  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonObject(value));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`安全增量模块无法解析：${message}`);
  }
  const html = removePlatformOwnedAgentToast(cleanBodyFragment(String(parsed?.html || '')));
  const css = cleanCss(String(parsed?.css || ''));
  const javascript = cleanJs(String(parsed?.javascript || parsed?.js || ''));
  if (!html) throw new Error('安全增量模块没有生成可见界面。');
  if (!css) throw new Error('安全增量模块没有生成界面样式。');
  const firstTag = html.match(/^\s*(?:<!--[\s\S]*?-->\s*)*<([a-z][\w:-]*)\b[^>]*>/i)?.[0] || '';
  const rootId = getTagAttribute(firstTag, 'id');
  if (!rootId.startsWith('community-evolution-')) {
    throw new Error('安全增量模块缺少 community-evolution- 前缀的根节点 id。');
  }
  const moduleIds = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const moduleClasses = extractHtmlClasses(html);
  const unsafeNames = [...moduleIds, ...moduleClasses]
    .filter((value) => !value.startsWith('community-evolution-'));
  if (unsafeNames.length > 0) {
    throw new Error(`安全增量模块包含未隔离的 id 或 class：${unique(unsafeNames).slice(0, 12).join(', ')}。`);
  }
  if (/<\/?(?:html|head|body)\b/i.test(html)) {
    throw new Error('安全增量模块包含完整页面标签，已拒绝以避免重写原作品。');
  }
  if (/@import\b|cdn\.tailwindcss\.com|tailwind\.min\.css/i.test(css)) {
    throw new Error('安全增量模块使用了不受支持的外部样式。');
  }
  if (/<\/?(?:style|script)\b/i.test(html) || /<\/?script\b/i.test(javascript)) {
    throw new Error('安全增量模块的 HTML、CSS、JavaScript 没有正确分离。');
  }
  if (/\son[a-z]+\s*=/i.test(html)) {
    throw new Error('安全增量模块使用了内联事件，已拒绝以避免不可控交互。');
  }
  if (/(?:^|})\s*(?:html|body|:root|\*)\s*(?:,|\{)/im.test(css)) {
    throw new Error('安全增量模块试图修改全局页面样式。');
  }
  return {
    summary: String(parsed?.summary || '').trim() || '已通过安全增量模块实现入选创意。',
    html,
    css,
    javascript,
  };
}

export function applyAgentAdditiveModule(baseCode: string, module: AgentAdditiveModuleDraft) {
  if (!baseCode.trim()) throw new Error('安全增量模块缺少上一已发布版本。');
  const closingBodies = [...baseCode.matchAll(/<\/body\s*>/gi)];
  const closingBody = closingBodies.at(-1);
  if (!closingBody || closingBody.index == null) {
    throw new Error('上一已发布版本缺少 </body>，无法安全插入增量模块。');
  }
  const moduleMarkup = `
<!-- VIBECODING_INCREMENTAL_MODULE_START -->
${module.html}
<style data-vibecoding-incremental-module>
${module.css}
</style>
${module.javascript ? `<script data-vibecoding-incremental-module>
${module.javascript}
</script>` : ''}
<!-- VIBECODING_INCREMENTAL_MODULE_END -->
`;
  const code = `${baseCode.slice(0, closingBody.index)}${moduleMarkup}${baseCode.slice(closingBody.index)}`;
  return ensureStandalonePerformanceGuard(code);
}

function additiveModuleAsPatch(module: AgentAdditiveModuleDraft): AgentPatchDraft {
  return {
    summary: module.summary,
    scope: {
      mode: 'additive',
      targetIds: [],
      removableIds: [],
      targetFunctions: [],
      targetAnchors: [],
      rationale: '独立增加新模块，不修改上一版本。',
    },
    operations: [{
      type: 'insert_before',
      search: '</body>',
      content: [
        module.html,
        `<style data-vibecoding-incremental-module>\n${module.css}\n</style>`,
        module.javascript
          ? `<script data-vibecoding-incremental-module>\n${module.javascript}\n</script>`
          : '',
      ].filter(Boolean).join('\n'),
      reason: '精确补丁为空后，将入选创意作为独立增量模块安全加入上一版本。',
    }],
  };
}

export function applyAgentPatch(baseCode: string, draft: AgentPatchDraft) {
  if (!baseCode.trim()) throw new Error('增量开发缺少上一已发布版本。');
  const scope = validateAgentModificationScope(baseCode, draft.scope);
  let code = baseCode;
  let totalSearchLength = 0;
  draft.operations.forEach((operation, index) => {
    const authorizedTargetChange = isAgentPatchOperationAuthorized(operation, scope);
    totalSearchLength += operation.search.length;
    if (operation.search.length > (authorizedTargetChange ? 12_000 : 6000)) {
      throw new Error(`第 ${index + 1} 个增量修改范围过大，已停止以避免重写原有功能。`);
    }
    if (operation.type === 'replace' && scope?.mode === 'additive') {
      throw new Error(`第 ${index + 1} 个修改声明为新增模式，却试图替换旧代码。`);
    }
    if (operation.type === 'replace' && scope?.mode === 'targeted' && !authorizedTargetChange) {
      throw new Error(`第 ${index + 1} 个修改不在已授权的目标区域内。`);
    }
    if (
      operation.type === 'replace'
      && !authorizedTargetChange
      && operation.search.length >= 200
      && operation.content.length < operation.search.length * 0.75
    ) {
      throw new Error(`第 ${index + 1} 个增量修改删除了过多旧代码，已停止以保护原有功能。`);
    }
    const occurrences = code.split(operation.search).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `第 ${index + 1} 个增量修改无法安全应用：精确目标出现 ${occurrences} 次（必须恰好 1 次）。`,
      );
    }
    const replacement = operation.type === 'replace'
      ? operation.content
      : operation.type === 'insert_before'
        ? `${operation.content}${operation.search}`
        : `${operation.search}${operation.content}`;
    code = code.replace(operation.search, () => replacement);
  });
  const maximumTouchedCode = scope?.mode === 'targeted'
    ? Math.max(16_000, baseCode.length * 0.65)
    : Math.max(8000, baseCode.length * 0.4);
  if (totalSearchLength > maximumTouchedCode) {
    throw new Error('本次增量修改触及的旧代码过多，已停止以避免整页重写。');
  }
  if (code === baseCode) throw new Error('增量开发没有改变上一版本。');
  return ensureStandalonePerformanceGuard(code);
}

function markupWithoutCode(code: string) {
  return code
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

function extractDocumentIds(code: string) {
  return unique(
    [...markupWithoutCode(code).matchAll(/\bid=["']([^"']+)["']/gi)]
      .map((match) => match[1])
      .filter((id) => id !== 'agentToast'),
  );
}

export function validateAgentModificationScope(
  baseCode: string,
  scope?: AgentModificationScope,
) {
  if (!scope) return undefined;
  const baselineIds = new Set(extractDocumentIds(baseCode));
  const missingTargetIds = scope.targetIds.filter((id) => !baselineIds.has(id));
  if (missingTargetIds.length > 0) {
    throw new Error(`授权修改范围引用了不存在的旧组件：${missingTargetIds.join(', ')}。`);
  }
  const invalidRemovals = scope.removableIds.filter(
    (id) => !baselineIds.has(id) || !scope.targetIds.includes(id),
  );
  if (invalidRemovals.length > 0) {
    throw new Error(`允许删除的组件没有包含在授权目标中：${invalidRemovals.join(', ')}。`);
  }
  const missingFunctions = scope.targetFunctions.filter((name) => !baseCode.includes(name));
  if (missingFunctions.length > 0) {
    throw new Error(`授权修改范围引用了不存在的旧函数：${missingFunctions.join(', ')}。`);
  }
  scope.targetAnchors.forEach((anchor, index) => {
    if (anchor.length < 20 || anchor.length > 1200) {
      throw new Error(`第 ${index + 1} 个授权代码锚点长度无效。`);
    }
    const occurrences = baseCode.split(anchor).length - 1;
    if (occurrences !== 1) {
      throw new Error(`第 ${index + 1} 个授权代码锚点出现 ${occurrences} 次，无法唯一定位。`);
    }
  });
  if (
    scope.mode === 'targeted'
    && scope.targetIds.length === 0
    && scope.targetFunctions.length === 0
    && scope.targetAnchors.length === 0
  ) {
    throw new Error('目标修改模式没有声明任何可修改区域。');
  }
  return scope;
}

function isAgentPatchOperationAuthorized(
  operation: AgentPatchOperation,
  scope?: AgentModificationScope,
) {
  if (operation.type !== 'replace' || scope?.mode !== 'targeted') return false;
  const search = operation.search;
  const targetsId = scope.targetIds.some((id) => (
    new RegExp(`\\bid=["']${escapeRegExp(id)}["']`, 'i').test(search)
    || search.includes(`getElementById('${id}')`)
    || search.includes(`getElementById("${id}")`)
    || search.includes(`#${id}`)
  ));
  const targetsFunction = scope.targetFunctions.some((name) => search.includes(name));
  const targetsAnchor = scope.targetAnchors.some((anchor) => search.includes(anchor));
  return targetsId || targetsFunction || targetsAnchor;
}

function countTag(code: string, tagName: string) {
  return (markupWithoutCode(code).match(new RegExp(`<${tagName}\\b`, 'gi')) || []).length;
}

function countEventBindings(code: string) {
  return (code.match(/\.addEventListener\s*\(/g) || []).length
    + (code.match(/\bon[a-z]+\s*=/gi) || []).length;
}

export function inspectAgentPreservation(
  baseCode: string,
  candidateCode: string,
  draft?: AgentPatchDraft,
): AgentPreservationInspection {
  const baselineIds = extractDocumentIds(baseCode);
  const candidateIds = extractDocumentIds(candidateCode);
  const candidateIdSet = new Set(candidateIds);
  const baselineIdSet = new Set(baselineIds);
  const missingIds = baselineIds.filter((id) => !candidateIdSet.has(id));
  const scope = validateAgentModificationScope(baseCode, draft?.scope);
  const authorizedReplacements = (draft?.operations || []).filter(
    (operation) => isAgentPatchOperationAuthorized(operation, scope),
  );
  const authorizedRemovedIds = missingIds.filter((id) => (
    Boolean(scope?.removableIds.includes(id))
    && authorizedReplacements.some((operation) => operation.search.includes(id))
  ));
  const unexpectedMissingIds = missingIds.filter((id) => !authorizedRemovedIds.includes(id));
  const addedIds = candidateIds.filter((id) => !baselineIdSet.has(id));
  const baselineControls: Record<string, number> = {};
  const candidateControls: Record<string, number> = {};
  const authorizedControlReductions: Record<string, number> = {};
  const reducedControls: string[] = [];
  ['button', 'input', 'select', 'textarea', 'form', 'canvas', 'nav'].forEach((tagName) => {
    baselineControls[tagName] = countTag(baseCode, tagName);
    candidateControls[tagName] = countTag(candidateCode, tagName);
    authorizedControlReductions[tagName] = authorizedReplacements.reduce(
      (total, operation) => total + Math.max(0, countTag(operation.search, tagName) - countTag(operation.content, tagName)),
      0,
    );
    if (candidateControls[tagName] < baselineControls[tagName] - authorizedControlReductions[tagName]) {
      reducedControls.push(tagName);
    }
  });
  const authorizedEventReduction = authorizedReplacements.reduce(
    (total, operation) => total + Math.max(
      0,
      countEventBindings(operation.search) - countEventBindings(operation.content),
    ),
    0,
  );
  return {
    baselineIds,
    candidateIds,
    missingIds,
    authorizedRemovedIds,
    unexpectedMissingIds,
    addedIds,
    baselineControls,
    candidateControls,
    reducedControls,
    authorizedControlReductions,
    baselineEventBindings: countEventBindings(baseCode),
    candidateEventBindings: countEventBindings(candidateCode),
    authorizedEventReduction,
    retainedIdCoverage: baselineIds.length === 0
      ? 1
      : (baselineIds.length - missingIds.length) / baselineIds.length,
    lengthRatio: baseCode.length === 0 ? 1 : candidateCode.length / baseCode.length,
  };
}

export function validateAgentPreservation(
  baseCode: string,
  candidateCode: string,
  draft?: AgentPatchDraft,
) {
  const inspection = inspectAgentPreservation(baseCode, candidateCode, draft);
  if (inspection.unexpectedMissingIds.length > 0) {
    throw new Error(
      `旧功能保留检查失败：以下非目标组件消失了：${inspection.unexpectedMissingIds.slice(0, 12).join(', ')}。`,
    );
  }
  if (inspection.reducedControls.length > 0) {
    throw new Error(
      `旧功能保留检查失败：以下交互组件数量减少：${inspection.reducedControls.join(', ')}。`,
    );
  }
  if (
    inspection.candidateEventBindings
    < inspection.baselineEventBindings - inspection.authorizedEventReduction
  ) {
    throw new Error(
      `旧功能保留检查失败：事件绑定从 ${inspection.baselineEventBindings} 个减少到 ${inspection.candidateEventBindings} 个。`,
    );
  }
  const minimumLengthRatio = draft?.scope?.mode === 'targeted' ? 0.75 : 0.9;
  if (inspection.lengthRatio < minimumLengthRatio) {
    throw new Error(
      `旧功能保留检查失败：候选版本仅为上一版本的 ${Math.round(inspection.lengthRatio * 100)}%，疑似发生整页删减。`,
    );
  }
  return inspection;
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
  for (const [index, script] of scripts.entries()) {
    try {
      new Script(script, { filename: `generated-script-${index + 1}.js` });
    } catch (error) {
      const detail = error instanceof Error ? error.stack || error.message : String(error);
      throw new Error(
        `The development agent generated invalid JavaScript in script ${index + 1}: ${detail.slice(0, 1600)}`,
      );
    }
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

function inspectCompleteHtml(code: string) {
  const body = code.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
  const bodyWithoutCode = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const css = [...code.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join('\n');
  const js = [...code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join('\n');
  const artifactInspection = inspectAgentArtifacts(bodyWithoutCode, css);
  const interactionInspection = inspectAgentInteractionStyles(js, css);
  return { body: bodyWithoutCode, css, js, artifactInspection, interactionInspection };
}

export function validateCompleteAgentHtml(code: string) {
  const inspection = inspectCompleteHtml(code);
  validateAssembledHtml(code, inspection.artifactInspection, inspection.interactionInspection);
  return inspection;
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

Choose the single artifact responsible for the blocking error and repair only that artifact.
Preserve every requirement, existing feature, id, section, interaction, visual direction, and unrelated behavior.
Make the smallest correction that resolves the exact validation error.
Visual quality is part of correctness: preserve the existing composition, color palette, typography, spacing, depth, decorative detail, and theme. Never simplify, flatten, neutralize, or redesign an unaffected area.
The platform owns #agentToast, so BODY must never include an element with id="agentToast".
Do not use Tailwind, Bootstrap, external CSS frameworks, inline onclick handlers, or remote CSS imports.
JavaScript must parse as a classic browser script, bind safely, and keep continuous animation bounded to at most 30 FPS.

Return the full replacement for exactly one artifact in this format:
ARTIFACT: BODY
<complete body inner HTML only>

or:
ARTIFACT: CSS_APPEND
<only the new or overriding CSS rules needed to fix the error>

or:
ARTIFACT: JAVASCRIPT
<complete JavaScript only>

For CSS_APPEND, do not repeat, replace, normalize, or omit the existing stylesheet. Return only narrowly scoped additions or overrides; they will be appended to the intact current CSS.
For BODY or JAVASCRIPT, return the complete artifact and copy every unaffected part without simplification.
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

Check that the visible layout has complete styling, clear hierarchy, readable contrast, intentional spacing, coherent typography and color, and a distinctive visual direction appropriate to the Creator's concept. Reject generic unstyled layouts, repetitive default card grids, accidental visual flattening, or a loss of the existing App's design language.
Rich static visual detail is compatible with the performance contract and must not be rejected merely for using gradients, textures, layered backgrounds, borders, moderate shadows, or localized glow.
Images cannot render as broken icons, and required controls must have matching ids. If the supplied requirements include a game, also check that it has real event logic. If the JavaScript contains continuous animation, also check that it uses one bounded loop, targets no more than 30 FPS, pauses work while document.hidden, and does not grow particle/history collections without a cap.
Reply exactly "PASS: concise reason" when the prototype is safe to show, otherwise "FAIL: concrete blocking reason".`,
    2048,
    input.signal,
    input.apiKey,
  );
}

async function runAgentPatchAudit(
  input: DevelopmentAgentInput,
  plan: string,
  draft: AgentPatchDraft,
  preservation: AgentPreservationInspection,
) {
  return runAgentTextStep(
    input.provider,
    'incremental change gate',
    `Act as a strict integration gate for an incremental change to an existing web App.

Requested change:
${input.creatorMessage || input.creatorPrompt || input.brief || 'No change request supplied.'}

Selected participant ideas:
${ideaList(input.selectedIdeas)}

Approved implementation plan:
${plan}

Exact patch operations (complete, not excerpts):
${JSON.stringify(draft, null, 2)}

Deterministic preservation results:
- Existing ids retained: ${preservation.baselineIds.length - preservation.missingIds.length}/${preservation.baselineIds.length}
- Explicitly authorized removed ids: ${preservation.authorizedRemovedIds.join(', ') || 'none'}
- Unexpected missing existing ids: ${preservation.unexpectedMissingIds.join(', ') || 'none'}
- Added ids: ${preservation.addedIds.join(', ') || 'none'}
- Reduced control types: ${preservation.reducedControls.join(', ') || 'none'}
- Event bindings: ${preservation.baselineEventBindings} -> ${preservation.candidateEventBindings}
- Candidate/base size: ${Math.round(preservation.lengthRatio * 100)}%

Judge only these blocking questions:
1. Do the actual HTML/CSS/JavaScript changes implement the requested idea, rather than merely mentioning it in text?
2. If the idea needs interaction, do the patch operations include the required interface, visible states, and executable event logic?
3. Are the changes scoped and additive, without redesigning or replacing unrelated existing functionality?
   Targeted replacement or removal inside the declared scope is allowed and should not be rejected merely because it changes old code.
4. Do all newly referenced ids and JavaScript-applied state classes have matching HTML/CSS in the operations or clearly target preserved existing elements?

Reply exactly "PASS: concise reason" when the patch is safe to preview. Otherwise reply "FAIL: concrete blocking reason".`,
    2048,
    input.signal,
    input.apiKey,
  );
}

async function runAgentAdditiveModuleFallback(
  input: DevelopmentAgentInput,
  plan: string,
  baseCode: string,
  emptyPatchResponse: string,
  previousFailure = '',
) {
  return runAgentTextStep(
    input.provider,
    'safe additive module fallback',
    `The exact patch generator returned no operations. Implement the requested idea as one independent additive module instead.

Requested change:
${input.creatorMessage || input.creatorPrompt || input.brief || 'No change request supplied.'}

Selected participant ideas:
${ideaList(input.selectedIdeas)}

Fusion plan:
${input.fusionPlan || 'No fusion plan supplied.'}

Approved implementation plan:
${plan}

Empty patch response:
${emptyPatchResponse || '{"operations":[]}'}

${previousFailure ? `A previous attempt was rejected for this reason. The new module must correct it:\n${previousFailure}\n` : ''}

Complete canonical HTML for visual and behavioral context (nothing is omitted):
${baseCode}

The platform will insert your module immediately before the canonical document's closing </body>. It will not replace any old code.
The text artifact inside the required outer response must contain one JSON object with this exact schema:
{
  "summary": "one concise public sentence describing the actual implementation",
  "html": "visible BODY INNER HTML for the new module only",
  "css": "complete scoped CSS for the new module only",
  "javascript": "JavaScript for the new module only, or an empty string when no interaction is required"
}

Mandatory requirements:
- The module must visibly and concretely implement the requested idea. Returning empty HTML/CSS or only explanatory text is forbidden.
- Match the canonical App's language, palette, typography, spacing, and visual style.
- Use one unique root id prefixed with "community-evolution-" and prefix every new id and class with "community-evolution-".
- Scope every CSS selector under the unique root id except keyframes. Do not restyle body, html, *, :root, or any existing selector.
- Do not modify, hide, remove, rename, query, clone, or replace existing elements. The old App remains untouched.
- If the idea needs interaction, include visible controls, distinct CSS states, and complete event logic bound only inside the new root.
- Do not use full-page tags, style/script tags inside fields, inline event handlers, Tailwind, external frameworks, @import, remote scripts, or placeholder-only controls.
- JavaScript must parse as a classic browser script. Bind after DOMContentLoaded or safely detect the current ready state.
- Put only the serialized module JSON in the outer response's text field, keep the outer code field empty, and return no Markdown fences or explanation.`,
    8192,
    input.signal,
    input.apiKey,
  );
}

async function runIncrementalDevelopmentAgentPipeline(
  input: DevelopmentAgentInput,
): Promise<DevelopmentAgentOutput> {
  const startedAt = performance.now();
  const baseCode = input.currentCode?.trim() || '';
  if (!baseCode) throw new Error('社区开发缺少上一已发布版本，已停止生成以避免覆盖原作品。');
  const progress = (event: DevelopmentAgentProgress) => {
    try {
      input.onProgress?.(event);
    } catch (error) {
      addDebugLog({
        kind: 'server',
        phase: 'error',
        title: 'Unable to save public incremental-development progress',
        detail: { error: error instanceof Error ? error.message : String(error), event },
      });
    }
  };
  const requestedChange = input.creatorMessage || input.creatorPrompt || input.brief || '';

  progress({
    step: 'plan',
    order: 1,
    status: 'running',
    title: 'AI 正在制定增量修改计划',
    detail: '正在读取完整的上一版本，并定位入选评论需要改动的位置。',
  });
  const plan = await runAgentTextStep(
    input.provider,
    'incremental implementation plan',
    `Create a compact, implementation-ready plan for adding one selected idea to an existing self-contained HTML App.

Requested change:
${requestedChange}

Selected participant ideas:
${ideaList(input.selectedIdeas)}

Fusion plan:
${input.fusionPlan || 'No fusion plan supplied.'}

Complete canonical HTML (nothing is omitted):
${baseCode}

The existing document is protected outside the parts explicitly involved in the request. When the idea changes an existing feature, interaction, layout region, or visual component, identify the exact existing ids, functions, CSS rules, or unique code anchors that must be authorized for meaningful modification. Within those targets, plan a complete integrated improvement rather than attaching a disconnected card. Preserve every unrelated section, id, control, event, function, style, text, image, navigation path, and behavior. Do not rewrite the page, body, head, whole stylesheet, or whole main script. Do not touch platform performance-guard code or #agentToast. Use the Creator's language and keep the plan under 900 characters.`,
    2048,
    input.signal,
    input.apiKey,
  );
  progress({ step: 'plan', order: 1, status: 'completed', title: '增量修改计划已经完成', detail: plan });

  const maxRepairAttempts = repairAttemptsFromEnv();
  const attemptFailures: string[] = [];
  let previousRejectedArtifact = '';
  let candidateCode = '';
  let patchDraft: AgentPatchDraft | null = null;
  let preservation: AgentPreservationInspection | null = null;
  let audit = '';
  let usedAdditiveFallback = false;

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    const attemptNumber = attempt + 1;
    let patchResponse = '';
    let fallbackResponse = '';
    patchDraft = null;
    candidateCode = '';
    preservation = null;
    audit = '';
    usedAdditiveFallback = false;
    progress({
      step: 'structure',
      order: 2,
      status: 'running',
      title: attempt === 0 ? 'AI 正在生成精确修改补丁' : `AI 正在重新生成安全补丁（${attemptNumber}/${maxRepairAttempts + 1}）`,
      detail: '每个修改必须精确命中上一版本；未命中的内容会保持原样。',
    });

    try {
      patchResponse = await runAgentTextStep(
        input.provider,
        `incremental patch attempt ${attemptNumber}`,
        `Produce exact, minimal patch operations for the canonical HTML below.

Requested change:
${requestedChange}

Selected participant ideas:
${ideaList(input.selectedIdeas)}

Fusion plan:
${input.fusionPlan || 'No fusion plan supplied.'}

Implementation plan:
${plan}

${attemptFailures.length ? `The previous patch was rejected. Correct this exact problem while starting again from the untouched canonical HTML:
${attemptFailures.at(-1)}

Complete previous rejected patch artifact:
${previousRejectedArtifact || 'The previous response could not be recovered.'}

Return a corrected patch. Do not repeat the invalid JavaScript or any other rejected operation.
` : ''}
Complete canonical HTML (nothing is omitted):
${baseCode}

The text artifact inside the required outer response must contain one JSON object with this exact schema:
{
  "summary": "one concise public sentence describing the implemented change",
  "scope": {
    "mode": "additive | targeted",
    "target_ids": ["existing DOM ids that may be changed"],
    "removable_ids": ["target ids the request explicitly requires removing"],
    "target_functions": ["exact existing function names or unique function signatures"],
    "target_anchors": ["20-1200 character exact unique substrings from existing HTML/CSS/JS"],
    "rationale": "why these targets are necessary and why other code is unrelated"
  },
  "operations": [
    {
      "type": "replace | insert_before | insert_after",
      "search": "an exact, unique, verbatim substring copied from the canonical HTML",
      "content": "the complete replacement or insertion",
      "reason": "why this edit is required"
    }
  ]
}

Safety contract:
- Implement the selected idea completely and integrate it into the existing experience. Do not reduce a substantive request to a disconnected card, note, badge, or cosmetic text change.
- Use mode "targeted" whenever the request changes an existing feature, interaction, game mechanic, layout region, or visual component. Use "additive" only for a genuinely independent new feature.
- In targeted mode, replacements and explicit removals are allowed inside the declared scope. Every replace operation must contain a declared target id, function, or exact target anchor.
- target_ids and target_functions must already exist in the canonical HTML. removable_ids must be a subset of target_ids and may include only elements the request clearly requires removing or replacing.
- target_anchors must be exact, unique, verbatim canonical substrings. Use them to authorize CSS rules, anonymous event logic, or markup without a useful id.
- Outside the declared scope, preserve all existing ids, controls, functions, listeners, content, navigation, images, styles, and behaviors byte-for-byte.
- Do not return a full HTML document, whole body, whole head, whole stylesheet, or whole main script.
- Every search string must occur exactly once in the canonical HTML and should contain enough neighboring text to be unique.
- Preserve a target id when practical so existing references remain valid. If the target is explicitly replaced, list its id in removable_ids and implement a working replacement.
- Do not touch scripts marked data-vibecoding-performance-guard, #agentToast, or the existing fallback machinery.
- New controls must have working JavaScript. New runtime classes must have visibly distinct CSS. Use unique prefixed ids/classes to avoid collisions.
- Do not use Tailwind, external frameworks, inline onclick, @import, or placeholder-only behavior.
- Escape the patch JSON correctly. Put only that serialized patch JSON in the outer response's text field, keep the outer code field empty, and do not add Markdown fences or explanation.`,
        8192,
        input.signal,
        input.apiKey,
      );
      try {
        patchDraft = parseAgentPatchDraft(patchResponse);
        candidateCode = applyAgentPatch(baseCode, patchDraft);
      } catch (error) {
        if (!(error instanceof EmptyAgentPatchError)) throw error;
        if (error.draft.scope?.mode === 'targeted') {
          patchDraft = error.draft;
          throw new Error('AI 已识别需要修改现有功能，但没有生成目标区域代码修改；必须针对已授权区域重新开发。');
        }
        progress({
          step: 'structure',
          order: 2,
          status: 'warning',
          title: '精确补丁为空，正在切换安全增量模式',
          detail: '系统将把入选创意作为独立模块加入旧页面，原有代码保持不变。',
        });
        fallbackResponse = await runAgentAdditiveModuleFallback(
          input,
          plan,
          baseCode,
          patchResponse,
          attemptFailures.at(-1) || '',
        );
        const additiveModule = parseAgentAdditiveModule(fallbackResponse);
        patchDraft = additiveModuleAsPatch(additiveModule);
        candidateCode = applyAgentAdditiveModule(baseCode, additiveModule);
        usedAdditiveFallback = true;
      }
      validateCompleteAgentHtml(candidateCode);
      preservation = validateAgentPreservation(baseCode, candidateCode, patchDraft);
      audit = await runAgentPatchAudit(input, plan, patchDraft, preservation);
      if (!/^PASS\s*:/i.test(audit.trim())) {
        throw new Error(`增量实现检查未通过：${audit.replace(/^FAIL\s*:\s*/i, '').slice(0, 900)}`);
      }
      break;
    } catch (error) {
      // Provider/network failures are not unsafe patches. Let the job surface the
      // retryable infrastructure error instead of mislabelling it as a rejected edit.
      if (isSuiXiangTransientUpstreamError(error)) throw error;
      const failure = error instanceof Error ? error.message : String(error);
      attemptFailures.push(failure);
      previousRejectedArtifact = fallbackResponse || (patchDraft
        ? JSON.stringify(patchDraft, null, 2)
        : patchResponse);
      addDebugLog({
        kind: 'ai',
        phase: 'info',
        title: `Incremental patch attempt ${attemptNumber} rejected`,
        detail: { provider: input.provider, mode: input.mode, failure },
      });
      if (attempt >= maxRepairAttempts) {
        throw new Error(
          `系统已拒绝可能破坏旧功能的版本。上一已发布版本保持不变。最后原因：${failure.slice(0, 900)}`,
        );
      }
      progress({
        step: 'validation',
        order: 7,
        status: 'warning',
        title: `安全检查发现问题，正在从上一版本重新生成（${attemptNumber}/${maxRepairAttempts}）`,
        detail: failure,
      });
    }
  }

  if (!patchDraft || !candidateCode || !preservation || !/^PASS\s*:/i.test(audit.trim())) {
    throw new Error('增量开发没有生成可安全预览的版本，上一已发布版本保持不变。');
  }

  progress({
    step: 'structure', order: 2, status: 'completed', title: '页面增量修改已经完成',
    detail: usedAdditiveFallback
      ? '精确补丁为空后，已安全加入独立增量模块，未重写原页面。'
      : `已安全应用 ${patchDraft.operations.length} 个精确修改，未重写原页面。`,
  });
  progress({
    step: 'images', order: 3, status: 'completed', title: '原有图片已经保留',
    detail: '沿用上一版本的图片资源，未对无关素材进行替换。',
  });
  progress({
    step: 'styles', order: 4, status: 'completed', title: '增量样式已经检查',
    detail: '新增样式保持局部作用域，原有视觉样式保持不变。',
  });
  progress({
    step: 'logic', order: 5, status: 'completed', title: '新旧交互已经连接',
    detail: `原有 ${preservation.baselineEventBindings} 个事件绑定均已保留。`,
  });
  progress({
    step: 'summary', order: 6, status: 'completed', title: '本次修改说明已经完成',
    detail: patchDraft.summary,
  });
  progress({
    step: 'validation', order: 7, status: 'completed', title: '新旧功能保留检查已经通过',
    detail: `非目标组件全部保留${preservation.authorizedRemovedIds.length ? `；按评论授权替换 ${preservation.authorizedRemovedIds.length} 个目标组件` : ''}；${audit.replace(/^PASS\s*:\s*/i, '')}`,
  });

  addDebugLog({
    kind: 'ai',
    phase: 'response',
    title: 'Development agent applied incremental patch',
    durationMs: Math.round(performance.now() - startedAt),
    detail: {
      provider: input.provider,
      mode: input.mode,
      baseLength: baseCode.length,
      candidateLength: candidateCode.length,
      operationCount: patchDraft.operations.length,
      usedAdditiveFallback,
      preservation,
      audit,
      rejectedAttempts: attemptFailures,
    },
  });

  return {
    text: patchDraft.summary,
    code: candidateCode,
    model: `${input.provider}-incremental-agent`,
    usage: null,
    steps: [
      `增量修改计划：\n${plan}`,
      usedAdditiveFallback
        ? '已应用 1 个安全增量模块。'
        : `已应用 ${patchDraft.operations.length} 个精确补丁。`,
      ...(usedAdditiveFallback ? ['精确补丁为空后，系统已自动切换为安全增量模块。'] : []),
      `旧功能保留检查：非目标组件无缺失，授权替换 ${preservation.authorizedRemovedIds.length} 个目标组件，事件绑定 ${preservation.baselineEventBindings} -> ${preservation.candidateEventBindings}。`,
      `增量实现检查：${audit}`,
    ],
  };
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
- These are implementation constraints, not a request for a plain, minimal, flat, or neutral visual style. Preserve or create a rich, distinctive, concept-driven art direction.
- Static gradients, textures, layered backgrounds, borders, typography, moderate shadows, localized glow, and other non-looping visual detail are welcome when they support the concept.
- Any continuous animation must target at most 30 FPS and use one bounded requestAnimationFrame loop rather than overlapping loops.
- Pause animation work while document.hidden is true and resume safely when visible again.
- Keep particle, trail, object, and history collections explicitly bounded; reuse objects instead of allocating large collections every frame.
- For Canvas/WebGL, cap rendering density to Math.min(window.devicePixelRatio || 1, 1.5) and resize only when dimensions change.
- Avoid repeatedly animating large-area blur, filter, backdrop-filter, box-shadow, or layout-affecting properties. Local static effects and lightweight transform/opacity animation are allowed.
- Avoid layout reads, DOM creation, and event-listener registration inside animation frames.
- Preserve ordinary clicks, forms, keyboard controls, timers, and non-animation interactions.`;

  const repairNotes: string[] = [];
  progress({ step: 'plan', order: 1, status: 'running', title: 'AI 正在制定修改计划', detail: '正在理解抽中的评论，并确认哪些现有内容必须保留。' });
  const plan = await runAgentTextStep(
    input.provider,
    '1/4 implementation plan',
    `${context}

Create a compact implementation plan for a self-contained web prototype.
Plan only work required by the Creator request, selected ideas, approved fusion plan, or existing functionality.
Do not introduce unrelated product features, copy, branding, games, controls, or interactions that were not supplied in those sources. A visual interpretation derived from the supplied subject and emotional tone is required and is not an unrelated feature or theme.
For an existing App, list only the explicitly requested scoped edits and identify the existing parts that must remain unchanged.
When visual details are underspecified, derive a cohesive and distinctive art direction from the Creator's subject, wording, and emotional tone. Do not fall back to a generic dashboard, generic card grid, or plain neutral template. Still avoid inventing unsupported product claims or unrelated features.
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
Preserve any visual direction explicitly supplied by the Creator, selected ideas, fusion plan, or current HTML.
For a new App without an explicit style reference, infer a distinctive, polished visual language from the subject and emotional tone. Establish intentional typography, hierarchy, spacing, palette, depth, and one or two memorable concept-specific visual motifs. Avoid generic SaaS dashboards, repetitive card grids, default gradients, and plain neutral templates unless explicitly requested.
Visual richness and performance are compatible: favor static gradients, layered backgrounds, textures, borders, moderate shadows, localized glow, and carefully limited transform/opacity motion. Only avoid continuously animated large-area blur/filter/shadow effects and excessive animated object counts.
Include .agent-toast and .agent-toast.show styles.
Keep continuous decorative animation lightweight and purposeful.
Keep CSS under 420 lines.`,
    6144,
    input.signal,
    input.apiKey,
  ));

  let inspection = inspectAgentArtifacts(body, css);
  if (inspection.coverage < 0.9 || inspection.missingClasses.length > 4) {
    progress({ step: 'styles', order: 4, status: 'running', title: '正在补全遗漏的视觉样式', detail: `自动检查发现 ${inspection.missingClasses.length} 个界面样式尚未覆盖，AI 正在修复。` });
    const cssCoverageAdditions = cleanCss(await runAgentTextStep(
      input.provider,
      '3b/4 CSS coverage repair',
      `${context}

Body fragment:
${truncate(body, 16000)}

First CSS attempt:
${truncate(css, 10000)}

Deterministic validation found ${inspection.missingClasses.length} unstyled classes and ${Math.round(inspection.coverage * 100)}% coverage.
Missing classes: ${inspection.missingClasses.join(', ')}

Generate CSS ADDITIONS ONLY, with no style tag. Add narrowly scoped rules for the missing classes and required responsive states.
Do not repeat, replace, simplify, normalize, or omit any rule from the first CSS attempt; it remains intact and your additions will be appended to it.
Match its exact visual language, typography, palette, spacing, depth, and component treatment. Include .agent-toast or .agent-toast.show only if either is missing. Do not use any external framework or remote background image, and do not introduce a new visual theme.`,
      6144,
      input.signal,
      input.apiKey,
    ));
    css = appendAgentCss(css, cssCoverageAdditions);
    repairNotes.push(`Agent appended CSS coverage for ${inspection.missingClasses.length} unstyled HTML classes without replacing the visual design.`);
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
    const interactionCssAdditions = cleanCss(await runAgentTextStep(
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

Generate CSS ADDITIONS ONLY, with no style tag.
The complete current CSS remains intact. Do not repeat, replace, simplify, normalize, or omit existing rules.
Add narrowly scoped, clearly visible styling for every missing JavaScript state class, using the exact class names from the JavaScript and matching the current visual design.
Selected, correct, wrong, active, disabled, revealed, and completed states must be visibly distinguishable where present.
Keep .agent-toast and .agent-toast.show. Do not use external frameworks, @import, or remote background images.`,
      6144,
      input.signal,
      input.apiKey,
    ));
    css = appendAgentCss(css, interactionCssAdditions);
    css = await resolveCssImageAssets(css, imageReport);
    inspection = inspectAgentArtifacts(body, css);
    interactionInspection = inspectAgentInteractionStyles(js, css);
    repairNotes.push('Agent appended CSS for JavaScript-applied interaction state classes without replacing the visual design.');
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
      } else if (correction.artifact === 'css-append') {
        css = appendAgentCss(css, cleanCss(correction.content));
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
    (signal) => input.mode === 'round-candidate' && Boolean(input.currentCode?.trim())
      ? runIncrementalDevelopmentAgentPipeline({ ...input, signal })
      : runDevelopmentAgentPipeline({ ...input, signal }),
  );
}
