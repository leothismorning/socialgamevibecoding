import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Download,
  Eye,
  FileCode2,
  GitMerge,
  GitBranch,
  Heart,
  Lightbulb,
  Link2,
  LoaderCircle,
  Lock,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Reply,
  Send,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Workflow,
  X,
} from 'lucide-react';
import { linkHorizontal } from 'd3';
import { communityGalleryApi } from './services/communityGalleryApi';
import type {
  CommunityApp,
  CommunityComment,
  CommunityGalleryState,
  CommunityNotification,
  CommunitySynthesis,
  CommunitySourceType,
  CreatorDevelopmentProgress,
} from './communityGalleryTypes';
import './asyncGallery.css';

const CLIENT_KEY = 'vibe-gallery-async-client-id';

function getClientId() {
  let value = sessionStorage.getItem(CLIENT_KEY);
  if (!value) {
    value = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `async-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(CLIENT_KEY, value);
  }
  return value;
}

function getGalleryColumnCount() {
  if (typeof window === 'undefined') return 4;
  if (window.innerWidth <= 720) return 1;
  if (window.innerWidth <= 860) return 2;
  if (window.innerWidth <= 1050) return 3;
  return 4;
}

function getSelectedAppIdFromLocation() {
  if (typeof window === 'undefined') return '';
  return new URL(window.location.href).searchParams.get('app') || '';
}

function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function contributorCodesForIteration(
  state: CommunityGalleryState,
  appId: string,
  iterationNumber: number,
) {
  return state.contributors
    .filter((contributor) => (
      contributor.app_id === appId && Number(contributor.iteration_number) === iterationNumber
    ))
    .map((contributor) => contributor.participant_code)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function contributorListLabel(codes: string[], limit = 6) {
  if (!codes.length) return '暂无平台内贡献者';
  const visible = codes.slice(0, limit).join('、');
  return codes.length > limit ? `${visible} 等 ${codes.length} 人` : visible;
}

function canUseCreativeTools(state: CommunityGalleryState) {
  return state.viewer?.role === 'creator';
}

function isAppRoundOpen(app: CommunityApp) {
  return app.flow_stage === 'round_1' || app.flow_stage === 'round_2';
}

function appFlowStatusText(app: CommunityApp) {
  const labels: Record<CommunityApp['flow_stage'], string> = {
    waiting_round_1: '等待发布初始版本 V0',
    round_1: '第一轮评论与综合进行中',
    development_1: '第一轮已锁定，系统开发进行中',
    waiting_round_2: '等待发布社区版本 V1',
    round_2: '第二轮评论与综合进行中',
    development_2: '第二轮已锁定，系统开发进行中',
    completed: '两轮流程均已完成',
  };
  return labels[app.flow_stage];
}

type CommentFeedbackBurstKind = 'like' | 'synthesis';

function CommentFeedbackBurst({ kind }: { kind: CommentFeedbackBurstKind }) {
  const particleCount = kind === 'synthesis' ? 8 : 4;
  return (
    <span className={`async-comment-feedback-burst is-${kind}`} aria-hidden="true">
      {kind === 'synthesis'
        ? <Lightbulb strokeWidth={2.4} />
        : <Heart fill="currentColor" />}
      {Array.from({ length: particleCount }, (_, index) => <i key={index} />)}
    </span>
  );
}

function useTimedBurst(duration = 620) {
  const [burstKeys, setBurstKeys] = useState<string[]>([]);
  const burstTimers = useRef<number[]>([]);

  useEffect(() => () => {
    burstTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const playBurst = useCallback((key: string) => {
    setBurstKeys((current) => (
      current.includes(key) ? current : [...current, key]
    ));
    const timer = window.setTimeout(() => {
      setBurstKeys((current) => current.filter((item) => item !== key));
      burstTimers.current = burstTimers.current.filter((item) => item !== timer);
    }, duration);
    burstTimers.current.push(timer);
  }, [duration]);

  return [burstKeys, playBurst] as const;
}

function AppPreview({
  clientId,
  app,
  version,
  title,
  compact = false,
  cacheKey = '',
  versionId,
}: {
  clientId: string;
  app: CommunityApp;
  version: 'initial' | 'community' | 'draft';
  title: string;
  compact?: boolean;
  cacheKey?: string;
  versionId?: number;
}) {
  return (
    <iframe
      className={compact ? 'async-preview is-compact' : 'async-preview'}
      title={title}
      src={communityGalleryApi.previewUrl(clientId, app.id, version, cacheKey, versionId)}
      sandbox="allow-scripts allow-forms allow-modals"
    />
  );
}

function IdentityGate({
  join,
  busy,
}: {
  join: (account: string, password: string) => void;
  busy: string;
}) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  return (
    <section className="async-identity-gate">
      <div className="async-identity-copy">
        <span className="async-eyebrow">加入创意共创社区</span>
        <h1>把社区讨论变成可以运行的作品</h1>
        <p>使用实验编号登录。创作者账号为 1–30，密码与账号相同；主持人账号和密码均为 0。</p>
      </div>
      <div className="async-identity-picker">
        <form className="async-login-form" onSubmit={(event) => {
          event.preventDefault();
          join(account, password);
        }}>
          <label><span>账号（实验编号）</span><input inputMode="numeric" autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="0–30" /></label>
          <label><span>密码</span><input type="password" inputMode="numeric" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" /></label>
          <button className="async-primary" type="submit" disabled={Boolean(busy) || !account || !password}><Lock /> 登录</button>
        </form>
      </div>
    </section>
  );
}

function PublishedCreatorStudio({
  state,
  clientId,
  action,
  busy,
}: {
  state: CommunityGalleryState;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
}) {
  const ownApp = state.apps.find((app) => app.creator_code === state.viewer?.code);
  const latestVersion = state.versions
    .filter((version) => version.app_id === ownApp?.id)
    .sort((left, right) => right.version_number - left.version_number)[0];
  const messages = state.developmentMessages.filter(
    (message) => message.app_id === ownApp?.id && message.phase === 'project',
  );
  const workspaceOpen = false;
  const [message, setMessage] = useState('');
  const [developmentProgress, setDevelopmentProgress] = useState<CreatorDevelopmentProgress | null>(null);
  const progressTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (progressTimer.current) window.clearInterval(progressTimer.current);
  }, []);

  if (!ownApp || !latestVersion) return null;
  const isDeveloping = busy === 'refine-project';
  const hasProjectDraft = ownApp.draft_kind === 'project' && Boolean(ownApp.draft_code);
  const progressSteps = [
    ['plan', '理解需求'],
    ['structure', '搭建页面'],
    ['images', '检查图片'],
    ['styles', '完善样式'],
    ['logic', '实现交互'],
    ['summary', '整理说明'],
    ['validation', '最终检查'],
  ] as const;
  const currentProgressEvent = developmentProgress?.events.find((event) => event.status === 'running')
    || developmentProgress?.events[developmentProgress.events.length - 1];
  const completedProgressCount = developmentProgress?.events.filter(
    (event) => event.status === 'completed',
  ).length || 0;
  const progressPercent = developmentProgress?.status === 'completed'
    ? 100
    : Math.round((completedProgressCount / progressSteps.length) * 100);

  const runProjectDevelopment = async () => {
    const creatorMessage = message.trim();
    if (!creatorMessage) return;
    const operationId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `creator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let latestProgress: CreatorDevelopmentProgress | null = null;
    setDevelopmentProgress({
      id: operationId,
      study_id: state.study.id,
      client_id: clientId,
      creator_code: state.viewer?.code || '',
      app_id: ownApp.id,
      phase: 'project',
      action: 'refine',
      status: 'running',
      started_at: new Date().toISOString(),
      events: [],
    });
    const poll = async () => {
      try {
        latestProgress = await communityGalleryApi.developmentProgress(clientId, operationId);
        setDevelopmentProgress(latestProgress);
      } catch {
        // The first poll can arrive before the refinement route creates the operation.
      }
    };
    progressTimer.current = window.setInterval(() => void poll(), 650);
    await action(
      'refine-project',
      () => communityGalleryApi.refine(clientId, creatorMessage, operationId),
    );
    setMessage('');
    await poll();
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    progressTimer.current = null;
    if (!latestProgress) setDevelopmentProgress(null);
  };

  return (
    <>
      <section className="async-studio async-studio-published">
        <CheckCircle2 />
        <div>
          <span className="async-eyebrow">最新版本已发布</span>
          <h2>{ownApp.title}</h2>
          <p>
            当前为 {latestVersion.kind === 'initial'
              ? '初始版本'
              : `社区版本 ${latestVersion.version_number - 1}`}。
            下一轮开发只能由主持人锁定本轮点赞并完成抽取后启动；生成草稿后，你可以继续修改并决定是否发布。
          </p>
        </div>
        {ownApp.flow_stage === 'round_1' && state.study.status === 'setup' ? (
          <button
            type="button"
            className="async-delete-initial-app"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!window.confirm(`确认删除“${ownApp.title}”吗？删除后需要重新创建并发布。`)) return;
              void action('delete-initial-app', () => communityGalleryApi.deleteInitialApp(clientId, ownApp.id));
            }}
          ><Trash2 /> 删除这个 App</button>
        ) : (
          <span className="async-control-continue-note">等待主持人启动下一轮开发</span>
        )}
      </section>

      {workspaceOpen && (
        <section className="async-studio async-continuation-studio">
          <header>
            <div>
              <span className="async-eyebrow">创作者 · 持续开发</span>
              <h2>继续开发 {ownApp.title}</h2>
              <p>以当前已发布版本为基础进行多轮对话。每轮修改先保存为草稿，确认满意后再单独发布。</p>
            </div>
            <span className="async-step-chip">已上线项目</span>
          </header>

          {developmentProgress && (
            <section className={`async-creator-progress is-${developmentProgress.status}`} aria-live="polite">
              <header>
                <span className="async-progress-icon">
                  {developmentProgress.status === 'completed'
                    ? <CheckCircle2 />
                    : developmentProgress.status === 'failed'
                      ? <X />
                      : <LoaderCircle className="spin" />}
                </span>
                <div>
                  <strong>
                    {developmentProgress.status === 'completed'
                      ? '本轮修改已保存为草稿'
                      : developmentProgress.status === 'failed'
                        ? '本轮修改未完成'
                        : currentProgressEvent?.title || '系统正在启动 AI 开发'}
                  </strong>
                  <p>
                    {developmentProgress.status === 'failed'
                      ? developmentProgress.error || '请根据页面提示调整后重试。'
                      : currentProgressEvent?.detail || '正在准备开发环境，请稍候。'}
                  </p>
                </div>
                <em>{progressPercent}%</em>
              </header>
              <div className="async-progress-track"><i style={{ width: `${progressPercent}%` }} /></div>
              <ol>
                {progressSteps.map(([stepKey, fallbackTitle]) => {
                  const event = developmentProgress.events.find((item) => item.step_key === stepKey);
                  return (
                    <li
                      key={stepKey}
                      className={event?.status === 'completed'
                        ? 'is-completed'
                        : event?.status === 'running'
                          ? 'is-running'
                          : ''}
                    >
                      <span>{event?.status === 'completed' ? <Check /> : event?.status === 'running' ? <LoaderCircle className="spin" /> : null}</span>
                      <small>{fallbackTitle}</small>
                    </li>
                  );
                })}
              </ol>
              {isDeveloping && (
                <footer><strong>系统正在开发中</strong><span>请不要刷新页面或关闭窗口，完成后会生成待发布草稿。</span></footer>
              )}
            </section>
          )}

          <div className="async-studio-layout">
            <section className="async-creator-chat">
              <header>
                <div><Bot /><span><strong>与 AI 继续开发</strong><small>{messages.length
                  ? `已完成 ${Math.floor(messages.length / 2)} 轮，可继续对话`
                  : '可以开始新的多轮开发对话'}</small></span></div>
                <em>草稿模式</em>
              </header>
              <div className="async-creator-chat-history" role="log" aria-label="创作者持续开发对话">
                {messages.length ? messages.map((item) => (
                  <article key={item.id} className={`is-${item.role}`}>
                    <span>{item.role === 'creator' ? state.viewer?.code : 'AI'}</span>
                    <div>
                      <strong>{item.role === 'creator' ? '你' : '开发助手'}</strong>
                      <p>{item.content}</p>
                    </div>
                  </article>
                )) : (
                  <div className="async-chat-empty"><MessageCircle /><span>请输入你希望继续修改或增加的功能。</span></div>
                )}
              </div>
              <div className="async-chat-composer">
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  disabled={isDeveloping}
                  placeholder="例如：保留现有功能，增加收藏筛选，并优化移动端交互…"
                />
                <div className="async-project-update-actions">
                  <button
                    className="async-primary"
                    disabled={!message.trim() || Boolean(busy)}
                    onClick={() => void runProjectDevelopment()}
                  ><Send /> {isDeveloping ? '正在修改…' : '发送更新'}</button>
                  <button
                    className="async-publish"
                    disabled={!hasProjectDraft || Boolean(busy)}
                    onClick={() => action(
                      'publish-project',
                      () => communityGalleryApi.publishProject(clientId),
                    )}
                  ><Check /> 发布</button>
                  <small>
                    {hasProjectDraft
                      ? '草稿已就绪；发布后首页和详情页才会更新。'
                      : '发送更新只生成草稿，不会直接修改公开项目。'}
                  </small>
                </div>
              </div>
            </section>
            <div className="async-studio-preview">
              <div>
                <Code2 />
                <strong>{hasProjectDraft ? '待发布草稿预览' : '当前公开项目预览'}</strong>
                <span>{isDeveloping
                  ? 'AI 开发中，请勿刷新'
                  : hasProjectDraft
                    ? '草稿已保存 · 尚未发布'
                    : '当前已发布版本'}</span>
              </div>
              <AppPreview
                clientId={clientId}
                app={ownApp}
                version={hasProjectDraft ? 'draft' : latestVersion.kind}
                versionId={hasProjectDraft ? undefined : latestVersion.id}
                title={`${ownApp.title} ${hasProjectDraft ? '待发布草稿' : '当前已发布版本'}`}
                cacheKey={state.serverNow}
              />
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function InitialCreatorStudio({
  state,
  clientId,
  action,
  busy,
}: {
  state: CommunityGalleryState;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
}) {
  const ownApp = state.apps.find((app) => app.creator_code === state.viewer?.code);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [prompt, setPrompt] = useState('');
  const [revision, setRevision] = useState('');
  const [developmentProgress, setDevelopmentProgress] = useState<CreatorDevelopmentProgress | null>(null);
  const loaded = useRef('');
  const progressTimer = useRef<number | null>(null);

  useEffect(() => {
    if (ownApp && loaded.current !== ownApp.id) {
      loaded.current = ownApp.id;
      setTitle(ownApp.title || '');
      setBrief(ownApp.brief || '');
      setPrompt(ownApp.creator_prompt || '');
    }
  }, [ownApp]);

  useEffect(() => () => {
    if (progressTimer.current) window.clearInterval(progressTimer.current);
  }, []);

  const initialMessages = useMemo(
    () => state.developmentMessages.filter(
      (message) => message.app_id === ownApp?.id && message.phase === 'initial',
    ),
    [ownApp?.id, state.developmentMessages],
  );

  const runDevelopment = async (
    label: 'generate-initial' | 'refine-initial',
    task: (operationId: string) => Promise<CommunityGalleryState>,
  ) => {
    const operationId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `creator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let latestProgress: CreatorDevelopmentProgress | null = null;
    setDevelopmentProgress({
      id: operationId,
      study_id: state.study.id,
      client_id: clientId,
      creator_code: state.viewer?.code || '',
      phase: 'initial',
      action: label === 'generate-initial' ? 'generate' : 'refine',
      status: 'running',
      started_at: new Date().toISOString(),
      events: [],
    });
    const poll = async () => {
      try {
        latestProgress = await communityGalleryApi.developmentProgress(clientId, operationId);
        setDevelopmentProgress(latestProgress);
      } catch {
        // The first poll can arrive before the POST route has created the operation.
      }
    };
    progressTimer.current = window.setInterval(() => void poll(), 650);
    await action(label, () => task(operationId));
    await poll();
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    progressTimer.current = null;
    if (!latestProgress) setDevelopmentProgress(null);
  };

  if (ownApp?.initial_version_id) {
    return (
      <PublishedCreatorStudio
        state={state}
        clientId={clientId}
        action={action}
        busy={busy}
      />
    );
  }

  const isDeveloping = busy === 'generate-initial' || busy === 'refine-initial';
  const progressSteps = [
    ['plan', '理解需求'],
    ['structure', '搭建页面'],
    ['images', '检查图片'],
    ['styles', '完善样式'],
    ['logic', '实现交互'],
    ['summary', '整理说明'],
    ['validation', '最终检查'],
  ] as const;
  const currentProgressEvent = developmentProgress?.events.find((event) => event.status === 'running')
    || developmentProgress?.events[developmentProgress.events.length - 1];
  const completedProgressCount = developmentProgress?.events.filter(
    (event) => event.status === 'completed',
  ).length || 0;
  const progressPercent = developmentProgress?.status === 'completed'
    ? 100
    : Math.round((completedProgressCount / progressSteps.length) * 100);

  return (
    <section className="async-studio">
      <header>
        <div>
          <span className="async-eyebrow">创作 · 初始版本</span>
          <h2>先完成你的独立作品</h2>
          <p>先让 AI 生成可运行草稿，再通过多轮对话继续修改。只有你确认满意并主动发布后，作品才会出现在首页。</p>
        </div>
        <span className="async-step-chip">第 1 / 4 步 · 创作</span>
      </header>
      {developmentProgress && (
        <section className={`async-creator-progress is-${developmentProgress.status}`} aria-live="polite">
          <header>
            <span className="async-progress-icon">
              {developmentProgress.status === 'completed'
                ? <CheckCircle2 />
                : developmentProgress.status === 'failed'
                  ? <X />
                  : <LoaderCircle className="spin" />}
            </span>
            <div>
              <strong>
                {developmentProgress.status === 'completed'
                  ? '本轮开发已经完成'
                  : developmentProgress.status === 'failed'
                    ? '本轮开发未完成'
                    : currentProgressEvent?.title || '系统正在启动 AI 开发'}
              </strong>
              <p>
                {developmentProgress.status === 'failed'
                  ? developmentProgress.error || '请根据页面提示调整后重试。'
                  : currentProgressEvent?.detail || '正在准备开发环境，请稍候。'}
              </p>
            </div>
            <em>{progressPercent}%</em>
          </header>
          <div className="async-progress-track"><i style={{ width: `${progressPercent}%` }} /></div>
          <ol>
            {progressSteps.map(([stepKey, fallbackTitle]) => {
              const event = developmentProgress.events.find((item) => item.step_key === stepKey);
              return (
                <li
                  key={stepKey}
                  className={event?.status === 'completed'
                    ? 'is-completed'
                    : event?.status === 'running'
                      ? 'is-running'
                      : ''}
                >
                  <span>{event?.status === 'completed' ? <Check /> : event?.status === 'running' ? <LoaderCircle className="spin" /> : null}</span>
                  <small>{fallbackTitle}</small>
                </li>
              );
            })}
          </ol>
          {isDeveloping && (
            <footer><strong>系统正在开发中</strong><span>请不要刷新页面或关闭窗口，完成后预览会自动更新。</span></footer>
          )}
        </section>
      )}
      <div className="async-studio-layout">
        <div className="async-studio-controls">
          {!ownApp?.draft_code ? (
            <>
              <label>应用名称<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label>一句话简介<input value={brief} onChange={(event) => setBrief(event.target.value)} /></label>
              <label>创作提示<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} /></label>
              <div className="async-button-row">
                <button
                  className="async-primary"
                  disabled={!title.trim() || !prompt.trim() || Boolean(busy)}
                  onClick={() => void runDevelopment(
                    'generate-initial',
                    (operationId) => communityGalleryApi.generateInitial(
                      clientId,
                      { title, brief, prompt, operationId },
                    ),
                  )}
                ><Sparkles /> {busy === 'generate-initial' ? 'AI 正在开发…' : 'AI 生成应用草稿'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="async-draft-summary">
                <span><CheckCircle2 /> 可运行草稿已生成</span>
                <strong>{ownApp.title}</strong>
                <p>{ownApp.brief || '你可以在右侧试玩，并继续告诉 AI 怎样修改。'}</p>
              </div>
              <section className="async-creator-chat">
                <header>
                  <div><Bot /><span><strong>与 AI 继续修改</strong><small>{initialMessages.length
                    ? `已完成 ${Math.floor(initialMessages.length / 2)} 轮，可继续对话`
                    : '可以开始多轮对话修改'}</small></span></div>
                  <em>发布前草稿</em>
                </header>
                <div className="async-creator-chat-history" role="log" aria-label="创作者与 AI 的修改对话">
                  {initialMessages.length ? initialMessages.map((message) => (
                    <article key={message.id} className={`is-${message.role}`}>
                      <span>{message.role === 'creator' ? state.viewer?.code : 'AI'}</span>
                      <div>
                        <strong>{message.role === 'creator' ? '你' : '开发助手'}</strong>
                        <p>{message.content}</p>
                      </div>
                    </article>
                  )) : (
                    <div className="async-chat-empty"><MessageCircle /><span>草稿已经就绪，请提出第一条修改要求。</span></div>
                  )}
                </div>
                <div className="async-chat-composer">
                  <textarea
                    value={revision}
                    onChange={(event) => setRevision(event.target.value)}
                    rows={4}
                    disabled={isDeveloping}
                    placeholder="例如：保留现在的功能，把首页改成更简洁的卡片布局，并增加搜索…"
                  />
                  <button
                    className="async-primary"
                    disabled={!revision.trim() || Boolean(busy)}
                    onClick={() => {
                      const message = revision;
                      void runDevelopment('refine-initial', async (operationId) => {
                        const next = await communityGalleryApi.refine(clientId, message, operationId);
                        setRevision('');
                        return next;
                      });
                    }}
                  ><Send /> {busy === 'refine-initial' ? '正在修改…' : '发送并修改草稿'}</button>
                </div>
              </section>
            </>
          )}
        </div>
        <div className="async-studio-preview">
          <div><Code2 /><strong>实时预览</strong><span>{isDeveloping ? 'AI 开发中，请勿刷新' : ownApp?.draft_code ? '草稿已保存 · 尚未发布' : '等待创建'}</span></div>
          {ownApp?.draft_code
            ? <AppPreview clientId={clientId} app={ownApp} version="draft" title={`${ownApp.title} 草稿`} cacheKey={state.serverNow} />
            : <div className="async-empty-preview"><FileCode2 /><span>生成或上传后在这里试玩</span></div>}
          <button
            className="async-publish"
            disabled={!ownApp?.draft_code || Boolean(busy)}
            onClick={() => action('publish-initial', () => communityGalleryApi.publishInitial(clientId))}
          ><Check /> 满意后发布初始版本</button>
        </div>
      </div>
    </section>
  );
}

function GalleryMasonryItem({
  paired,
  children,
}: {
  paired: boolean;
  children: React.ReactNode;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [rowSpan, setRowSpan] = useState(1);

  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;
    const updateSpan = () => {
      const height = element.getBoundingClientRect().height;
      setRowSpan(Math.max(1, Math.ceil((height + 8) / 12)));
    };
    updateSpan();
    const observer = new ResizeObserver(updateSpan);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={itemRef}
      className={paired ? 'async-gallery-item is-paired' : 'async-gallery-item'}
      style={{ gridRowEnd: `span ${rowSpan}` }}
    >
      {children}
    </div>
  );
}

function GalleryVersionCard({
  state,
  app,
  clientId,
  assigned,
  open,
  like,
  index,
  version,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  clientId: string;
  assigned: boolean;
  open: () => void;
  like: () => void;
  index: number;
  version: 'initial' | 'community';
}) {
  const isCommunity = version === 'community';
  const latestCommunityVersion = state.versions.find(
    (item) => Number(item.id) === Number(app.community_version_id),
  );
  const selectedSynthesis = state.syntheses.find(
    (item) => Number(item.id) === Number(latestCommunityVersion?.synthesis_id),
  );
  const contributorCodes = isCommunity
    ? contributorCodesForIteration(state, app.id, Number(app.community_version_count || 0))
    : [];
  const canLike = state.viewer?.role !== 'host'
    && state.viewer?.code !== app.creator_code && isAppRoundOpen(app);
  return (
    <article
      className={`async-app-card tone-${index % 3}`}
      tabIndex={0}
      aria-label={`打开“${app.title}”${isCommunity ? '最新社区版本' : '原始版本'}详情`}
      onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('button, a, input, textarea, select')) return;
        open();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        open();
      }}
    >
      <header className="async-card-chrome">
        <Code2 />
        <strong>{app.title}</strong>
        <div>
          {assigned && <span className="async-assigned-badge"><CheckCircle2 /> 指定体验</span>}
          {isCommunity && <span className="async-community-badge"><GitMerge /> 社区共创</span>}
          {state.viewer?.role === 'host' && Boolean(app.is_test) && <span>测试角色作品</span>}
        </div>
      </header>
      <section className="async-version-preview">
        <span>{isCommunity ? `社区版本 ${app.community_version_count}` : '初始版本'}</span>
        <AppPreview
          clientId={clientId}
          app={app}
          version={version}
          title={`${app.title} ${isCommunity ? `社区版本 ${app.community_version_count}` : '初始版本'}`}
          compact
          cacheKey={String(isCommunity ? app.community_version_id : app.initial_version_id || '')}
        />
      </section>
      <div className="async-card-body">
        <div>
          <div className="async-card-kicker-row">
            <span className="async-eyebrow">
              {isCommunity ? '社区共同创作 · 最新版本' : `${app.creator_code} · 原创应用`}
            </span>
            <span className={isCommunity ? 'async-feed-status is-ready' : 'async-feed-status'}>
              {isCommunity
                ? `社区版本 ${app.community_version_count}`
                : app.community_version_id ? '初始版本' : '等待社区版本'}
            </span>
          </div>
          <h2>{isCommunity ? `${app.title} · 社区版本 ${app.community_version_count}` : app.title}</h2>
          <p>{isCommunity
            ? latestCommunityVersion?.summary || '社区综合讨论后形成的最新可运行版本。'
            : app.brief || '一个由创作者自由创作的应用。'}</p>
        </div>
        {isCommunity && (selectedSynthesis || contributorCodes.length > 0) && (
          <div className="async-card-provenance">
            <GitMerge />
            <span>{selectedSynthesis
              ? `最新社区版本来自“${selectedSynthesis.title}”`
              : '最新社区版本由社区想法推动开发'}</span>
            <small title={contributorCodes.join('、')}>累计贡献者：{contributorListLabel(contributorCodes)}</small>
          </div>
        )}
        <footer>
          <div>
            <button
              className={app.viewer_liked ? 'async-social-button is-liked' : 'async-social-button'}
              disabled={!canLike}
              onClick={like}
              title={canLike ? '表达喜欢，不参与版本选择' : '当前 App 未开放互动，或不能点赞自己的应用'}
            ><Heart /> {app.like_count}</button>
            <span><MessageCircle /> {app.comment_count}</span>
            <span><Lightbulb /> {app.synthesis_count}</span>
          </div>
          <button className="async-open-app" onClick={open}>进入体验与讨论 <Eye /></button>
        </footer>
      </div>
    </article>
  );
}

function GalleryCard({
  state,
  app,
  clientId,
  assigned,
  open,
  like,
  index,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  clientId: string;
  assigned: boolean;
  open: () => void;
  like: () => void;
  index: number;
}) {
  const cardProps = { state, app, clientId, open, like, index };
  return (
    <div className={app.community_version_id ? 'async-card-group has-community' : 'async-card-group'}>
      <GalleryVersionCard {...cardProps} assigned={assigned} version="initial" />
      {app.community_version_id && (
        <>
          <span className="async-version-arrow" aria-hidden="true">
            <ArrowRight strokeWidth={4} />
          </span>
          <GalleryVersionCard {...cardProps} assigned={false} version="community" />
        </>
      )}
    </div>
  );
}

function CommentThread({
  state,
  app,
  clientId,
  action,
  busy,
  targetType = 'app',
  targetId,
  compact = false,
  openSynthesis,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
  targetType?: 'app' | 'synthesis';
  targetId?: string;
  compact?: boolean;
  openSynthesis?: (synthesis: CommunitySynthesis) => void;
}) {
  const resolvedTargetId = targetId || app.id;
  const comments = state.comments.filter(
    (comment) => comment.target_type === targetType && comment.target_id === resolvedTargetId,
  );
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [likedCommentKeys, playLikedCommentBurst] = useTimedBurst();
  const canParticipate = Boolean(
    state.viewer && state.viewer.role !== 'host'
      && state.study.status === 'active' && isAppRoundOpen(app),
  );
  const canComment = canParticipate && app.creator_code !== state.viewer?.code;
  const showBasket = canUseCreativeTools(state) && state.study.status === 'active';

  const roots = comments.filter((comment) => !comment.parent_comment_id);
  const children = (id: number) => comments.filter((comment) => Number(comment.parent_comment_id) === Number(id));

  const submit = async () => {
    await action(`comment-${targetType}-${resolvedTargetId}`, async () => {
      const next = await communityGalleryApi.comment(clientId, {
        appId: app.id,
        content,
        targetType,
        targetId: resolvedTargetId,
      });
      setContent('');
      return next;
    });
  };

  const submitReply = async (parentCommentId: number) => {
    await action(`reply-${parentCommentId}`, async () => {
      const next = await communityGalleryApi.comment(clientId, {
        appId: app.id,
        content: reply,
        parentCommentId,
        targetType,
        targetId: resolvedTargetId,
      });
      setReply('');
      setReplyTo(null);
      return next;
    });
  };

  const startEditing = (comment: CommunityComment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
    setReplyTo(null);
  };

  const saveEdit = async (commentId: number) => {
    await action(`edit-comment-${commentId}`, async () => {
      const next = await communityGalleryApi.editComment(clientId, commentId, editContent);
      setEditingCommentId(null);
      setEditContent('');
      return next;
    });
  };

  const removeComment = (comment: CommunityComment) => {
    const confirmed = window.confirm(
      '确定删除这条评论吗？删除后不能恢复；如果它已有回复或被用于综合，系统会保留一个匿名内容占位以维持创意关系。',
    );
    if (!confirmed) return;
    if (editingCommentId === comment.id) {
      setEditingCommentId(null);
      setEditContent('');
    }
    void action(
      `delete-${comment.id}`,
      () => communityGalleryApi.deleteComment(clientId, comment.id),
    );
  };

  const renderComment = (comment: CommunityComment, depth = 0) => {
    const usedBy = state.synthesisSources
      .filter((source) => source.source_type === 'comment' && Number(source.source_id) === Number(comment.id))
      .map((source) => state.syntheses.find((synthesis) => Number(synthesis.id) === Number(source.synthesis_id)))
      .filter(Boolean) as CommunitySynthesis[];
    const deleted = Boolean(comment.deleted_at);
    const edited = !deleted && comment.updated_at !== comment.created_at;
    const canManage = !deleted
      && canParticipate
      && comment.author_code === state.viewer?.code;
    const editing = editingCommentId === comment.id;
    return (
    <article
      key={comment.id}
      className={deleted ? 'async-comment is-deleted' : 'async-comment'}
      style={{ '--comment-depth': Math.min(depth, 3) } as React.CSSProperties}
    >
      {likedCommentKeys.includes(String(comment.id)) && <CommentFeedbackBurst kind="like" />}
      <header>
        <div>
          <span>{comment.author_code}</span>
          <small>{formatDate(comment.created_at)}</small>
          {edited && <em className="async-edited-label">已编辑</em>}
        </div>
        {canManage && (
          <div className="async-comment-owner-actions">
            <button className="async-icon-text" onClick={() => startEditing(comment)}>
              <Pencil /> 编辑
            </button>
            <button className="async-icon-text" onClick={() => removeComment(comment)}>
              <Trash2 /> 删除
            </button>
          </div>
        )}
      </header>
      {editing ? (
        <div className="async-comment-edit">
          <textarea
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            rows={3}
            maxLength={3000}
            autoFocus
          />
          <div>
            <span>{editContent.length}/3000</span>
            <button
              className="async-secondary"
              onClick={() => {
                setEditingCommentId(null);
                setEditContent('');
              }}
            >取消</button>
            <button
              className="async-primary"
              disabled={!editContent.trim() || Boolean(busy)}
              onClick={() => void saveEdit(comment.id)}
            ><Check /> 保存修改</button>
          </div>
        </div>
      ) : (
        <p>{comment.content}</p>
      )}
      {usedBy.length > 0 && (
        <div className="async-source-backlinks">
          {usedBy.map((synthesis) => (
            <button key={synthesis.id} onClick={() => openSynthesis?.(synthesis)}>
              <Link2 /> 已用于综合评论“{synthesis.title}”
            </button>
          ))}
        </div>
      )}
      {!deleted && (
        <footer>
          <button
            className={comment.viewer_liked ? 'async-icon-text is-liked' : 'async-icon-text'}
            disabled={!canParticipate}
            onClick={() => {
              if (!comment.viewer_liked) playLikedCommentBurst(String(comment.id));
              void action(`like-comment-${comment.id}`, () => communityGalleryApi.likeComment(clientId, comment.id));
            }}
          ><Heart /> {comment.like_count}</button>
          <button className="async-icon-text" disabled={!canComment} onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>
            <Reply /> 回复
          </button>
          {showBasket && (
            <button
              className={comment.viewer_in_basket ? 'async-icon-text is-in-basket' : 'async-icon-text'}
              onClick={() => action(`basket-comment-${comment.id}`, () => communityGalleryApi.toggleBasket(clientId, 'comment', comment.id))}
            ><ShoppingBasket /> {comment.viewer_in_basket ? '已收藏' : '收藏'}</button>
          )}
        </footer>
      )}
      {!deleted && canComment && replyTo === comment.id && (
        <div className="async-reply-composer">
          <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={2} placeholder={`回复 ${comment.author_code}`} />
          <button disabled={!reply.trim() || Boolean(busy)} onClick={() => submitReply(comment.id)}><Send /> 发布回复</button>
        </div>
      )}
      {children(comment.id).length > 0 && (
        <div className="async-comment-children">
          {children(comment.id).map((child) => renderComment(child, depth + 1))}
        </div>
      )}
    </article>
    );
  };

  return (
    <div className={compact ? 'async-thread is-compact' : 'async-thread'}>
      {canComment && (
        <div className="async-comment-composer">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={compact ? 2 : 4}
            placeholder={targetType === 'synthesis' ? '继续讨论这条综合评论…' : '分享体验、建议、技术细节或新的使用场景…'}
          />
          <div><span>{content.length}/3000</span><button disabled={!content.trim() || Boolean(busy)} onClick={submit}><Send /> 发布</button></div>
        </div>
      )}
      <div className="async-comment-list">
        {roots.map((comment) => renderComment(comment))}
        {roots.length === 0 && <div className="async-empty-discussion"><MessageCircle /><span>还没有讨论，来提出第一个想法吧。</span></div>}
      </div>
    </div>
  );
}

function SourceDrawer({
  state,
  synthesis,
  close,
}: {
  state: CommunityGalleryState;
  synthesis: CommunitySynthesis;
  close: () => void;
}) {
  const sources = state.synthesisSources
    .filter((source) => Number(source.synthesis_id) === Number(synthesis.id))
    .sort((left, right) => left.source_order - right.source_order);
  return (
    <div className="async-overlay" role="dialog" aria-modal="true" aria-label="综合评论来源">
      <aside className="async-side-drawer">
        <header>
          <div><span className="async-eyebrow">创意来源</span><h2>{synthesis.title}</h2></div>
          <button onClick={close}><X /></button>
        </header>
        <p className="async-drawer-intro">这条综合评论连接了以下直接创意来源。原作者、来源应用和讨论位置都会被保留。</p>
        <div className="async-source-list">
          {sources.map((source, index) => (
            <article key={`${source.source_type}-${source.source_id}`}>
              <span>{index + 1}</span>
              <div>
                <header>
                  <strong>{source.author_code}</strong>
                  <small>
                    {source.app_title}
                    {source.version_kind ? ` · ${source.version_kind === 'initial' ? '初始版本' : '社区版本'}` : ''}
                    {` · ${source.source_type === 'synthesis' ? '综合评论' : '普通讨论'}`}
                  </small>
                </header>
                {source.title && <h3>{source.title}</h3>}
                <p>{source.content}</p>
                {source.contribution_note && <blockquote>综合者说明：{source.contribution_note}</blockquote>}
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

type IdeaFlowNode = {
  key: string;
  kind: 'comment' | 'external-comment' | 'external-synthesis' | 'synthesis';
  column: number;
  author: string;
  appTitle: string;
  title: string;
  content: string;
  createdAt: string;
  sourceType: CommunitySourceType;
  sourceId: number;
  used: boolean;
  inBasket: boolean;
  comment?: CommunityComment;
  synthesis?: CommunitySynthesis;
};

type PositionedIdeaFlowNode = IdeaFlowNode & {
  x: number;
  y: number;
};

const FLOW_NODE_WIDTH = 292;
const FLOW_NODE_HEIGHT = 142;
const FLOW_COLUMN_GAP = 96;
const FLOW_ROW_GAP = 24;
const FLOW_START_X = 38;
const FLOW_START_Y = 102;
const flowLink = linkHorizontal<any, any>()
  .x((point: any) => point.x)
  .y((point: any) => point.y);

function VersionLineage({
  state,
  app,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
}) {
  const versions = state.versions
    .filter((version) => version.app_id === app.id)
    .sort((left, right) => left.version_number - right.version_number);
  const initial = versions.find((version) => version.kind === 'initial');
  const communityVersions = versions.filter((version) => version.kind === 'community');
  if (!initial) return null;
  return (
    <section className="async-version-lineage" aria-label="版本开发关系">
      <header>
        <GitBranch />
        <div><strong>版本开发关系</strong><small>作者从社区讨论中选择一个或多个方向；社区版本 1 基于初始版本，社区版本 2 固定基于社区版本 1</small></div>
      </header>
      <div className="async-version-lineage-grid">
        <article className="is-initial">
          <span>起点</span>
          <strong>初始版本</strong>
          <small>{formatDate(initial.created_at)}</small>
        </article>
        {communityVersions.map((version) => {
          const iteration = version.version_number - 1;
          const contributorCodes = contributorCodesForIteration(state, app.id, iteration);
          const base = versions.find((candidate) => Number(candidate.id) === Number(version.base_version_id));
          const synthesis = state.syntheses.find(
            (candidate) => Number(candidate.id) === Number(version.synthesis_id),
          );
          const comment = version.selected_source_type === 'comment'
            ? state.comments.find(
                (candidate) => Number(candidate.id) === Number(version.selected_source_id),
              )
            : undefined;
          const selectedLabel = synthesis?.title || comment?.content;
          return (
            <div className="async-version-lineage-step" key={version.id}>
              <span className="async-lineage-arrow"><ArrowRight /></span>
              <article className="is-community">
                <span>基于 {base?.kind === 'community' ? `社区版本 ${base.version_number - 1}` : '初始版本'}</span>
                <strong>社区版本 {iteration}</strong>
                <small>{selectedLabel ? `采用“${selectedLabel}”` : '外部开发版本'} · {formatDate(version.created_at)}</small>
                <small className="async-version-contributors" title={contributorCodes.join('、')}>
                  累计贡献者：{contributorListLabel(contributorCodes)}
                </small>
              </article>
            </div>
          );
        })}
        {communityVersions.length < 2 && (
          <div className="async-version-lineage-step is-pending">
            <span className="async-lineage-arrow"><ArrowRight /></span>
            <article>
              <span>可选</span>
              <strong>社区版本 {communityVersions.length + 1}</strong>
              <small>{communityVersions.length ? '等待作者从第二轮讨论中选择开发方向' : '等待作者从评论区选择开发方向'}</small>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}

function LegacyIdeaFlowBoard({
  state,
  app,
  clientId,
  action,
  busy,
  openBasket,
  viewSources,
  generate,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
  openBasket: () => void;
  viewSources: (synthesis: CommunitySynthesis) => void;
  generate: (synthesis: CommunitySynthesis) => void;
}) {
  const [commentContent, setCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [discussionSynthesis, setDiscussionSynthesis] = useState<CommunitySynthesis | null>(null);
  const [focusedNode, setFocusedNode] = useState('');
  const canParticipate = Boolean(
    state.viewer && state.viewer.role !== 'host'
      && state.study.status === 'active' && isAppRoundOpen(app),
  );
  const creativeToolsAvailable = canUseCreativeTools(state) && state.study.status === 'active';
  const isOwner = state.viewer?.role === 'creator' && state.viewer.code === app.creator_code;
  const targetSyntheses = state.syntheses
    .filter((synthesis) => synthesis.target_app_id === app.id)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
  const targetSynthesisIds = new Set(targetSyntheses.map((synthesis) => Number(synthesis.id)));
  const targetSources = state.synthesisSources.filter((source) => targetSynthesisIds.has(Number(source.synthesis_id)));
  const sourceKey = (type: CommunitySourceType, id: number) => `${type}:${id}`;
  const usedSourceKeys = new Set(targetSources.map((source) => sourceKey(source.source_type, Number(source.source_id))));
  const basketKeys = new Set(state.basket.map((item) => sourceKey(item.source_type, Number(item.source_id))));
  const synthesisById = new Map(state.syntheses.map((synthesis) => [Number(synthesis.id), synthesis]));
  const levelCache = new Map<number, number>();

  const synthesisLevel = (synthesisId: number, trail = new Set<number>()): number => {
    const cached = levelCache.get(synthesisId);
    if (cached) return cached;
    if (trail.has(synthesisId)) return 1;
    const nextTrail = new Set(trail).add(synthesisId);
    const dependencyLevels = targetSources
      .filter((source) => Number(source.synthesis_id) === synthesisId && source.source_type === 'synthesis')
      .map((source) => Number(source.source_id))
      .filter((sourceId) => targetSynthesisIds.has(sourceId))
      .map((sourceId) => synthesisLevel(sourceId, nextTrail));
    const level = 1 + (dependencyLevels.length ? Math.max(...dependencyLevels) : 0);
    levelCache.set(synthesisId, level);
    return level;
  };

  const localComments = state.comments
    .filter((comment) => comment.app_id === app.id)
    .map<IdeaFlowNode>((comment) => ({
      key: sourceKey('comment', comment.id),
      kind: 'comment',
      column: 0,
      author: comment.author_code,
      appTitle: app.title,
      title: comment.target_type === 'synthesis' ? '综合评论下的新讨论' : '',
      content: comment.content,
      createdAt: comment.created_at,
      sourceType: 'comment',
      sourceId: Number(comment.id),
      used: usedSourceKeys.has(sourceKey('comment', comment.id)),
      inBasket: Boolean(comment.viewer_in_basket),
      comment,
    }));
  const localKeys = new Set(localComments.map((node) => node.key));
  const externalSourceRecords = new Map<string, {
    source_type: CommunitySourceType;
    source_id: number;
    app_id: string;
    app_title: string;
    author_code: string;
    title?: string;
    content: string;
    created_at?: string;
  }>();
  targetSources.forEach((source) => {
    const key = sourceKey(source.source_type, Number(source.source_id));
    if (!localKeys.has(key) && !(source.source_type === 'synthesis' && targetSynthesisIds.has(Number(source.source_id)))) {
      externalSourceRecords.set(key, source);
    }
  });
  state.basket.forEach((item) => {
    const key = sourceKey(item.source_type, Number(item.source_id));
    if (!localKeys.has(key) && !(item.source_type === 'synthesis' && targetSynthesisIds.has(Number(item.source_id)))) {
      externalSourceRecords.set(key, {
        ...item,
        created_at: item.added_at,
      });
    }
  });
  const externalNodes = [...externalSourceRecords.values()].map<IdeaFlowNode>((source) => {
    const key = sourceKey(source.source_type, Number(source.source_id));
    const sourceSynthesis = source.source_type === 'synthesis'
      ? synthesisById.get(Number(source.source_id))
      : undefined;
    const sourceComment = source.source_type === 'comment'
      ? state.comments.find((comment) => Number(comment.id) === Number(source.source_id))
      : undefined;
    return {
      key,
      kind: source.source_type === 'synthesis' ? 'external-synthesis' : 'external-comment',
      column: 0,
      author: source.author_code,
      appTitle: source.app_title,
      title: source.title || '',
      content: source.content,
      createdAt: source.created_at || '',
      sourceType: source.source_type,
      sourceId: Number(source.source_id),
      used: usedSourceKeys.has(key),
      inBasket: basketKeys.has(key),
      comment: sourceComment,
      synthesis: sourceSynthesis,
    };
  });
  const sourceNodes = [...localComments, ...externalNodes].sort((left, right) => {
    if (left.used !== right.used) return left.used ? -1 : 1;
    if (left.kind === 'comment' && right.kind !== 'comment') return -1;
    if (left.kind !== 'comment' && right.kind === 'comment') return 1;
    return Date.parse(left.createdAt || '0') - Date.parse(right.createdAt || '0');
  });
  const selectedVersionsBySynthesis = new Map<number, number[]>();
  state.versions
    .filter((version) => version.app_id === app.id && version.kind === 'community' && version.synthesis_id)
    .forEach((version) => {
      const synthesisId = Number(version.synthesis_id);
      const iterations = selectedVersionsBySynthesis.get(synthesisId) || [];
      iterations.push(Number(version.version_number) - 1);
      selectedVersionsBySynthesis.set(synthesisId, iterations);
    });
  const draftSynthesisId = Number(app.draft_synthesis_id || 0);
  const selectedSynthesisIds = new Set([
    ...selectedVersionsBySynthesis.keys(),
    ...(draftSynthesisId ? [draftSynthesisId] : []),
  ]);
  const synthesisNodes = targetSyntheses.map<IdeaFlowNode>((synthesis) => {
    const key = sourceKey('synthesis', Number(synthesis.id));
    return {
      key,
      kind: 'synthesis',
      column: synthesisLevel(Number(synthesis.id)),
      author: synthesis.author_code,
      appTitle: app.title,
      title: synthesis.title,
      content: synthesis.content,
      createdAt: synthesis.created_at,
      sourceType: 'synthesis',
      sourceId: Number(synthesis.id),
      used: usedSourceKeys.has(key) || selectedSynthesisIds.has(Number(synthesis.id)),
      inBasket: Boolean(synthesis.viewer_in_basket),
      synthesis,
    };
  });
  const maximumLevel = synthesisNodes.reduce((maximum, node) => Math.max(maximum, node.column), 0);
  const lastColumn = Math.max(1, maximumLevel + 1);
  const columns = Array.from({ length: lastColumn + 1 }, (_, column) => {
    const nodes = column === 0
      ? sourceNodes
      : synthesisNodes
          .filter((node) => node.column === column)
          .sort((left, right) => {
            const leftSelected = selectedSynthesisIds.has(Number(left.sourceId));
            const rightSelected = selectedSynthesisIds.has(Number(right.sourceId));
            if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
            if (left.used !== right.used) return left.used ? -1 : 1;
            return Date.parse(left.createdAt) - Date.parse(right.createdAt);
          });
    return { column, nodes };
  });
  const positionedNodes = columns.flatMap(({ column, nodes }) =>
    nodes.map<PositionedIdeaFlowNode>((node, index) => ({
      ...node,
      x: FLOW_START_X + column * (FLOW_NODE_WIDTH + FLOW_COLUMN_GAP),
      y: FLOW_START_Y + index * (FLOW_NODE_HEIGHT + FLOW_ROW_GAP),
    })),
  );
  const positionByKey = new Map(positionedNodes.map((node) => [node.key, node]));
  const edges = targetSources
    .map((source) => {
      const sourceNode = positionByKey.get(sourceKey(source.source_type, Number(source.source_id)));
      const targetNode = positionByKey.get(sourceKey('synthesis', Number(source.synthesis_id)));
      return sourceNode && targetNode
        ? {
            key: `${source.source_type}:${source.source_id}->${source.synthesis_id}`,
            source: sourceNode,
            target: targetNode,
          }
        : null;
    })
    .filter(Boolean) as Array<{ key: string; source: PositionedIdeaFlowNode; target: PositionedIdeaFlowNode }>;
  const maximumRows = Math.max(1, ...columns.map((column) => column.nodes.length));
  const canvasWidth = FLOW_START_X * 2
    + (lastColumn + 1) * FLOW_NODE_WIDTH
    + lastColumn * FLOW_COLUMN_GAP;
  const canvasHeight = Math.max(
    440,
    FLOW_START_Y + maximumRows * (FLOW_NODE_HEIGHT + FLOW_ROW_GAP) + 32,
  );
  const hasRunningGeneration = state.generationJobs.some(
    (job) => job.app_id === app.id && job.status === 'running',
  );
  const hasActiveDraft = app.draft_kind === 'community'
    && Number(app.draft_iteration_number || 0) > Number(app.community_version_count || 0)
    && Boolean(app.draft_code);
  const canStartDevelopment = isOwner
    && Number(app.community_version_count || 0) < 2
    && !hasRunningGeneration
    && !hasActiveDraft;

  const submitComment = async () => {
    await action('flow-comment', async () => {
      const next = await communityGalleryApi.comment(clientId, {
        appId: app.id,
        content: commentContent,
      });
      setCommentContent('');
      return next;
    });
  };

  const submitReply = async () => {
    if (!replyingTo) return;
    await action(`flow-reply-${replyingTo.id}`, async () => {
      const next = await communityGalleryApi.comment(clientId, {
        appId: replyingTo.app_id,
        content: replyContent,
        parentCommentId: replyingTo.id,
        targetType: replyingTo.target_type,
        targetId: replyingTo.target_id,
      });
      setReplyContent('');
      setReplyingTo(null);
      return next;
    });
  };

  return (
    <section className="async-flow-section">
      <header className="async-flow-heading">
        <div>
          <span className="async-eyebrow">可视化创意演化</span>
          <h2>创意演化画布</h2>
          <p>位置由系统自动排列。被采用的评论置顶，连线显示它们如何进入综合方向；向右代表继续综合。</p>
        </div>
        <div className="async-flow-heading-actions">
          <span><Workflow /> {edges.length} 条来源连线</span>
          {canParticipate && (
            <button onClick={openBasket}><ShoppingBasket /> 收藏夹 <strong>{state.basket.length}</strong></button>
          )}
        </div>
      </header>

      {!isAppRoundOpen(app) && (
        <div className="async-app-flow-notice">
          <Workflow />
          <div><strong>{appFlowStatusText(app)}</strong><span>当前 App 的评论和综合入口已暂停，由 Host 单独推进流程。</span></div>
        </div>
      )}

      <VersionLineage state={state} app={app} />

      {canParticipate && (
        <div className="async-flow-comment-composer">
          <div><MessageCircle /><span><strong>提出一个新想法</strong><small>发布后会进入左侧“普通评论”列</small></span></div>
          <textarea
            value={commentContent}
            onChange={(event) => setCommentContent(event.target.value)}
            rows={2}
            maxLength={3000}
            placeholder="分享体验、建议、技术细节或新的使用场景…"
          />
          <button disabled={!commentContent.trim() || Boolean(busy)} onClick={submitComment}><Send /> 发布评论</button>
        </div>
      )}

      <div className="async-flow-scroll">
        <div className="async-flow-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
          <svg className="async-flow-edges" width={canvasWidth} height={canvasHeight} aria-hidden="true">
            {edges.map((edge) => {
              const active = focusedNode === edge.source.key || focusedNode === edge.target.key;
              const path = flowLink({
                source: {
                  x: edge.source.x + FLOW_NODE_WIDTH,
                  y: edge.source.y + FLOW_NODE_HEIGHT / 2,
                },
                target: {
                  x: edge.target.x,
                  y: edge.target.y + FLOW_NODE_HEIGHT / 2,
                },
              }) || '';
              return <path key={edge.key} className={active ? 'is-active' : ''} d={path} />;
            })}
          </svg>

          {columns.map(({ column, nodes }) => {
            const x = FLOW_START_X + column * (FLOW_NODE_WIDTH + FLOW_COLUMN_GAP);
            const isTrailing = column > maximumLevel;
            return (
              <div key={column}>
                <div className="async-flow-column-heading" style={{ left: x, width: FLOW_NODE_WIDTH }}>
                  <span>{column === 0 ? '01' : String(column + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{column === 0 ? '普通评论与外部素材' : isTrailing ? '继续综合' : `第 ${column} 层综合`}</strong>
                    <small>{column === 0 ? '已采用内容自动置顶' : isTrailing ? '从收藏夹创建下一方向' : `${nodes.length} 个社区方向`}</small>
                  </div>
                </div>
                {isTrailing && nodes.length === 0 && (
                  <button
                    className="async-flow-next-step"
                    style={{ left: x, top: FLOW_START_Y }}
                    disabled={!canParticipate}
                    onClick={openBasket}
                  >
                    <GitBranch />
                    <strong>创建下一条综合评论</strong>
                    <span>收藏或选择至少两条素材，系统会自动生成新的节点和连线。</span>
                    <em>打开收藏夹 <ArrowRight /></em>
                  </button>
                )}
              </div>
            );
          })}

          {positionedNodes.map((node) => {
            const selectedIterations = node.kind === 'synthesis'
              ? selectedVersionsBySynthesis.get(node.sourceId) || []
              : [];
            const selected = node.kind === 'synthesis' && selectedSynthesisIds.has(node.sourceId);
            const relatedEdges = edges.filter((edge) => edge.source.key === node.key || edge.target.key === node.key).length;
            const canLikeComment = node.comment
              && canParticipate;
            return (
              <article
                key={node.key}
                tabIndex={0}
                className={[
                  'async-flow-node',
                  `is-${node.kind}`,
                  node.used ? 'is-used' : '',
                  selected ? 'is-selected-for-build' : '',
                  focusedNode && focusedNode !== node.key ? 'is-dimmed' : '',
                ].filter(Boolean).join(' ')}
                style={{ left: node.x, top: node.y, width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT }}
                onMouseEnter={() => setFocusedNode(node.key)}
                onMouseLeave={() => setFocusedNode('')}
                onFocus={() => setFocusedNode(node.key)}
                onBlur={() => setFocusedNode('')}
              >
                <header>
                  <span className="async-flow-node-type">
                    {node.kind === 'comment' && <MessageCircle />}
                    {node.kind === 'external-comment' && <ShoppingBasket />}
                    {(node.kind === 'external-synthesis' || node.kind === 'synthesis') && <GitMerge />}
                    {node.kind === 'comment'
                      ? node.comment?.target_type === 'synthesis' ? '综合下的讨论' : '普通评论'
                      : node.kind === 'external-comment'
                        ? '跨应用收藏夹素材'
                        : node.kind === 'external-synthesis'
                          ? '跨应用综合'
                          : `第 ${node.column} 层综合`}
                  </span>
                  <small>{node.author} · {formatDate(node.createdAt)}</small>
                </header>
                {node.appTitle !== app.title && <div className="async-flow-app-chip">{node.appTitle}</div>}
                {node.title && <h3>{node.title}</h3>}
                <p>{node.content}</p>
                <footer>
                  <div>
                    {node.used && <span className="async-flow-used"><GitBranch /> 已采用 · {relatedEdges} 条线</span>}
                    {selectedIterations.map((iteration) => (
                      <span className="async-flow-selected" key={iteration}>
                        <Check /> 社区版本 {iteration} 已采用
                      </span>
                    ))}
                    {draftSynthesisId === node.sourceId && (
                      <span className="async-flow-selected"><LoaderCircle /> 正在开发</span>
                    )}
                  </div>
                  <div className="async-flow-node-actions">
                    {node.comment && (
                      <>
                        <button
                          disabled={!canLikeComment}
                          className={node.comment.viewer_liked ? 'is-liked' : ''}
                          onClick={() => action(`flow-like-${node.comment!.id}`, () => communityGalleryApi.likeComment(clientId, node.comment!.id))}
                        ><Heart /> {node.comment.like_count}</button>
                        {node.comment.app_id === app.id && (
                          <button disabled={!canParticipate} onClick={() => setReplyingTo(node.comment!)}><Reply /> 回复</button>
                        )}
                      </>
                    )}
                    {node.kind === 'synthesis' && node.synthesis && (
                      <>
                        <button onClick={() => viewSources(node.synthesis!)}><Link2 /> 来源</button>
                        <button onClick={() => setDiscussionSynthesis(node.synthesis!)}><MessageCircle /> 讨论</button>
                      </>
                    )}
                    {creativeToolsAvailable && (
                      <button
                        className={node.inBasket ? 'is-in-basket' : ''}
                        onClick={() => action(`flow-basket-${node.key}`, () => communityGalleryApi.toggleBasket(clientId, node.sourceType, node.sourceId))}
                      ><ShoppingBasket /> {node.inBasket ? '已收藏' : '收藏'}</button>
                    )}
                    {node.kind === 'synthesis' && node.synthesis && canStartDevelopment && (
                      <button className="is-build" onClick={() => generate(node.synthesis!)}>
                        <Sparkles /> 按入选提示词开发
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}

          {sourceNodes.length === 0 && (
            <div className="async-flow-empty-source" style={{ left: FLOW_START_X, top: FLOW_START_Y }}>
              <MessageCircle /><strong>还没有普通评论</strong><span>发布第一个想法后，节点会出现在这里。</span>
            </div>
          )}
        </div>
      </div>

      <footer className="async-flow-legend">
        <span><i className="is-comment" /> 普通评论</span>
        <span><i className="is-external" /> 跨应用收藏夹素材</span>
        <span><i className="is-synthesis" /> 综合评论</span>
        <span><i className="is-selected" /> 创作者选择开发</span>
      </footer>

      {replyingTo && (
        <div className="async-overlay" role="dialog" aria-modal="true" aria-label="回复评论">
          <section className="async-flow-reply-dialog">
            <header><div><span className="async-eyebrow">回复想法</span><h2>回复 {replyingTo.author_code}</h2></div><button onClick={() => setReplyingTo(null)}><X /></button></header>
            <blockquote>{replyingTo.content}</blockquote>
            <textarea value={replyContent} onChange={(event) => setReplyContent(event.target.value)} rows={4} placeholder="继续补充、追问或发展这个想法…" />
            <button className="async-primary" disabled={!replyContent.trim() || Boolean(busy)} onClick={submitReply}><Send /> 发布回复</button>
          </section>
        </div>
      )}

      {discussionSynthesis && (
        <div className="async-overlay" role="dialog" aria-modal="true" aria-label="综合评论讨论">
          <aside className="async-side-drawer async-flow-discussion-drawer">
            <header>
              <div><span className="async-eyebrow">讨论这个方向</span><h2>{discussionSynthesis.title}</h2></div>
              <button onClick={() => setDiscussionSynthesis(null)}><X /></button>
            </header>
            <p className="async-drawer-intro">{discussionSynthesis.content}</p>
            <CommentThread
              state={state}
              app={app}
              clientId={clientId}
              action={action}
              busy={busy}
              targetType="synthesis"
              targetId={String(discussionSynthesis.id)}
              compact
            />
          </aside>
        </div>
      )}
    </section>
  );
}

type StagedFlowNode = {
  key: string;
  kind: 'comment' | 'reply' | 'external-comment' | 'external-synthesis' | 'synthesis';
  column: 0 | 1 | 2 | 3;
  author: string;
  appId: string;
  appTitle: string;
  title: string;
  content: string;
  createdAt: string;
  sourceType: CommunitySourceType;
  sourceId: number;
  used: boolean;
  inBasket: boolean;
  expandable: boolean;
  width: number;
  height: number;
  indent: number;
  comment?: CommunityComment;
  synthesis?: CommunitySynthesis;
  discussionComments?: CommunityComment[];
};

type PositionedStagedFlowNode = StagedFlowNode & {
  x: number;
  y: number;
};

function IdeaFlowBoard({
  state,
  app,
  clientId,
  action,
  busy,
  openBasket,
  viewSources,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
  openBasket: () => void;
  viewSources: (synthesis: CommunitySynthesis) => void;
}) {
  const [commentContent, setCommentContent] = useState('');
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingFlowComment, setEditingFlowComment] = useState<CommunityComment | null>(null);
  const [editingFlowContent, setEditingFlowContent] = useState('');
  const [editingSynthesis, setEditingSynthesis] = useState<CommunitySynthesis | null>(null);
  const [editingSynthesisContent, setEditingSynthesisContent] = useState('');
  const [discussionSynthesis, setDiscussionSynthesis] = useState<CommunitySynthesis | null>(null);
  const [focusedNode, setFocusedNode] = useState('');
  const [selectionLayer, setSelectionLayer] = useState<1 | 2 | null>(null);
  const [developmentSelectionIteration, setDevelopmentSelectionIteration] = useState<1 | 2 | null>(null);
  const [wildcardSelectionActive, setWildcardSelectionActive] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [departingKeys, setDepartingKeys] = useState<string[]>([]);
  const [synthesisPrompt, setSynthesisPrompt] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [likedBurstKeys, playLikedBurst] = useTimedBurst();
  const selectionAnimationTimers = useRef<number[]>([]);
  const synthesisBasketRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    selectionAnimationTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);
  useEffect(() => {
    if (!selectionLayer && !developmentSelectionIteration) return;
    const frame = window.requestAnimationFrame(() => {
      synthesisBasketRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectionLayer, developmentSelectionIteration]);

  const sourceKey = (type: CommunitySourceType, id: number) => `${type}:${id}`;
  const expandedKeySet = new Set(expandedKeys);
  const isLongContent = (content: string) => (
    content.length > 46 || content.split(/\r?\n/).length > 2
  );
  const canParticipate = Boolean(
    state.viewer && state.viewer.role !== 'host'
      && state.study.status === 'active' && isAppRoundOpen(app),
  );
  const creativeToolsAvailable = canUseCreativeTools(state)
    && state.study.status === 'active' && isAppRoundOpen(app);
  const isOwner = state.viewer?.role === 'creator' && state.viewer.code === app.creator_code;
  const completedIterations = Number(app.community_version_count || 0);
  const openLayer: 1 | 2 | null = completedIterations === 0
    ? 1
    : completedIterations === 1
      ? 2
      : null;
  const showSecondLayer = completedIterations >= 1;
  const developmentBaseVersionId = completedIterations === 0
    ? Number(app.initial_version_id)
    : Number(state.versions.find((version) => (
        version.app_id === app.id
        && version.kind === 'community'
        && Number(version.version_number) === 2
      ))?.id || 0);

  const targetSyntheses = state.syntheses
    .filter((synthesis) => synthesis.target_app_id === app.id)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
  const viewerHasSubmittedCurrentSynthesis = Boolean(
    openLayer && targetSyntheses.some((synthesis) => (
      Number(synthesis.layer) === Number(openLayer)
      && synthesis.author_code === state.viewer?.code
      && !synthesis.is_development_brief
    )),
  );
  const targetSynthesisIds = new Set(targetSyntheses.map((synthesis) => Number(synthesis.id)));
  const targetSources = state.synthesisSources.filter(
    (source) => targetSynthesisIds.has(Number(source.synthesis_id)),
  );
  const usedSourceKeys = new Set(
    targetSources.map((source) => sourceKey(source.source_type, Number(source.source_id))),
  );
  const basketKeys = new Set(
    state.basket.map((item) => sourceKey(item.source_type, Number(item.source_id))),
  );
  const localNormalComments = state.comments.filter(
    (comment) => comment.app_id === app.id && comment.target_type === 'app',
  );
  const localCommentIds = new Set(localNormalComments.map((comment) => Number(comment.id)));
  const childrenByParent = new Map<number, CommunityComment[]>();
  localNormalComments.forEach((comment) => {
    if (!comment.parent_comment_id) return;
    const children = childrenByParent.get(Number(comment.parent_comment_id)) || [];
    children.push(comment);
    childrenByParent.set(Number(comment.parent_comment_id), children);
  });
  childrenByParent.forEach((children) => children.sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
  ));
  const wildcardSourceIds = new Set(
    state.wildcards
      .filter((wildcard) => wildcard.app_id === app.id)
      .map((wildcard) => Number(wildcard.source_id)),
  );

  const commentNode = (
    comment: CommunityComment,
    kind: 'comment' | 'reply',
    _depth: number,
  ): StagedFlowNode => {
    const key = sourceKey('comment', comment.id);
    const expandable = isLongContent(comment.content);
    const expanded = expandable && expandedKeySet.has(key);
    const wildcardExtraHeight = wildcardSourceIds.has(Number(comment.id)) ? 48 : 0;
    return {
      key,
      kind,
      column: comment.version_id
        && Number(comment.version_id) !== Number(app.initial_version_id)
        ? 2
        : 0,
      author: comment.author_code,
      appId: comment.app_id,
      appTitle: app.title,
      title: kind === 'reply' ? `回复 · ${comment.author_code}` : '',
      content: comment.content,
      createdAt: comment.created_at,
      sourceType: 'comment',
      sourceId: Number(comment.id),
      used: usedSourceKeys.has(key) || Boolean(comment.selected_for_iteration),
      inBasket: Boolean(comment.viewer_in_basket),
      expandable,
      width: kind === 'reply' ? FLOW_NODE_WIDTH - 18 : FLOW_NODE_WIDTH,
      height: kind === 'reply'
        ? (expanded ? 190 : expandable ? 146 : 112) + wildcardExtraHeight
        : (expanded ? 224 : expandable ? 178 : FLOW_NODE_HEIGHT) + wildcardExtraHeight,
      indent: kind === 'reply' ? 18 : 0,
      comment,
    };
  };
  const appendReplies = (
    nodes: StagedFlowNode[],
    parentId: number,
    depth: number,
  ) => {
    (childrenByParent.get(parentId) || []).forEach((reply) => {
      nodes.push(commentNode(reply, 'reply', depth));
      appendReplies(nodes, Number(reply.id), depth + 1);
    });
  };
  const rootGroups = localNormalComments
    .filter((comment) => !comment.parent_comment_id || !localCommentIds.has(Number(comment.parent_comment_id)))
    .map((root) => {
      const nodes = [commentNode(root, 'comment', 0)];
      appendReplies(nodes, Number(root.id), 1);
      return {
        nodes,
        used: nodes.some((node) => node.used),
        likes: Math.max(...nodes.map((node) => Number(node.comment?.like_count || 0))),
        createdAt: root.created_at,
      };
    })
    .sort((left, right) => (
      Number(right.used) - Number(left.used)
      || right.likes - left.likes
      || Date.parse(left.createdAt) - Date.parse(right.createdAt)
    ));

  const externalRecords = new Map<string, {
    source_type: CommunitySourceType;
    source_id: number;
    app_id: string;
    app_title: string;
    author_code: string;
    title?: string;
    content: string;
    created_at?: string;
    version_kind?: 'initial' | 'community' | '';
    version_number?: number;
  }>();
  targetSources.forEach((source) => {
    const key = sourceKey(source.source_type, Number(source.source_id));
    const isLocalComment = source.source_type === 'comment'
      && localCommentIds.has(Number(source.source_id));
    const isLocalSynthesis = source.source_type === 'synthesis'
      && targetSynthesisIds.has(Number(source.source_id));
    if (!isLocalComment && !isLocalSynthesis) externalRecords.set(key, source);
  });
  if (selectionLayer) {
    state.basket.forEach((item) => {
      const key = sourceKey(item.source_type, Number(item.source_id));
      const isLocalComment = item.source_type === 'comment'
        && localCommentIds.has(Number(item.source_id));
      const isLocalSynthesis = item.source_type === 'synthesis'
        && targetSynthesisIds.has(Number(item.source_id));
      if (!isLocalComment && !isLocalSynthesis) {
        externalRecords.set(key, { ...item, created_at: item.added_at });
      }
    });
  }
  const externalNodes = [...externalRecords.values()]
    .map<StagedFlowNode>((source) => {
      const sourceSynthesis = source.source_type === 'synthesis'
        ? state.syntheses.find((item) => Number(item.id) === Number(source.source_id))
        : undefined;
      const sourceComment = source.source_type === 'comment'
        ? state.comments.find((item) => Number(item.id) === Number(source.source_id))
        : undefined;
      const sourceExpandable = isLongContent(source.content);
      const sourceExpanded = sourceExpandable
        && expandedKeySet.has(sourceKey(source.source_type, Number(source.source_id)));
      const sourceUsedInSecondRound = targetSources.some((targetSource) => {
        if (
          targetSource.source_type !== source.source_type
          || Number(targetSource.source_id) !== Number(source.source_id)
        ) return false;
        return targetSyntheses.some((synthesis) => (
          Number(synthesis.id) === Number(targetSource.synthesis_id)
          && Number(synthesis.layer) === 2
        ));
      });
      const appearsDuringSecondSelection = selectionLayer === 2
        && basketKeys.has(sourceKey(source.source_type, Number(source.source_id)));
      return {
        key: sourceKey(source.source_type, Number(source.source_id)),
        kind: source.source_type === 'synthesis' ? 'external-synthesis' : 'external-comment',
        column: sourceUsedInSecondRound || appearsDuringSecondSelection || source.version_kind === 'community'
          ? 2
          : source.source_type === 'synthesis'
            ? 1
            : 0,
        author: source.author_code,
        appId: source.app_id,
        appTitle: source.app_title,
        title: source.title || '',
        content: source.content,
        createdAt: source.created_at || '',
        sourceType: source.source_type,
        sourceId: Number(source.source_id),
        used: usedSourceKeys.has(sourceKey(source.source_type, Number(source.source_id))),
        inBasket: basketKeys.has(sourceKey(source.source_type, Number(source.source_id))),
        expandable: sourceExpandable,
        width: FLOW_NODE_WIDTH,
        height: sourceExpanded ? 274 : sourceExpandable ? 218 : 186,
        indent: 0,
        comment: sourceComment,
        synthesis: sourceSynthesis,
      };
    })
    .sort((left, right) => (
      Number(right.used) - Number(left.used)
      || Date.parse(left.createdAt || '0') - Date.parse(right.createdAt || '0')
    ));
  const sourceNodes = [...rootGroups.flatMap((group) => group.nodes), ...externalNodes];
  const synthesisDiscussions = new Map<number, CommunityComment[]>();
  state.comments
    .filter((comment) => (
      comment.target_type === 'synthesis'
      && targetSynthesisIds.has(Number(comment.target_id))
    ))
    .forEach((comment) => {
      const synthesisId = Number(comment.target_id);
      const comments = synthesisDiscussions.get(synthesisId) || [];
      comments.push(comment);
      synthesisDiscussions.set(synthesisId, comments);
    });
  synthesisDiscussions.forEach((comments) => comments.sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
  ));
  const synthesisNodes = targetSyntheses.map<StagedFlowNode>((synthesis) => {
    const key = sourceKey('synthesis', Number(synthesis.id));
    const discussionComments = synthesis.deleted_at
      ? []
      : synthesisDiscussions.get(Number(synthesis.id)) || [];
    const baseHeight = expandedKeySet.has(key)
      ? 270
      : isLongContent(synthesis.content)
        ? 206
        : 170;
    return {
      key,
      kind: 'synthesis',
      column: synthesis.layer === 1 ? 1 : 3,
      author: synthesis.author_code,
      appId: app.id,
      appTitle: app.title,
      title: synthesis.title,
      content: synthesis.content,
      createdAt: synthesis.created_at,
      sourceType: 'synthesis',
      sourceId: Number(synthesis.id),
      used: usedSourceKeys.has(key) || Boolean(synthesis.selected_for_iteration),
      inBasket: Boolean(synthesis.viewer_in_basket),
      expandable: isLongContent(synthesis.content),
      width: FLOW_NODE_WIDTH,
      height: baseHeight + (discussionComments.length
        ? 38
          + Math.min(2, discussionComments.length) * 12
          + (discussionComments.length > 2 ? 12 : 0)
        : 0),
      indent: 0,
      synthesis,
      discussionComments,
    };
  });

  const selectionActive = Boolean(selectionLayer || developmentSelectionIteration || wildcardSelectionActive);
  const selectedKeySet = new Set(selectedKeys);
  const departingKeySet = new Set(departingKeys);
  const allFlowNodes = [...sourceNodes, ...synthesisNodes];
  const visibleDuringSelection = (node: StagedFlowNode) => (
    !selectionActive || !selectedKeySet.has(node.key) || departingKeySet.has(node.key)
  );
  const columns = [
    {
      column: 0 as const,
      nodes: sourceNodes.filter((node) => node.column === 0 && visibleDuringSelection(node)),
    },
    {
      column: 1 as const,
      nodes: allFlowNodes.filter((node) => node.column === 1 && visibleDuringSelection(node)).sort((left, right) => (
        Number(Boolean(right.synthesis?.is_development_brief))
        - Number(Boolean(left.synthesis?.is_development_brief))
        || Number(Boolean(right.synthesis?.selected_for_iteration))
        - Number(Boolean(left.synthesis?.selected_for_iteration))
        || Number(right.synthesis?.vote_count || 0)
        - Number(left.synthesis?.vote_count || 0)
        || Date.parse(left.createdAt) - Date.parse(right.createdAt)
      )),
    },
    ...(showSecondLayer
      ? [
          {
            column: 2 as const,
            nodes: sourceNodes.filter((node) => node.column === 2 && visibleDuringSelection(node)),
          },
          {
            column: 3 as const,
            nodes: synthesisNodes.filter((node) => node.column === 3 && visibleDuringSelection(node)).sort((left, right) => (
              Number(Boolean(right.synthesis?.is_development_brief))
              - Number(Boolean(left.synthesis?.is_development_brief))
              || Number(Boolean(right.synthesis?.selected_for_iteration))
              - Number(Boolean(left.synthesis?.selected_for_iteration))
              || Number(right.synthesis?.vote_count || 0)
              - Number(left.synthesis?.vote_count || 0)
              || Date.parse(left.createdAt) - Date.parse(right.createdAt)
            )),
          },
        ]
      : []),
  ];
  const positionedNodes = columns.flatMap(({ column, nodes }) => {
    let y = FLOW_START_Y;
    return nodes.map<PositionedStagedFlowNode>((node) => {
      const positioned = {
        ...node,
        x: FLOW_START_X
          + column * (FLOW_NODE_WIDTH + FLOW_COLUMN_GAP)
          + node.indent,
        y,
      };
      y += node.height + (node.kind === 'reply' ? 10 : FLOW_ROW_GAP);
      return positioned;
    });
  });
  const positionByKey = new Map(positionedNodes.map((node) => [node.key, node]));
  const edges = targetSources
    .map((source) => {
      const sourceNode = positionByKey.get(
        sourceKey(source.source_type, Number(source.source_id)),
      );
      const targetNode = positionByKey.get(
        sourceKey('synthesis', Number(source.synthesis_id)),
      );
      return sourceNode && targetNode
        ? {
            key: `${source.source_type}:${source.source_id}->${source.synthesis_id}`,
            source: sourceNode,
            target: targetNode,
          }
        : null;
    })
    .filter(Boolean) as Array<{
      key: string;
      source: PositionedStagedFlowNode;
      target: PositionedStagedFlowNode;
    }>;
  const columnCount = columns.length;
  const canvasWidth = FLOW_START_X * 2
    + columnCount * FLOW_NODE_WIDTH
    + (columnCount - 1) * FLOW_COLUMN_GAP;
  const currentCommentColumn: 0 | 2 = completedIterations >= 1 ? 2 : 0;
  const currentCommentColumnNodes = positionedNodes.filter(
    (node) => node.column === currentCommentColumn,
  );
  const currentCommentEntryTop = currentCommentColumnNodes.length
    ? Math.max(...currentCommentColumnNodes.map((node) => node.y + node.height)) + 20
    : FLOW_START_Y;
  const currentCommentEntryHeight = commentComposerOpen ? 230 : 164;
  const showCommentEntry = canParticipate && !isOwner && !selectionActive;
  const canvasHeight = Math.max(
    440,
    showCommentEntry ? currentCommentEntryTop + currentCommentEntryHeight + 36 : 0,
    ...columns.map(({ column }) => {
      const nodes = positionedNodes.filter((node) => node.column === column);
      const last = nodes[nodes.length - 1];
      return last ? last.y + last.height + 36 : FLOW_START_Y + 230;
    }),
  );

  const eligibleForLayer = (node: StagedFlowNode, layer: 1 | 2) => {
    if (node.comment?.deleted_at || node.synthesis?.deleted_at) return false;
    if (node.synthesis?.is_development_brief) return false;
    if (layer === 1) return node.sourceType === 'comment';
    if (node.sourceType === 'comment') return true;
    return node.synthesis?.layer === 1;
  };
  const eligibleForDevelopment = (node: StagedFlowNode) => {
    if (!developmentSelectionIteration || node.appId !== app.id) return false;
    if (node.comment?.deleted_at || node.synthesis?.deleted_at || node.synthesis?.is_development_brief) return false;
    if (node.sourceType === 'comment') {
      return Number(node.comment?.version_id || 0) === developmentBaseVersionId;
    }
    return Number(node.synthesis?.layer || 0) === developmentSelectionIteration
      && Number(node.synthesis?.target_version_id || 0) === developmentBaseVersionId;
  };
  const eligibleForWildcard = (node: StagedFlowNode) => (
    wildcardSelectionActive
    && node.appId === app.id
    && node.sourceType === 'comment'
    && node.comment?.target_type === 'app'
    && !node.comment.deleted_at
    && Number(node.comment.version_id || 0) === developmentBaseVersionId
  );
  const scheduleSelectionAnimation = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    selectionAnimationTimers.current.push(timer);
  };
  const selectSource = (node: StagedFlowNode) => {
    if (wildcardSelectionActive) {
      if (!eligibleForWildcard(node)) return;
      void action(`use-wildcard-${node.sourceId}`, async () => {
        const next = await communityGalleryApi.useWildcard(clientId, app.id, node.sourceId);
        setWildcardSelectionActive(false);
        return next;
      });
      return;
    }
    const eligible = selectionLayer
      ? eligibleForLayer(node, selectionLayer)
      : eligibleForDevelopment(node);
    if (!eligible) return;
    if (selectedKeySet.has(node.key)) return;
    setSelectedKeys((current) => {
      if (current.includes(node.key)) return current;
      return [...current, node.key];
    });
    setDepartingKeys((current) => (
      current.includes(node.key) ? current : [...current, node.key]
    ));
    const sourceContent = node.content.trim();
    if (sourceContent) {
      setSynthesisPrompt((current) => (
        current.trim() ? `${current.trim()}\n\n${sourceContent}` : sourceContent
      ));
    }
    scheduleSelectionAnimation(() => {
      setDepartingKeys((current) => current.filter((key) => key !== node.key));
    }, 620);
  };
  const selectedNodes = selectedKeys
    .map((key) => allFlowNodes.find((node) => node.key === key))
    .filter(Boolean) as StagedFlowNode[];
  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  };
  const startSelection = (layer: 1 | 2) => {
    if (isOwner || viewerHasSubmittedCurrentSynthesis) return;
    setCommentComposerOpen(false);
    setWildcardSelectionActive(false);
    setDevelopmentSelectionIteration(null);
    setSelectionLayer(layer);
    setSelectedKeys([]);
    setDepartingKeys([]);
    setSynthesisPrompt('');
  };
  const startDevelopmentSelection = () => {
    if (!openLayer) return;
    setCommentComposerOpen(false);
    setWildcardSelectionActive(false);
    setSelectionLayer(null);
    setDevelopmentSelectionIteration(openLayer);
    setSelectedKeys([]);
    setDepartingKeys([]);
    setSynthesisPrompt('');
  };
  const cancelSelection = () => {
    setSelectionLayer(null);
    setDevelopmentSelectionIteration(null);
    setSelectedKeys([]);
    setDepartingKeys([]);
    setSynthesisPrompt('');
    setWildcardSelectionActive(false);
  };
  const publishSynthesis = async () => {
    if (!selectionLayer) return;
    const cleanPrompt = synthesisPrompt.trim();
    const firstLine = cleanPrompt.split(/\r?\n/).find(Boolean) || cleanPrompt;
    await action(`publish-layer-${selectionLayer}-synthesis`, async () => {
      const next = await communityGalleryApi.createSynthesis(clientId, {
        targetAppId: app.id,
        title: firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine,
        content: cleanPrompt,
        sources: selectedNodes.map((node) => ({
          type: node.sourceType,
          id: node.sourceId,
        })),
      });
      cancelSelection();
      return next;
    });
  };
  const generateSelectedDevelopment = async () => {
    if (!developmentSelectionIteration) return;
    await action(`generate-community-${developmentSelectionIteration}`, async () => {
      const next = await communityGalleryApi.generateCommunity(
        clientId,
        app.id,
        selectedNodes.map((node) => ({ type: node.sourceType, id: node.sourceId })),
        synthesisPrompt,
        developmentBaseVersionId,
      );
      cancelSelection();
      return next;
    });
  };

  const hasRunningGeneration = state.generationJobs.some(
    (job) => job.app_id === app.id && job.status === 'running',
  );
  const hasActiveDraft = app.draft_kind === 'community'
    && Number(app.draft_iteration_number || 0) > completedIterations
    && Boolean(app.draft_code);
  const canStartDevelopment = isOwner
    && completedIterations < 2
    && !hasRunningGeneration
    && !hasActiveDraft;
  const hasSelectableDevelopmentSource = state.comments.some((comment) => (
    comment.app_id === app.id
    && !comment.deleted_at
    && Number(comment.version_id) === developmentBaseVersionId
  )) || state.syntheses.some((synthesis) => (
    synthesis.target_app_id === app.id
    && !synthesis.deleted_at
    && !synthesis.is_development_brief
    && Number(synthesis.layer) === completedIterations + 1
    && Number(synthesis.target_version_id || 0) === developmentBaseVersionId
  ));
  const ownWildcard = state.wildcards.find((wildcard) => (
    wildcard.creator_code === state.viewer?.code
  ));
  const wildcardStageIsOpen = openLayer === 1
    ? app.flow_stage === 'round_1'
    : openLayer === 2
      ? app.flow_stage === 'round_2'
      : false;
  const canUseWildcard = isOwner
    && Boolean(openLayer)
    && !ownWildcard
    && wildcardStageIsOpen
    && !selectionActive;

  const submitComment = async () => {
    await action('flow-comment', async () => {
      const next = await communityGalleryApi.comment(clientId, {
        appId: app.id,
        content: commentContent,
      });
      setCommentContent('');
      setCommentComposerOpen(false);
      return next;
    });
  };
  const submitReply = async () => {
    if (!replyingTo) return;
    await action(`flow-reply-${replyingTo.id}`, async () => {
      const next = await communityGalleryApi.comment(clientId, {
        appId: replyingTo.app_id,
        content: replyContent,
        parentCommentId: replyingTo.id,
        targetType: replyingTo.target_type,
        targetId: replyingTo.target_id,
      });
      setReplyContent('');
      setReplyingTo(null);
      return next;
    });
  };
  const startEditingFlowComment = (comment: CommunityComment) => {
    setEditingFlowComment(comment);
    setEditingFlowContent(comment.content);
    setReplyingTo(null);
  };
  const saveFlowCommentEdit = async () => {
    if (!editingFlowComment) return;
    await action(`flow-edit-${editingFlowComment.id}`, async () => {
      const next = await communityGalleryApi.editComment(
        clientId,
        editingFlowComment.id,
        editingFlowContent,
      );
      setEditingFlowComment(null);
      setEditingFlowContent('');
      return next;
    });
  };
  const removeFlowComment = (comment: CommunityComment) => {
    const confirmed = window.confirm(
      '确定删除这条评论吗？删除后不能恢复；如果它已有回复或被用于综合，系统会保留一个内容占位以维持创意关系。',
    );
    if (!confirmed) return;
    void action(`flow-delete-${comment.id}`, async () => {
      const next = await communityGalleryApi.deleteComment(clientId, comment.id);
      setSelectedKeys((current) => current.filter((key) => key !== sourceKey('comment', comment.id)));
      setEditingFlowComment(null);
      setEditingFlowContent('');
      return next;
    });
  };
  const startEditingSynthesis = (synthesis: CommunitySynthesis) => {
    setEditingSynthesis(synthesis);
    setEditingSynthesisContent(synthesis.content);
    setDiscussionSynthesis(null);
  };
  const saveSynthesisEdit = async () => {
    if (!editingSynthesis) return;
    await action(`edit-synthesis-${editingSynthesis.id}`, async () => {
      const next = await communityGalleryApi.editSynthesis(
        clientId,
        editingSynthesis.id,
        editingSynthesisContent,
      );
      setEditingSynthesis(null);
      setEditingSynthesisContent('');
      return next;
    });
  };
  const removeSynthesis = (synthesis: CommunitySynthesis) => {
    const confirmed = window.confirm(
      '确定删除这条综合评论吗？删除后不能恢复；如果它已被下一轮综合或开发采用，系统会保留一个内容占位以维持创意关系。',
    );
    if (!confirmed) return;
    void action(`delete-synthesis-${synthesis.id}`, async () => {
      const next = await communityGalleryApi.deleteSynthesis(clientId, synthesis.id);
      setSelectedKeys((current) => current.filter(
        (key) => key !== sourceKey('synthesis', synthesis.id),
      ));
      setEditingSynthesis(null);
      setEditingSynthesisContent('');
      setDiscussionSynthesis(null);
      return next;
    });
  };
  const stop = (event: React.MouseEvent) => event.stopPropagation();
  const activeSelectionIteration = selectionLayer || developmentSelectionIteration;
  const isDevelopmentSelection = Boolean(developmentSelectionIteration);

  return (
    <section className="async-flow-section">
      <header className="async-flow-heading">
        <div>
          <span className="async-eyebrow">分阶段集体创作</span>
          <h2>创意演化画布</h2>
          <p>普通评论和综合评论都可以随时点赞或取消赞；主持人锁定本轮点赞后，会按点赞数加权随机抽取并立即启动开发。</p>
        </div>
        <div className="async-flow-heading-actions">
          <span><Workflow /> {edges.length} 条采用连线</span>
          {canUseWildcard && (
            <button
              className="async-primary async-development-start"
              disabled={Boolean(busy)}
              title="使用一次性万能卡，指定一条当前版本的普通评论进入本轮开发"
              onClick={() => {
                setCommentComposerOpen(false);
                setSelectionLayer(null);
                setDevelopmentSelectionIteration(null);
                setSelectedKeys([]);
                setDepartingKeys([]);
                setWildcardSelectionActive(true);
              }}
            ><Sparkles /> 使用万能卡</button>
          )}
          {isOwner && ownWildcard && (
            <span className="async-wildcard-status"><Check /> 万能卡已用于第 {ownWildcard.iteration_number} 轮</span>
          )}
          {canParticipate && (
            <button onClick={openBasket}>
              <ShoppingBasket /> 收藏夹 <strong>{state.basket.length}</strong>
            </button>
          )}
        </div>
      </header>

      {!isAppRoundOpen(app) && (
        <div className="async-app-flow-notice">
          <Workflow />
          <div><strong>{appFlowStatusText(app)}</strong><span>当前 App 的评论和综合入口已暂停，由 Host 单独推进流程。</span></div>
        </div>
      )}

      <VersionLineage state={state} app={app} />

      {wildcardSelectionActive && (
        <div className="async-wildcard-picker-note">
          <span><Sparkles /> 点击当前版本的一条普通评论，使用万能卡保证它进入本轮开发。</span>
          <button onClick={() => setWildcardSelectionActive(false)}><X /> 取消</button>
        </div>
      )}

      <div className="async-flow-scroll">
        <div className="async-flow-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
          <svg className="async-flow-edges" width={canvasWidth} height={canvasHeight} aria-hidden="true">
            {edges.map((edge) => {
              const active = focusedNode === edge.source.key || focusedNode === edge.target.key;
              const path = flowLink({
                source: {
                  x: edge.source.x + edge.source.width,
                  y: edge.source.y + edge.source.height / 2,
                },
                target: {
                  x: edge.target.x,
                  y: edge.target.y + edge.target.height / 2,
                },
              }) || '';
              return <path key={edge.key} className={active ? 'is-active' : ''} d={path} />;
            })}
          </svg>

          {columns.map(({ column, nodes }) => {
            const x = FLOW_START_X + column * (FLOW_NODE_WIDTH + FLOW_COLUMN_GAP);
            const layer = column === 1 ? 1 : column === 3 ? 2 : null;
            const layerIsOpen = layer && openLayer === layer;
            return (
              <div key={column}>
                <div className="async-flow-column-heading" style={{ left: x, width: FLOW_NODE_WIDTH }}>
                  <span>{String(column + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{column === 0
                      ? '第一轮评论与采用来源'
                      : column === 1
                        ? '第一次综合'
                        : column === 2
                          ? '第二轮评论与采用来源'
                          : '第二次综合'}</strong>
                    <small>{column === 0
                      ? selectionLayer === 1 || developmentSelectionIteration === 1
                        ? '可选择 Initial 评论及收藏夹来源'
                        : '初始版本下产生的评论与第一轮外部来源'
                      : column === 1
                        ? `${nodes.length} 个第一次综合评论 · 按点赞数排序`
                        : column === 2
                          ? selectionLayer === 2 || developmentSelectionIteration === 2
                            ? '社区版本 1 的新评论及本轮收藏夹来源，可与前两列共同选用'
                            : '社区版本 1 下产生的新评论与第二轮外部来源'
                          : `${nodes.length} 个第二次综合评论 · 按点赞数排序`}</small>
                  </div>
                </div>
                {column === currentCommentColumn && showCommentEntry && (
                  commentComposerOpen ? (
                    <section
                      className="async-flow-comment-entry"
                      style={{ left: x, top: currentCommentEntryTop }}
                    >
                      <header>
                        <span><MessageCircle /></span>
                        <div>
                          <strong>{completedIterations >= 1
                            ? '针对社区版本 1 提出普通评论'
                            : '针对初始版本提出普通评论'}</strong>
                          <small>发布后会成为本列中的一张普通评论卡片</small>
                        </div>
                        <button
                          aria-label="关闭普通评论输入"
                          onClick={() => {
                            setCommentComposerOpen(false);
                            setCommentContent('');
                          }}
                        ><X /></button>
                      </header>
                      <textarea
                        aria-label="普通评论内容"
                        value={commentContent}
                        onChange={(event) => setCommentContent(event.target.value)}
                        rows={5}
                        maxLength={3000}
                        placeholder="分享体验、建议、技术细节或新的使用场景…"
                      />
                      <footer>
                        <span>{commentContent.length} / 3000</span>
                        <button
                          className="async-primary"
                          disabled={!commentContent.trim() || Boolean(busy)}
                          onClick={submitComment}
                        ><Send /> 发布普通评论</button>
                      </footer>
                    </section>
                  ) : (
                    <button
                      className="async-flow-next-step is-stage-action is-comment-action"
                      style={{ left: x, top: currentCommentEntryTop }}
                      onClick={() => setCommentComposerOpen(true)}
                    >
                      <MessageCircle />
                      <strong>{completedIterations >= 1
                        ? '针对社区版本 1 提出普通评论'
                        : '针对初始版本提出普通评论'}</strong>
                      <span>分享体验、建议、技术细节或新的使用场景。</span>
                      <em><span>开始输入</span> <ArrowRight /></em>
                    </button>
                  )
                )}
                {layerIsOpen && !selectionActive && !isOwner && (
                  <button
                    className="async-flow-next-step is-stage-action"
                    style={{ left: x, top: nodes.length
                      ? Math.max(...positionedNodes.filter((node) => node.column === column).map((node) => node.y + node.height)) + 20
                      : FLOW_START_Y }}
                    disabled={!creativeToolsAvailable || viewerHasSubmittedCurrentSynthesis}
                    onClick={() => startSelection(layer)}
                  >
                    {viewerHasSubmittedCurrentSynthesis ? <Check /> : <GitMerge />}
                    <strong>{viewerHasSubmittedCurrentSynthesis
                      ? `你已提交第 ${layer} 次综合评论`
                      : `创建第 ${layer} 次综合评论`}</strong>
                    <span>{viewerHasSubmittedCurrentSynthesis
                      ? '每个人在当前应用的本轮只能提交一条；你仍可给其他综合评论点赞。'
                      : layer === 1
                        ? '可以选择一条或任意多条普通评论、回复和收藏夹评论。'
                        : '可以从前三列选择一条或任意多条评论、第一次综合。'}</span>
                    <em>{viewerHasSubmittedCurrentSynthesis
                      ? '等待社区点赞'
                      : <><span>开始选择</span> <ArrowRight /></>}</em>
                  </button>
                )}
              </div>
            );
          })}

          {positionedNodes.map((node) => {
            const selectable = Boolean(
              eligibleForWildcard(node)
              || (selectionLayer && eligibleForLayer(node, selectionLayer))
              || (!selectionLayer && developmentSelectionIteration && eligibleForDevelopment(node)),
            );
            const sourceSelected = selectedKeySet.has(node.key);
            const selectedByWildcard = node.sourceType === 'comment' && state.wildcards.some((wildcard) => (
              wildcard.app_id === app.id && Number(wildcard.source_id) === node.sourceId
            ));
            const contentExpanded = expandedKeySet.has(node.key);
            const outgoingSynthesisCount = edges.filter(
              (edge) => edge.source.key === node.key,
            ).length;
            const synthesisIdeaCount = node.synthesis
              ? Number(node.synthesis.source_count || 0)
              : 0;
            const discussionPreview = node.discussionComments?.slice(-2) || [];
            const canLikeComment = node.comment
              && !node.comment.deleted_at
              && canParticipate;
            const canLikeSynthesis = Boolean(
              node.synthesis
              && !node.synthesis.is_development_brief
              && node.synthesis.viewer_vote_available
              && canParticipate,
            );
            return (
              <article
                key={node.key}
                data-source-type={node.sourceType}
                data-source-id={node.sourceId}
                tabIndex={selectable ? 0 : undefined}
                className={[
                  'async-flow-node',
                  `is-${node.kind}`,
                  node.used ? 'is-used' : '',
                  node.synthesis?.is_development_brief ? 'is-creator-development-brief' : '',
                  selectable ? 'is-selectable-source' : '',
                  sourceSelected ? 'is-source-selected' : '',
                  selectedByWildcard ? 'is-wildcard-selected' : '',
                  departingKeySet.has(node.key) ? 'is-source-departing' : '',
                  node.expandable ? 'has-expandable-content' : '',
                  contentExpanded ? 'is-content-expanded' : '',
                  node.comment?.deleted_at || node.synthesis?.deleted_at ? 'is-deleted' : '',
                  focusedNode && focusedNode !== node.key ? 'is-dimmed' : '',
                ].filter(Boolean).join(' ')}
                style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                onClick={() => selectSource(node)}
                onKeyDown={(event) => {
                  if (!selectable || (event.key !== 'Enter' && event.key !== ' ')) return;
                  event.preventDefault();
                  selectSource(node);
                }}
                onMouseEnter={() => setFocusedNode(node.key)}
                onMouseLeave={() => setFocusedNode('')}
                onFocus={() => setFocusedNode(node.key)}
                onBlur={() => setFocusedNode('')}
              >
                <header>
                  <span className="async-flow-node-type">
                    {(node.kind === 'comment' || node.kind === 'reply') && <MessageCircle />}
                    {node.kind === 'external-comment' && <ShoppingBasket />}
                    {(node.kind === 'external-synthesis' || node.kind === 'synthesis') && <GitMerge />}
                    {node.synthesis?.is_development_brief
                      ? '创作者开发方向'
                      : node.kind === 'comment'
                      ? '普通评论'
                      : node.kind === 'reply'
                        ? '回复'
                        : node.kind === 'external-comment'
                          ? '跨应用收藏夹评论'
                          : node.kind === 'external-synthesis'
                            ? '跨应用第一次综合'
                            : `第 ${node.synthesis?.layer} 次综合评论`}
                  </span>
                  <small>
                    {node.author} · {formatDate(node.createdAt)}
                    {(node.comment
                      && !node.comment.deleted_at
                      && node.comment.updated_at !== node.comment.created_at)
                      || (node.synthesis
                        && !node.synthesis.deleted_at
                        && node.synthesis.updated_at !== node.synthesis.created_at)
                      ? ' · 已编辑'
                      : ''}
                  </small>
                </header>
                {likedBurstKeys.includes(node.key) && <CommentFeedbackBurst kind="like" />}
                {departingKeySet.has(node.key) && <CommentFeedbackBurst kind="synthesis" />}
                {sourceSelected && <span className="async-source-selected-badge"><Heart fill="currentColor" /> 已放入综合篮</span>}
                {wildcardSelectionActive && eligibleForWildcard(node) && (
                  <span className="async-source-selected-badge is-wildcard"><Sparkles /> 可用万能卡指定</span>
                )}
                {selectedByWildcard && (
                  <div className="async-wildcard-card-note">
                    <Sparkles />
                    <span>创作者很喜欢这个想法，使用了万能卡将它纳入开发。</span>
                  </div>
                )}
                {node.appTitle !== app.title && <div className="async-flow-app-chip">{node.appTitle}</div>}
                {node.title && node.kind !== 'reply' && <h3>{node.title}</h3>}
                <p>{node.content}</p>
                {node.expandable && (
                  <button
                    className="async-flow-content-toggle"
                    onClick={(event) => {
                      stop(event);
                      toggleExpanded(node.key);
                    }}
                  >
                    {contentExpanded ? <ChevronUp /> : <ChevronDown />}
                    {contentExpanded ? '收起内容' : '展开内容'}
                  </button>
                )}
                {node.synthesis && discussionPreview.length > 0 && (
                  <section className="async-synthesis-discussion-preview">
                    <header>
                      <span><MessageCircle /> 社区讨论</span>
                      <em>{node.discussionComments?.length || 0} 条</em>
                    </header>
                    <div>
                      {discussionPreview.map((comment) => (
                        <p key={comment.id}>
                          <strong>{comment.author_code}</strong>
                          <span>{comment.content}</span>
                        </p>
                      ))}
                    </div>
                    {(node.discussionComments?.length || 0) > discussionPreview.length && (
                      <small>还有 {(node.discussionComments?.length || 0) - discussionPreview.length} 条讨论</small>
                    )}
                  </section>
                )}
                <footer>
                  <div>
                    {node.synthesis && synthesisIdeaCount > 0 && (
                      <span className="async-flow-used">
                        <Lightbulb /> 综合了 {synthesisIdeaCount} 个想法
                      </span>
                    )}
                    {!node.synthesis && node.used && outgoingSynthesisCount > 0 && (
                      <span className="async-flow-used">
                        <GitBranch /> 被综合 {outgoingSynthesisCount} 次
                      </span>
                    )}
                  </div>
                  <div className="async-flow-node-actions">
                    {node.comment && !node.comment.deleted_at && (
                      <>
                        {node.comment.author_code === state.viewer?.code && canParticipate && (
                          <>
                            <button
                              onClick={(event) => {
                                stop(event);
                                startEditingFlowComment(node.comment!);
                              }}
                            ><Pencil /> 编辑</button>
                            <button
                              onClick={(event) => {
                                stop(event);
                                removeFlowComment(node.comment!);
                              }}
                            ><Trash2 /> 删除</button>
                          </>
                        )}
                        <button
                          disabled={!canLikeComment}
                          className={node.comment.viewer_liked ? 'is-liked' : ''}
                          onClick={(event) => {
                            stop(event);
                            if (!node.comment!.viewer_liked) playLikedBurst(node.key);
                            void action(`flow-like-${node.comment!.id}`, () => (
                              communityGalleryApi.likeComment(clientId, node.comment!.id)
                            ));
                          }}
                        ><Heart fill={node.comment.viewer_liked ? 'currentColor' : 'none'} /> {node.comment.like_count}</button>
                        {node.comment.app_id === app.id && !isOwner && (
                          <button
                            disabled={!canParticipate}
                            onClick={(event) => {
                              stop(event);
                              setReplyingTo(node.comment!);
                            }}
                          ><Reply /> 回复</button>
                        )}
                      </>
                    )}
                    {node.synthesis && (
                      <>
                        {!node.synthesis.deleted_at
                          && !node.synthesis.is_development_brief
                          && node.synthesis.author_code === state.viewer?.code
                          && canParticipate && (
                          <>
                            <button
                              onClick={(event) => {
                                stop(event);
                                startEditingSynthesis(node.synthesis!);
                              }}
                            ><Pencil /> 编辑</button>
                            <button
                              onClick={(event) => {
                                stop(event);
                                removeSynthesis(node.synthesis!);
                              }}
                            ><Trash2 /> 删除</button>
                          </>
                        )}
                        <button onClick={(event) => { stop(event); viewSources(node.synthesis!); }}><Link2 /> 来源</button>
                        {node.kind === 'synthesis' && !node.synthesis.deleted_at && !node.synthesis.is_development_brief && (
                          <button onClick={(event) => { stop(event); setDiscussionSynthesis(node.synthesis!); }}><MessageCircle /> 讨论</button>
                        )}
                        {!node.synthesis.deleted_at && !node.synthesis.is_development_brief && (
                          <button
                            className={node.synthesis.viewer_voted ? 'is-liked' : ''}
                            disabled={!canLikeSynthesis || Boolean(busy)}
                            onClick={(event) => {
                              stop(event);
                              if (!node.synthesis!.viewer_voted) playLikedBurst(node.key);
                              void action(`vote-synthesis-${node.synthesis!.id}`, () => (
                                communityGalleryApi.voteForSynthesis(clientId, node.synthesis!.id)
                              ));
                            }}
                          ><Heart fill={node.synthesis.viewer_voted ? 'currentColor' : 'none'} /> {node.synthesis.vote_count}</button>
                        )}
                      </>
                    )}
                    {creativeToolsAvailable
                      && (!node.comment || !node.comment.deleted_at)
                      && (!node.synthesis || !node.synthesis.deleted_at) && (
                      <button
                        className={node.inBasket ? 'is-in-basket' : ''}
                        onClick={(event) => {
                          stop(event);
                          void action(`flow-basket-${node.key}`, () => (
                            communityGalleryApi.toggleBasket(clientId, node.sourceType, node.sourceId)
                          ));
                        }}
                      ><ShoppingBasket /> {node.inBasket ? '已收藏' : '收藏'}</button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}

          {sourceNodes.length === 0 && !showCommentEntry && (
            <div className="async-flow-empty-source" style={{ left: FLOW_START_X, top: FLOW_START_Y }}>
              <MessageCircle />
              <strong>{state.study.status === 'setup' ? '等待主持人开始' : '还没有普通评论'}</strong>
              <span>{state.study.status === 'setup'
                ? '主持人点击开始后，大家才能在应用中发表评论。'
                : '发布第一个想法后，节点会出现在这里。'}</span>
            </div>
          )}
        </div>
      </div>

      {activeSelectionIteration && (
        <section ref={synthesisBasketRef} className="async-synthesis-basket-workbench">
          <header>
            <div>
              <span>{isDevelopmentSelection
                ? `第 ${activeSelectionIteration} 次开发 · 直接添加评论`
                : `第 ${activeSelectionIteration} 次综合 · 直接添加评论`}</span>
              <strong>{isDevelopmentSelection
                ? '点击一条评论，立即追加到下方开发提示词'
                : '点击一条评论，立即追加到下方融合的评论'}</strong>
              <small>
                {isDevelopmentSelection
                  ? '可添加当前版本的评论或本轮综合评论，包括你自己的内容；可继续点击更多评论，按点击顺序追加。'
                  : '每次点击一条评论，其内容会立即追加到下方；可继续点击更多评论，按点击顺序追加。'}
              </small>
            </div>
            <button className="async-secondary" onClick={cancelSelection}><X /> {isDevelopmentSelection ? '取消开发选择' : '取消综合'}</button>
          </header>

          <div className="async-synthesis-basket-prompt is-direct-entry">
            <label>
              <span>{isDevelopmentSelection ? '开发提示词' : '融合的评论'}</span>
              <strong>{selectedNodes.length
                ? `已加入 ${selectedNodes.length} 条评论。你仍可继续点击画布中的评论；每条内容会直接追加到此处。`
                : '请先点击画布中的一条评论，它的内容会立即出现在这里。'}</strong>
              <textarea
                value={synthesisPrompt}
                onChange={(event) => setSynthesisPrompt(event.target.value)}
                rows={5}
                placeholder={isDevelopmentSelection
                  ? '点击画布中的评论后，在这里补充可以直接交给 AI 实现的开发提示词…'
                  : '点击画布中的评论后，在这里继续编辑融合后的评论…'}
              />
            </label>
            <div>
              <small>每条评论只会加入一次，系统会保留完整贡献来源。</small>
              <button
                className="async-primary"
                disabled={!selectedNodes.length || !synthesisPrompt.trim() || Boolean(busy)}
                onClick={isDevelopmentSelection ? generateSelectedDevelopment : publishSynthesis}
              >{isDevelopmentSelection
                ? <><Code2 /> {busy.startsWith('generate-community') ? 'AI 正在开发…' : `开始开发社区版本 ${activeSelectionIteration}`}</>
                : <><GitMerge /> 发布综合评论</>}</button>
            </div>
          </div>
        </section>
      )}

      <footer className="async-flow-legend">
        <span><i className="is-comment" /> 普通评论与回复</span>
        <span><i className="is-external" /> 跨应用收藏夹素材</span>
        <span><i className="is-synthesis" /> 综合评论</span>
        <span><i className="is-selected" /> 创作者选择的开发方向</span>
      </footer>

      {replyingTo && (
        <div className="async-overlay" role="dialog" aria-modal="true" aria-label="回复评论">
          <section className="async-flow-reply-dialog">
            <header><div><span className="async-eyebrow">回复想法</span><h2>回复 {replyingTo.author_code}</h2></div><button onClick={() => setReplyingTo(null)}><X /></button></header>
            <blockquote>{replyingTo.content}</blockquote>
            <textarea value={replyContent} onChange={(event) => setReplyContent(event.target.value)} rows={4} placeholder="继续补充、追问或发展这个想法…" />
            <button className="async-primary" disabled={!replyContent.trim() || Boolean(busy)} onClick={submitReply}><Send /> 发布回复</button>
          </section>
        </div>
      )}

      {editingFlowComment && (
        <div className="async-overlay" role="dialog" aria-modal="true" aria-label="编辑评论">
          <section className="async-flow-reply-dialog async-flow-edit-dialog">
            <header>
              <div><span className="async-eyebrow">编辑评论</span><h2>编辑自己的评论</h2></div>
              <button onClick={() => setEditingFlowComment(null)}><X /></button>
            </header>
            <textarea
              value={editingFlowContent}
              onChange={(event) => setEditingFlowContent(event.target.value)}
              rows={5}
              maxLength={3000}
              autoFocus
            />
            <div className="async-flow-dialog-actions">
              <span>{editingFlowContent.length}/3000</span>
              <button
                className="async-secondary"
                onClick={() => {
                  setEditingFlowComment(null);
                  setEditingFlowContent('');
                }}
              >取消</button>
              <button
                className="async-primary"
                disabled={!editingFlowContent.trim() || Boolean(busy)}
                onClick={() => void saveFlowCommentEdit()}
              ><Check /> 保存修改</button>
            </div>
          </section>
        </div>
      )}

      {editingSynthesis && (
        <div className="async-overlay" role="dialog" aria-modal="true" aria-label="编辑综合评论">
          <section className="async-flow-reply-dialog async-flow-edit-dialog">
            <header>
              <div><span className="async-eyebrow">编辑综合评论</span><h2>编辑自己的综合评论</h2></div>
              <button onClick={() => setEditingSynthesis(null)}><X /></button>
            </header>
            <p className="async-dialog-guidance">
              修改完整提示词后，卡片标题会自动使用新的第一行。已有来源和创意连线保持不变。
            </p>
            <textarea
              value={editingSynthesisContent}
              onChange={(event) => setEditingSynthesisContent(event.target.value)}
              rows={7}
              maxLength={3000}
              autoFocus
            />
            <div className="async-flow-dialog-actions">
              <span>{editingSynthesisContent.length}/3000</span>
              <button
                className="async-secondary"
                onClick={() => {
                  setEditingSynthesis(null);
                  setEditingSynthesisContent('');
                }}
              >取消</button>
              <button
                className="async-primary"
                disabled={!editingSynthesisContent.trim() || Boolean(busy)}
                onClick={() => void saveSynthesisEdit()}
              ><Check /> 保存修改</button>
            </div>
          </section>
        </div>
      )}

      {discussionSynthesis && (
        <div className="async-overlay" role="dialog" aria-modal="true" aria-label="综合评论讨论">
          <aside className="async-side-drawer async-flow-discussion-drawer">
            <header>
              <div><span className="async-eyebrow">讨论这个方向</span><h2>{discussionSynthesis.title}</h2></div>
              <button onClick={() => setDiscussionSynthesis(null)}><X /></button>
            </header>
            <p className="async-drawer-intro">{discussionSynthesis.content}</p>
            <CommentThread
              state={state}
              app={app}
              clientId={clientId}
              action={action}
              busy={busy}
              targetType="synthesis"
              targetId={String(discussionSynthesis.id)}
              compact
            />
          </aside>
        </div>
      )}
    </section>
  );
}

function SynthesisCard({
  state,
  app,
  synthesis,
  clientId,
  action,
  busy,
  viewSources,
  generate,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  synthesis: CommunitySynthesis;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
  viewSources: () => void;
  generate: () => void;
}) {
  const isOwner = state.viewer?.role === 'creator' && state.viewer.code === app.creator_code;
  const canGenerate = isOwner && !app.community_version_id && state.study.status === 'active';
  return (
    <article className="async-synthesis-card">
      <header><span><GitMerge /></span><div><strong>{synthesis.title}</strong><small>{synthesis.author_code} · {formatDate(synthesis.created_at)}</small></div></header>
      <p>{synthesis.content}</p>
      <div className="async-synthesis-meta">
        <span>{synthesis.source_count} 条素材</span>
        <span>{synthesis.source_app_count} 个应用</span>
        <span>{synthesis.contributor_count} 位贡献者</span>
      </div>
      <footer>
        <button onClick={viewSources}><Link2 /> 查看来源</button>
        {canUseCreativeTools(state) && state.viewer?.role !== 'host' && state.study.status === 'active' && (
          <button
            className={synthesis.viewer_in_basket ? 'is-in-basket' : ''}
            onClick={() => action(`basket-synthesis-${synthesis.id}`, () => communityGalleryApi.toggleBasket(clientId, 'synthesis', synthesis.id))}
          ><ShoppingBasket /> {synthesis.viewer_in_basket ? '已收藏' : '收藏'}</button>
        )}
        {canGenerate && <button className="is-generate" onClick={generate}><Sparkles /> 生成社区版本</button>}
      </footer>
      <details>
        <summary>继续讨论这条综合评论</summary>
        <CommentThread
          state={state}
          app={app}
          clientId={clientId}
          action={action}
          busy={busy}
          targetType="synthesis"
          targetId={String(synthesis.id)}
          compact
        />
      </details>
    </article>
  );
}

function CreativeBasketDrawer({
  state,
  clientId,
  action,
  close,
}: {
  state: CommunityGalleryState;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  close: () => void;
}) {
  const keyFor = (type: CommunitySourceType, id: number) => `${type}:${id}`;

  return (
    <div className="async-overlay" role="dialog" aria-modal="true" aria-label="收藏夹">
      <aside className="async-side-drawer async-basket-drawer">
        <header>
          <div><span className="async-eyebrow">个人素材库</span><h2>收藏夹 <em>{state.basket.length}</em></h2></div>
          <button onClick={close}><X /></button>
        </header>
        <p className="async-drawer-intro">这里是你的个人素材库。仅收藏的跨应用内容平时不会占据画布；进入综合选材时才临时出现，被综合采用后才会作为正式来源节点保留。</p>
        <div className="async-basket-items">
          {state.basket.map((item) => {
            const key = keyFor(item.source_type, item.source_id);
            return (
              <article key={key}>
                <div>
                  <header><strong>{item.author_code}</strong><span>{item.app_title}</span></header>
                  {item.title && <h3>{item.title}</h3>}
                  <p>{item.content}</p>
                </div>
                <button
                  className="async-remove-basket"
                  onClick={() => action(`remove-basket-${key}`, () => communityGalleryApi.toggleBasket(clientId, item.source_type, item.source_id))}
                ><X /> 移出</button>
              </article>
            );
          })}
          {state.basket.length === 0 && <div className="async-empty-discussion"><ShoppingBasket /><span>浏览评论时点击“收藏”。</span></div>}
        </div>
      </aside>
    </div>
  );
}

function CommunityDraftPanel({
  state,
  app,
  clientId,
  action,
  busy,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
}) {
  const [revision, setRevision] = useState('');
  const latestJob = state.generationJobs.find((job) => job.app_id === app.id);
  const events = latestJob
    ? state.generationEvents.filter((event) => Number(event.job_id) === Number(latestJob.id))
    : [];
  const iterationNumber = Number(app.community_version_count || 0) + 1;
  const hasCommunityDraft = app.draft_kind === 'community'
    && Number(app.draft_iteration_number || 0) > Number(app.community_version_count || 0)
    && Boolean(app.draft_code);
  const communityMessages = state.developmentMessages.filter((message) => (
    message.app_id === app.id
    && message.phase === 'community'
    && (!message.iteration_number || Number(message.iteration_number) === iterationNumber)
  ));
  const communityPromptRounds = communityMessages.filter((message) => message.role === 'creator').length;
  if (app.community_version_count >= 2) return null;
  if (!hasCommunityDraft && latestJob?.status !== 'running') return null;

  return (
    <section className="async-community-studio">
      <header>
        <div><span className="async-eyebrow">原型开发 · 人工确认</span><h2>社区版本 {iterationNumber} 工作台</h2></div>
        <span className="async-step-chip">第 3 / 4 步 · 原型开发</span>
      </header>
      {latestJob?.status === 'running' && (
        <div className="async-generation-progress">
          <LoaderCircle className="spin" />
          <div><strong>AI 正在把抽中的评论实现为新版本</strong><span>页面会自动刷新开发步骤</span></div>
          <ol>
            {events.map((event) => <li key={event.id} className={`is-${event.status}`}><Check /> {event.title}</li>)}
          </ol>
        </div>
      )}
      {hasCommunityDraft && (
        <div className="async-community-draft-layout">
          <div className="async-community-draft-preview">
            <AppPreview clientId={clientId} app={app} version="draft" title={`${app.title} 社区版本草稿`} cacheKey={state.serverNow} />
          </div>
          <div>
            <p>这是仅你可见的社区版本草稿。你可以继续修改；只有点击发布后，社区才会看到新版本。</p>
            <section className="async-creator-chat">
                <header>
                  <div><Bot /><span><strong>与 AI 继续开发</strong><small>{communityPromptRounds
                    ? `已完成 ${communityPromptRounds} 轮提示词对话，可继续修改`
                    : '可以继续通过提示词修改草稿'}</small></span></div>
                  <em>发布前草稿</em>
                </header>
                <div className="async-creator-chat-history" role="log" aria-label="社区版本开发对话">
                  {communityMessages.length ? communityMessages.map((message) => (
                    <article key={message.id} className={`is-${message.role}`}>
                      <span>{message.role === 'creator' ? state.viewer?.code : 'AI'}</span>
                      <div>
                        <strong>{message.role === 'creator' ? '你' : '开发助手'}</strong>
                        <p>{message.content}</p>
                      </div>
                    </article>
                  )) : (
                    <div className="async-chat-empty"><MessageCircle /><span>草稿已经就绪，请提出第一条修改要求。</span></div>
                  )}
                </div>
                <div className="async-chat-composer">
                  <textarea value={revision} onChange={(event) => setRevision(event.target.value)} rows={4} placeholder="补充约束、修复问题或调整实现细节" />
                  <button
                    className="async-secondary"
                    disabled={!revision.trim() || Boolean(busy)}
                    onClick={() => action('refine-community', async () => {
                      const next = await communityGalleryApi.refine(clientId, revision);
                      setRevision('');
                      return next;
                    })}
                  ><Send /> {busy === 'refine-community' ? '正在修改…' : '发送并修改草稿'}</button>
                </div>
              </section>
            <button
              className="async-primary"
              disabled={Boolean(busy)}
              onClick={() => action('publish-community', () => communityGalleryApi.publishCommunity(clientId, app.id))}
            ><Check /> 发布社区版本 {Number(app.draft_iteration_number || iterationNumber)}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function GenerateCommunityDialog({
  state,
  app,
  clientId,
  action,
  busy,
  close,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
  close: () => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const appVersions = state.versions
    .filter((version) => version.app_id === app.id)
    .sort((left, right) => left.version_number - right.version_number);
  const initialVersion = appVersions.find((version) => version.kind === 'initial');
  const firstCommunityVersion = appVersions.find(
    (version) => version.kind === 'community' && version.version_number === 2,
  );
  const iterationNumber = Number(app.community_version_count || 0) + 1;
  const baseVersionId = iterationNumber === 2
    ? Number(firstCommunityVersion?.id || 0)
    : Number(initialVersion?.id || app.initial_version_id);
  const selectedBase = appVersions.find((version) => Number(version.id) === Number(baseVersionId));
  const sourceCandidates = [
    ...state.comments
      .filter((comment) => (
        comment.app_id === app.id
        && !comment.deleted_at
        && Number(comment.version_id) === baseVersionId
      ))
      .map((comment) => ({
        key: `comment:${comment.id}`,
        type: 'comment' as const,
        id: Number(comment.id),
        author: comment.author_code,
        label: comment.target_type === 'synthesis' ? '讨论回复' : '普通评论',
        content: comment.content,
      })),
    ...state.syntheses
      .filter((synthesis) => (
        synthesis.target_app_id === app.id
        && !synthesis.deleted_at
        && !synthesis.is_development_brief
        && Number(synthesis.layer) === iterationNumber
        && Number(synthesis.target_version_id || 0) === baseVersionId
      ))
      .map((synthesis) => ({
        key: `synthesis:${synthesis.id}`,
        type: 'synthesis' as const,
        id: Number(synthesis.id),
        author: synthesis.author_code,
        label: `第 ${synthesis.layer} 轮综合评论`,
        content: synthesis.content,
      })),
  ];
  const selectedSources = sourceCandidates.filter((source) => selectedKeys.includes(source.key));
  useEffect(() => {
    setInstruction(selectedSources.map((source) => source.content.trim()).filter(Boolean).join('\n\n'));
  }, [selectedKeys.join('|')]);
  const toggleSource = (key: string) => {
    setSelectedKeys((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ));
  };
  return (
    <div className="async-overlay" role="dialog" aria-modal="true" aria-label="生成社区版本">
      <section className="async-generate-dialog">
        <header><div><span className="async-eyebrow">情境内 AI 原型开发</span><h2>选择评论，开发社区版本 {iterationNumber}</h2></div><button onClick={close}><X /></button></header>
        <div className="async-fixed-base-note is-dialog"><GitBranch />
          {iterationNumber === 1
            ? '本轮固定从初始版本开发。'
            : '本轮固定在社区版本 1 上继续开发。'}
        </div>
        <p>从当前版本的评论或综合评论中选一条或多条，包括你自己的内容。选中的内容会自动填入提示词，系统会保留完整来源链并读取 {selectedBase?.kind === 'community' ? '社区版本 1' : '初始版本'}。</p>
        <div className="async-development-source-picker">
          <header><strong>可选评论</strong><span>已选择 {selectedSources.length} 条</span></header>
          {sourceCandidates.length ? sourceCandidates.map((source) => (
            <label key={source.key} className={selectedKeys.includes(source.key) ? 'is-selected' : ''}>
              <input type="checkbox" checked={selectedKeys.includes(source.key)} onChange={() => toggleSource(source.key)} />
              <span><small>{source.label} · {source.author}</small><strong>{source.content}</strong></span>
            </label>
          )) : <p className="async-empty-state">当前版本还没有可供选择的评论。</p>}
        </div>
        <label>
          开发提示词（由所选评论自动填入，可继续编辑）
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={6}
            placeholder="先选择评论，系统会自动填入内容…"
          />
        </label>
        <button
          className="async-primary"
          disabled={Boolean(busy) || !baseVersionId || !selectedSources.length || !instruction.trim()}
          onClick={() => action('generate-community', async () => {
            const next = await communityGalleryApi.generateCommunity(
              clientId,
              app.id,
              selectedSources.map((source) => ({ type: source.type, id: source.id })),
              instruction,
              baseVersionId,
            );
            close();
            return next;
          })}
        ><Sparkles /> {busy === 'generate-community' ? 'AI 正在开发…' : `使用该提示词生成社区版本 ${iterationNumber}`}</button>
      </section>
    </div>
  );
}

function AppDetail({
  state,
  app,
  clientId,
  action,
  busy,
  openBasket,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
  openBasket: () => void;
}) {
  const appVersions = state.versions
    .filter((version) => version.app_id === app.id)
    .sort((left, right) => left.version_number - right.version_number);
  const latestVersion = appVersions[appVersions.length - 1];
  const [viewVersionId, setViewVersionId] = useState(
    Number(latestVersion?.id || app.initial_version_id),
  );
  const viewedVersion = appVersions.find(
    (version) => Number(version.id) === Number(viewVersionId),
  ) || latestVersion;
  const [sourceSynthesis, setSourceSynthesis] = useState<CommunitySynthesis | null>(null);
  const isOwner = state.viewer?.role === 'creator' && state.viewer.code === app.creator_code;
  const assignment = state.assignments.find((item) => item.app_id === app.id);
  const trackedAppDetailRef = useRef('');
  const lastTrackedVersionRef = useRef(0);
  const trackedSelectionRef = useRef(new Set<string>());
  const latestDevelopmentJob = state.generationJobs
    .filter((job) => job.app_id === app.id)
    .sort((left, right) => Number(right.iteration_number) - Number(left.iteration_number))[0];

  useEffect(() => {
    setViewVersionId(Number(latestVersion?.id || app.initial_version_id));
  }, [app.id, app.initial_version_id, latestVersion?.id]);

  useEffect(() => {
    if (trackedAppDetailRef.current === app.id) return;
    trackedAppDetailRef.current = app.id;
    void communityGalleryApi.track(clientId, 'open_app_detail', 'app', app.id, {
      assigned: Boolean(assignment),
    });
  }, [app.id, assignment, clientId]);

  useEffect(() => {
    if (!viewedVersion || state.viewer?.role === 'host') return;
    if (lastTrackedVersionRef.current === Number(viewedVersion.id)) return;
    lastTrackedVersionRef.current = Number(viewedVersion.id);
    void communityGalleryApi.track(clientId, 'view_app_version', 'version', String(viewedVersion.id), {
      appId: app.id,
      versionNumber: viewedVersion.version_number,
      versionKind: viewedVersion.kind,
      iterationNumber: viewedVersion.kind === 'community'
        ? Number(viewedVersion.version_number) - 1
        : 0,
      isOwnApp: isOwner,
    });
  }, [app.id, clientId, isOwner, state.viewer?.role, viewedVersion?.id]);

  useEffect(() => {
    if (!latestDevelopmentJob || state.viewer?.role === 'host') return;
    const selectionViewKey = `${app.id}:${latestDevelopmentJob.id}`;
    if (trackedSelectionRef.current.has(selectionViewKey)) return;
    trackedSelectionRef.current.add(selectionViewKey);
    void communityGalleryApi.track(
      clientId,
      'view_development_selection',
      'generation_job',
      String(latestDevelopmentJob.id),
      {
        appId: app.id,
        iterationNumber: Number(latestDevelopmentJob.iteration_number),
        selectedSourceType: latestDevelopmentJob.selected_source_type,
        selectedSourceId: latestDevelopmentJob.selected_source_id,
        jobStatus: latestDevelopmentJob.status,
        isOwnApp: isOwner,
      },
    );
  }, [
    app.id,
    clientId,
    isOwner,
    latestDevelopmentJob?.id,
    latestDevelopmentJob?.status,
    state.viewer?.role,
  ]);

  return (
    <section className="async-app-detail">
      <header className="async-detail-heading">
        <div>
          <span className="async-eyebrow">{app.creator_code} · {assignment ? '你的指定体验应用' : '社区应用'}</span>
          <h1>{app.title}</h1>
          <p>{app.brief}</p>
        </div>
        <div className="async-version-tabs">
          {appVersions.map((version) => (
            <button
              key={version.id}
              className={viewVersionId === version.id ? 'is-active' : ''}
              onClick={() => setViewVersionId(version.id)}
            >
              {version.kind === 'initial'
                ? '初始版本'
                : `社区版本 ${version.version_number - 1}`}
            </button>
          ))}
        </div>
      </header>
      <div className="async-detail-preview">
        {viewedVersion && (
          <AppPreview
            clientId={clientId}
            app={app}
            version={viewedVersion.kind}
            versionId={viewedVersion.id}
            title={`${app.title} ${viewedVersion.kind === 'initial' ? '初始版本' : '社区版本'} ${viewedVersion.version_number}`}
            cacheKey={String(viewedVersion.id)}
          />
        )}
      </div>

      {isOwner && <CommunityDraftPanel state={state} app={app} clientId={clientId} action={action} busy={busy} />}

      <IdeaFlowBoard
        state={state}
        app={app}
        clientId={clientId}
        action={action}
        busy={busy}
        openBasket={openBasket}
        viewSources={setSourceSynthesis}
      />

      {sourceSynthesis && <SourceDrawer state={state} synthesis={sourceSynthesis} close={() => setSourceSynthesis(null)} />}
    </section>
  );
}

function HostPanel({
  state,
  clientId,
  action,
  busy,
}: {
  state: CommunityGalleryState;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
}) {
  const creatorParticipants = state.participants
    .filter((participant) => participant.role === 'creator')
    .sort((left, right) => left.code.localeCompare(right.code));
  const serverTestCreatorCount = creatorParticipants.filter(
    (participant) => Boolean(participant.is_test),
  ).length;
  const serverTestCreators = creatorParticipants
    .filter((participant) => Boolean(participant.is_test))
    .map((participant) => participant.code);
  const serverTestCreatorKey = serverTestCreators.join(',');
  const [testCreators, setTestCreators] = useState<string[]>(serverTestCreators);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);

  useEffect(() => {
    setTestCreators(serverTestCreators);
  }, [serverTestCreatorKey, state.study.id]);

  useEffect(() => {
    setResetDialogOpen(false);
    setResetConfirmation('');
    setSelectedAppIds([]);
  }, [state.study.id]);

  const toggleTestCreator = (code: string) => {
    setTestCreators((current) => (
      current.includes(code)
        ? current.filter((value) => value !== code)
        : [...current, code].sort()
    ));
  };
  const testRolesDirty = testCreators.join(',') !== serverTestCreators.join(',');
  const joinedCreatorCount = creatorParticipants.filter((participant) => participant.joined).length;
  const communityVersions = state.apps.filter((app) => app.community_version_id).length;
  const publishedApps = state.apps.filter((app) => app.status === 'published');
  const selectedApps = publishedApps.filter((app) => selectedAppIds.includes(app.id));
  const regularWorkspace = state.workspaces.regular;
  const testWorkspace = state.workspaces.test;
  const bothWorkspacesSetup = regularWorkspace.status === 'setup' && testWorkspace.status === 'setup';
  const bothWorkspacesClosed = regularWorkspace.status === 'closed' && testWorkspace.status === 'closed';
  const developmentStatusFor = (app: CommunityApp, iterationNumber: 1 | 2) => {
    const job = state.generationJobs.find(
      (candidate) => candidate.app_id === app.id
        && Number(candidate.iteration_number) === iterationNumber,
    );
    const publishedVersion = state.versions.find(
      (version) => version.app_id === app.id
        && version.kind === 'community'
        && Number(version.version_number) === iterationNumber + 1,
    );
    const activeDraft = app.draft_kind === 'community'
      && Number(app.draft_iteration_number) === iterationNumber;

    if (job?.status === 'failed') {
      return {
        key: 'failed',
        label: '失败',
        detail: job.error || '开发任务失败，但没有返回具体原因。',
        time: job.completed_at,
        jobId: job.id,
        restartable: true,
      };
    }
    if (publishedVersion) {
      return {
        key: 'completed',
        label: '已发布',
        detail: `社区版本 ${iterationNumber} 已发布`,
        time: job?.completed_at || publishedVersion?.created_at,
        jobId: job?.id,
        restartable: false,
      };
    }
    if (job?.status === 'completed') {
      return {
        key: 'completed',
        label: '草稿就绪',
        detail: `第 ${iterationNumber} 轮系统开发已完成，等待 Creator 确认发布`,
        time: job.completed_at,
        jobId: job.id,
        restartable: true,
      };
    }
    if (job?.status === 'running' || activeDraft) {
      const latestEvent = job
        ? state.generationEvents
            .filter((event) => Number(event.job_id) === Number(job.id))
            .at(-1)
        : undefined;
      return {
        key: 'running',
        label: '开发中',
        detail: latestEvent?.title || 'AI 正在生成新版本',
        time: latestEvent?.updated_at || job?.created_at,
        jobId: job?.id,
        restartable: false,
      };
    }
    return {
      key: 'pending',
      label: '未开始',
      detail: '等待本轮开发启动',
      time: undefined,
      jobId: undefined,
      restartable: false,
    };
  };
  const developmentStatuses = publishedApps.flatMap((app) => [
    developmentStatusFor(app, 1),
    developmentStatusFor(app, 2),
  ]);
  const activeDevelopmentCounts = {
    running: developmentStatuses.filter((status) => status.key === 'running').length,
    completed: developmentStatuses.filter((status) => status.key === 'completed').length,
    failed: developmentStatuses.filter((status) => status.key === 'failed').length,
  };
  const appFlowLabels: Record<CommunityApp['flow_stage'], string> = {
    waiting_round_1: '等待 V0',
    round_1: '第一轮评论中',
    development_1: '第一轮开发中',
    waiting_round_2: '等待 V1',
    round_2: '第二轮评论中',
    development_2: '第二轮开发中',
    completed: '两轮已完成',
  };
  const latestJobFor = (app: CommunityApp, iterationNumber?: 1 | 2) => state.generationJobs.find(
    (job) => job.app_id === app.id
      && (!iterationNumber || Number(job.iteration_number) === iterationNumber),
  );
  const selectedCan = (target: 'development_1' | 'development_2' | 'rollback' | 'retry') => (
    selectedApps.length > 0 && selectedApps.every((app) => {
      const workspace = app.is_test ? testWorkspace : regularWorkspace;
      if (workspace.status !== 'active') return false;
      if (target === 'development_1') return app.flow_stage === 'round_1';
      if (target === 'development_2') return app.flow_stage === 'round_2';
      if (target === 'rollback') {
        return ['development_1', 'development_2'].includes(app.flow_stage)
          && app.draft_kind !== 'community'
          && latestJobFor(app)?.status !== 'running';
      }
      const iterationNumber = app.flow_stage === 'development_1' ? 1 : app.flow_stage === 'development_2' ? 2 : null;
      const latestJob = iterationNumber ? latestJobFor(app, iterationNumber) : undefined;
      return Boolean(iterationNumber && latestJob && latestJob.status !== 'running'
        && Number(app.community_version_count) < iterationNumber);
    })
  );
  const enterSelectedDevelopment = async (iterationNumber: 1 | 2) => {
    let next = state;
    for (const isTest of [true, false]) {
      const appIds = selectedApps.filter((app) => Boolean(app.is_test) === isTest).map((app) => app.id);
      if (appIds.length) {
        next = await communityGalleryApi.enterDevelopment(clientId, iterationNumber, isTest, appIds);
      }
    }
    return next;
  };
  return (
    <>
    <section className="async-host-panel">
      <header>
        <div><span className="async-eyebrow">主持人 · 异步研究</span><h2>研究控制与完成进度</h2><p>主持人锁定本轮点赞后，系统会按点赞数加权随机抽取每个应用的开发来源，并立即启动开发任务。</p></div>
        <div className="async-host-actions">
          <a href={`/api/community-gallery/export?clientId=${encodeURIComponent(clientId)}`}><Download /> 导出研究数据</a>
          {bothWorkspacesClosed && (
            <button disabled={Boolean(busy)} onClick={() => action('new-study', () => communityGalleryApi.newStudy(clientId))}><RefreshCw /> 新建研究</button>
          )}
        </div>
      </header>
      <section className="async-workspace-controls">
        {([
          { key: 'test', isTest: true, label: '测试账号流程', workspace: testWorkspace, appCount: state.counts.testApps, creatorCount: serverTestCreatorCount },
          { key: 'regular', isTest: false, label: '正式账号流程', workspace: regularWorkspace, appCount: state.counts.regularApps, creatorCount: state.counts.creators - serverTestCreatorCount },
        ] as const).map((item) => {
          return (
            <section key={item.key} className={`async-host-stage is-${item.key}`}>
              <div>
                <span className="async-eyebrow">{item.label}</span>
                <strong>{item.workspace.status === 'setup'
                  ? '尚未开始'
                  : item.workspace.status === 'closed'
                    ? '流程已结束'
                    : '总流程已开启 · 按 Creator 单独推进'}</strong>
                <p>{item.appCount} / {item.creatorCount} 个初始作品已发布。开启后，请在下方选择 Creator 并锁定各自的开发轮次。</p>
              </div>
              <aside className="async-host-stage-actions">
                {item.workspace.status === 'setup' && (
                  <>
                    <button
                      className="async-primary"
                      disabled={Boolean(busy) || !state.study.test_roles_configured || testRolesDirty || item.appCount < 1}
                      onClick={() => action(`start-${item.key}-study`, () => communityGalleryApi.startStudy(clientId, item.isTest))}
                    ><Play /> 开始{item.isTest ? '测试' : '正式'}流程</button>
                    <button
                      type="button"
                      className="async-secondary"
                      disabled={Boolean(busy)}
                      onClick={() => action(`skip-${item.key}-study`, () => communityGalleryApi.closeStudy(clientId, item.isTest))}
                    ><X /> 跳过并结束此流程</button>
                  </>
                )}
                {item.workspace.status === 'active' && (
                  <button disabled={Boolean(busy)} onClick={() => action(`close-${item.key}-study`, () => communityGalleryApi.closeStudy(clientId, item.isTest))}><Check /> 结束此流程</button>
                )}
              </aside>
            </section>
          );
        })}
      </section>
      {(
        <section className="async-test-reset-panel">
          <div className="async-test-reset-copy">
            <span><Trash2 /></span>
            <div>
              <span className="async-eyebrow">主持人 · 实验准备</span>
              <h3>清除测试角色的全部数据</h3>
              <p>删除测试角色的登录会话、作品、版本、评论、点赞、综合评论和开发记录。账号及测试角色设置会保留，非测试角色的数据不会受到影响。</p>
            </div>
          </div>
          <div className="async-test-reset-stats" aria-label="待清理数据概览">
            <span><strong>{state.testData.testCreatorCount}</strong> 个测试角色</span>
            <span><strong>{state.testData.testAppCount}</strong> 个作品删除</span>
            <span><strong>{state.testData.commentCount}</strong> 条评论删除</span>
            <span><strong>{state.testData.versionCount}</strong> 个版本删除</span>
          </div>
          <button
            className="async-test-reset-trigger"
            disabled={Boolean(busy) || !state.testData.hasTestData || state.testData.runningTaskCount > 0}
            title={state.testData.runningTaskCount > 0
              ? '测试角色仍有开发任务正在运行'
              : !state.testData.hasTestData
                ? '当前没有需要清除的测试角色数据'
                : '预览删除范围并进行二次确认'}
            onClick={() => setResetDialogOpen(true)}
          ><Trash2 /> 清除测试角色数据</button>
        </section>
      )}
      {!bothWorkspacesClosed && (
        <section className="async-condition-assignment">
          <header>
            <div>
              <span className="async-eyebrow">主持人 · 测试角色设置</span>
              <h3>选择测试角色</h3>
              <p>测试角色创建的作品只对 Host 和其他测试角色可见；普通创作者与测试角色的数据完全隔离。开始研究后不可修改。</p>
            </div>
            <div className="async-condition-save">
              <button
                className="async-primary"
                disabled={Boolean(busy) || !bothWorkspacesSetup || (!testRolesDirty && state.study.test_roles_configured)}
                onClick={() => action(
                  'save-test-creators',
                  () => communityGalleryApi.setTestCreators(
                    clientId,
                    testCreators,
                  ),
                )}
              ><Check /> {testRolesDirty ? '保存测试角色' : state.study.test_roles_configured ? '测试角色已保存' : '保存测试角色'}</button>
            </div>
          </header>
          <div className="async-condition-groups">
            <section>
              <header><div><strong>创作者账号 1–30</strong><small>点击编号切换测试角色；未选择的账号为正式实验角色</small></div></header>
              <div>
                {creatorParticipants.map((participant) => (
                  <button
                    key={participant.code}
                    className={testCreators.includes(participant.code) ? 'is-control' : ''}
                    disabled={Boolean(busy) || !bothWorkspacesSetup}
                    onClick={() => toggleTestCreator(participant.code)}
                  >
                    <strong>{Number(participant.code.slice(1))}</strong>
                    <span>{testCreators.includes(participant.code) ? '测试角色' : '正式角色'}</span>
                    {participant.joined ? <i>已进入</i> : null}
                  </button>
                ))}
              </div>
            </section>
          </div>
          <footer>
            <span><i className="is-control" /> 测试角色：仅与测试角色和 Host 互相可见</span>
            <span><i className="is-experimental" /> 正式角色：仅与正式角色和 Host 互相可见</span>
          </footer>
        </section>
      )}
      <div className="async-host-stats">
        <article><span>测试角色作品</span><strong>{state.counts.testApps} / {serverTestCreatorCount}</strong></article>
        <article><span>正式角色作品</span><strong>{state.counts.regularApps} / {state.counts.creators - serverTestCreatorCount}</strong></article>
        <article><span>已进入创作者</span><strong>{joinedCreatorCount} / {state.counts.creators}</strong></article>
        <article><span>社区版本</span><strong>{communityVersions} / {state.counts.creators}</strong></article>
      </div>
      {publishedApps.length > 0 && (
        <section className="async-host-development-board">
          <header>
            <div>
              <span className="async-eyebrow">按 Creator 控制</span>
              <h3>每个 App 的独立流程</h3>
              <p>V0 发布后自动开放第一轮，V1 发布后自动开放第二轮，V2 发布后自动结束。Host 只需锁定当前轮次并启动开发。</p>
            </div>
            <div className="async-development-summary">
              <span className="is-running"><LoaderCircle /> 开发中 {activeDevelopmentCounts.running}</span>
              <span className="is-completed"><CheckCircle2 /> 成功 {activeDevelopmentCounts.completed}</span>
              <span className="is-failed"><X /> 失败 {activeDevelopmentCounts.failed}</span>
            </div>
          </header>
          <div className="async-app-flow-toolbar" aria-label="批量控制 Creator 流程">
            <div className="async-app-flow-selection">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setSelectedAppIds(
                  selectedAppIds.length === publishedApps.length ? [] : publishedApps.map((app) => app.id),
                )}
              >{selectedAppIds.length === publishedApps.length ? '取消全选' : '全选 Creator'}</button>
              <strong>已选择 {selectedApps.length} 个</strong>
            </div>
            <div className="async-app-flow-actions">
              <button
                disabled={Boolean(busy) || !selectedCan('development_1')}
                onClick={() => action('develop-selected-round-1', () => enterSelectedDevelopment(1))}
              ><Lock /> 锁定第一轮并开发</button>
              <button
                disabled={Boolean(busy) || !selectedCan('development_2')}
                onClick={() => action('develop-selected-round-2', () => enterSelectedDevelopment(2))}
              ><Lock /> 锁定第二轮并开发</button>
              <button
                disabled={Boolean(busy) || !selectedCan('rollback')}
                onClick={() => action('rollback-selected-apps', () => (
                  communityGalleryApi.controlAppFlows(clientId, selectedAppIds, 'rollback')
                ))}
              ><ArrowLeft /> 回退上一流程</button>
              <button
                className="async-retry-development"
                disabled={Boolean(busy) || !selectedCan('retry')}
                onClick={() => action('retry-selected-development', () => (
                  communityGalleryApi.retryAppDevelopment(clientId, selectedAppIds)
                ))}
              ><RefreshCw /> 重新开发</button>
            </div>
          </div>
          <div className="async-development-table" role="table" aria-label="应用开发状态">
            <div className="async-development-table-heading" role="row">
              <span role="columnheader">选择 / Creator / 当前流程</span>
              <span role="columnheader">第一次开发 · 版本 1</span>
              <span role="columnheader">第二次开发 · 版本 2</span>
            </div>
            {publishedApps.map((app) => {
              const firstStatus = developmentStatusFor(app, 1);
              const secondStatus = developmentStatusFor(app, 2);
              return (
                <article key={app.id} role="row" className={selectedAppIds.includes(app.id) ? 'is-selected' : ''}>
                  <div className="async-development-app" role="cell">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedAppIds.includes(app.id)}
                        disabled={Boolean(busy)}
                        onChange={() => setSelectedAppIds((current) => (
                          current.includes(app.id)
                            ? current.filter((id) => id !== app.id)
                            : [...current, app.id]
                        ))}
                      />
                      <span>{app.is_test ? '测试角色' : '正式角色'}</span>
                    </label>
                    <strong>{app.creator_code} · {app.title}</strong>
                    <small className={`is-flow-${app.flow_stage}`}>{appFlowLabels[app.flow_stage]}</small>
                    <div className="async-current-round-counts" aria-label="本轮互动数量">
                      <span><MessageCircle /> 普通评论 <strong>{app.current_round_comment_count}</strong></span>
                      <span><Lightbulb /> 综合评论 <strong>{app.current_round_synthesis_count}</strong></span>
                    </div>
                  </div>
                  {[firstStatus, secondStatus].map((status, index) => (
                    <div
                      key={`${app.id}-${index + 1}`}
                      className={`async-development-state is-${status.key}`}
                      role="cell"
                      title={status.detail}
                    >
                      <span>
                        {status.key === 'running' && <LoaderCircle className="spin" />}
                        {status.key === 'completed' && <CheckCircle2 />}
                        {status.key === 'failed' && <X />}
                        {status.key === 'pending' && <Workflow />}
                        {status.label}
                      </span>
                      <p>{status.detail}</p>
                      {status.time && <small>{formatDate(status.time)}</small>}
                      {status.restartable && status.jobId && (
                        <button
                          className="async-retry-development"
                          disabled={Boolean(busy)}
                          onClick={() => action(
                            `retry-development-${status.jobId}`,
                            () => communityGalleryApi.retryDevelopment(clientId, status.jobId!),
                          )}
                        ><RefreshCw /> {status.key === 'failed' ? '失败后重试' : '重新开发'}</button>
                      )}
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
    {resetDialogOpen && (
      <div className="async-overlay async-test-reset-overlay" role="dialog" aria-modal="true" aria-labelledby="test-reset-title">
        <section className="async-flow-reply-dialog async-test-reset-dialog">
          <header>
            <div>
              <span className="async-eyebrow">不可撤销操作</span>
              <h2 id="test-reset-title">确认清除测试角色数据</h2>
            </div>
            <button
              onClick={() => {
                setResetDialogOpen(false);
                setResetConfirmation('');
              }}
              aria-label="关闭清除测试角色数据窗口"
            ><X /></button>
          </header>
          <p className="async-test-reset-warning">
            测试角色创建的作品（包括初始作品）及其全部互动和开发记录将永久删除。测试角色账号仍保留，可重新登录并创建作品。
          </p>
          <div className="async-test-reset-summary">
            <article><span>删除</span><strong>{state.testData.testAppCount}</strong><small>作品</small></article>
            <article><span>删除</span><strong>{state.testData.versionCount}</strong><small>版本</small></article>
            <article><span>删除</span><strong>{state.testData.commentCount}</strong><small>评论</small></article>
            <article><span>删除</span><strong>{state.testData.synthesisCount}</strong><small>综合评论</small></article>
            <article><span>删除</span><strong>{state.testData.likeCount}</strong><small>点赞 / 投票</small></article>
            <article><span>删除</span><strong>{state.testData.generationJobCount}</strong><small>开发任务</small></article>
          </div>
          <label className="async-test-reset-confirmation">
            <span>请输入 <strong>清除测试角色数据</strong> 以确认</span>
            <input
              autoFocus
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              placeholder="清除测试角色数据"
            />
          </label>
          <div className="async-flow-dialog-actions">
            <button
              className="async-secondary"
              onClick={() => {
                setResetDialogOpen(false);
                setResetConfirmation('');
              }}
            >取消</button>
            <button
              className="async-test-reset-confirm"
              disabled={Boolean(busy) || resetConfirmation.trim() !== '清除测试角色数据'}
              onClick={() => {
                void action(
                  'clear-test-data',
                  () => communityGalleryApi.clearTestData(clientId, resetConfirmation),
                );
                setResetDialogOpen(false);
                setResetConfirmation('');
              }}
            ><Trash2 /> 永久删除测试数据</button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}

function NotificationDrawer({
  notifications,
  close,
}: {
  notifications: CommunityNotification[];
  close: () => void;
}) {
  return (
    <div className="async-overlay" role="dialog" aria-modal="true" aria-label="消息中心">
      <aside className="async-side-drawer async-notification-drawer">
        <header>
          <div><span className="async-eyebrow">你的创意影响</span><h2>消息中心</h2></div>
          <button onClick={close} aria-label="关闭消息中心"><X /></button>
        </header>
        <p className="async-drawer-intro">当你的普通评论或综合评论被纳入开发流程时，消息会保留在这里。</p>
        <div className="async-notification-list">
          {notifications.map((notification) => (
            <article key={notification.id} className={notification.read_at ? '' : 'is-unread'}>
              <span><Sparkles /></span>
              <div>
                <header><strong>{notification.title}</strong><small>{formatDate(notification.created_at)}</small></header>
                <p>{notification.content}</p>
                <footer><GitMerge /> {notification.app_title} · {notification.source_count} 条贡献被采用</footer>
              </div>
            </article>
          ))}
          {notifications.length === 0 && (
            <div className="async-notification-empty">
              <Bell />
              <strong>还没有新消息</strong>
              <span>继续评论和综合社区创意，你的贡献可能成为下一个可运行版本。</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function FireworksCelebration({
  notification,
  extraCount,
  close,
}: {
  notification: CommunityNotification;
  extraCount: number;
  close: () => void;
}) {
  const particles = useMemo(
    () => Array.from({ length: 54 }, (_, index) => {
      const angle = (index / 54) * Math.PI * 2;
      const distance = 120 + (index % 9) * 16;
      return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        delay: (index % 11) * 0.035,
        color: index % 5,
      };
    }),
    [],
  );
  useEffect(() => {
    const timer = window.setTimeout(close, 4200);
    return () => window.clearTimeout(timer);
  }, [close]);
  return (
    <div className="async-fireworks" role="status" aria-live="polite" onClick={close}>
      <div className="async-firework-burst" aria-hidden="true">
        {particles.map((particle, index) => (
          <i
            key={index}
            className={`tone-${particle.color}`}
            style={{
              '--firework-x': `${particle.x}px`,
              '--firework-y': `${particle.y}px`,
              '--firework-delay': `${particle.delay}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <section onClick={(event) => event.stopPropagation()}>
        <span><Sparkles /></span>
        <small>你的想法正在成为现实</small>
        <h2>你的创意进入开发流程了！</h2>
        <p>{notification.content}</p>
        {extraCount > 0 && <em>同时还有 {extraCount} 条新的采用消息</em>}
        <button onClick={close}>太好了</button>
      </section>
    </div>
  );
}

export default function AsyncGalleryApp() {
  const [clientId] = useState(getClientId);
  const [state, setState] = useState<CommunityGalleryState | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [selectedAppId, setSelectedAppId] = useState(getSelectedAppIdFromLocation);
  const [basketOpen, setBasketOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [galleryColumnCount, setGalleryColumnCount] = useState(getGalleryColumnCount);
  const [celebration, setCelebration] = useState<{
    notification: CommunityNotification;
    extraCount: number;
  } | null>(null);
  const acknowledgedCelebrations = useRef(new Set<number>());

  const refresh = useCallback(async () => {
    try {
      setState(await communityGalleryApi.state(clientId));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法加载创意共创社区。');
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const updateColumns = () => setGalleryColumnCount(getGalleryColumnCount());
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  useEffect(() => {
    const restoreSelectedApp = () => setSelectedAppId(getSelectedAppIdFromLocation());
    window.addEventListener('popstate', restoreSelectedApp);
    return () => window.removeEventListener('popstate', restoreSelectedApp);
  }, []);

  useEffect(() => {
    if (!state?.viewer || state.study.status === 'closed') return;
    const creatorApp = state.viewer.role !== 'host'
      ? state.apps.find((app) => app.creator_code === state.viewer?.code)
      : undefined;
    const creatorIsEditingDraft = state.viewer.role !== 'host' && (
      (state.study.status === 'setup' && !creatorApp?.initial_version_id)
      || Boolean(creatorApp?.draft_code)
    );
    if (creatorIsEditingDraft) return;
    const interval = window.setInterval(() => {
      const focusedElement = document.activeElement;
      const userIsTyping = focusedElement instanceof HTMLInputElement
        || focusedElement instanceof HTMLTextAreaElement
        || focusedElement?.getAttribute('contenteditable') === 'true';
      if (!userIsTyping) void refresh();
    }, 6000);
    return () => window.clearInterval(interval);
  }, [refresh, state?.apps, state?.study.status, state?.viewer]);

  useEffect(() => {
    if (!state?.viewer || celebration) return;
    const pending = state.notifications.filter(
      (notification) => !notification.celebrated_at
        && !acknowledgedCelebrations.current.has(notification.id),
    );
    if (!pending.length) return;
    pending.forEach((notification) => acknowledgedCelebrations.current.add(notification.id));
    setCelebration({ notification: pending[0], extraCount: pending.length - 1 });
    void communityGalleryApi
      .celebrateNotifications(clientId, pending.map((notification) => notification.id))
      .then(setState)
      .catch(() => undefined);
  }, [celebration, clientId, state?.notifications, state?.viewer]);

  const action = useCallback(async (label: string, task: () => Promise<CommunityGalleryState>) => {
    setBusy(label);
    setError('');
    try {
      setState(await task());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败。');
    } finally {
      setBusy('');
    }
  }, []);

  const publishedApps = useMemo(
    () => state?.apps.filter((app) => app.status === 'published') || [],
    [state?.apps],
  );
  const selectedApp = publishedApps.find((app) => app.id === selectedAppId);

  const navigateToApp = useCallback((appId: string) => {
    const url = new URL(window.location.href);
    if (appId) url.searchParams.set('app', appId);
    else url.searchParams.delete('app');
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentAppId = getSelectedAppIdFromLocation();
    if (currentAppId !== appId) {
      const currentHistoryState = window.history.state && typeof window.history.state === 'object'
        ? window.history.state
        : {};
      window.history.pushState(
        { ...currentHistoryState, vibeGalleryAppId: appId || null },
        '',
        nextUrl,
      );
    }
    setSelectedAppId(appId);
  }, []);

  useEffect(() => {
    if (selectedAppId) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedAppId]);

  if (!state) {
    return <main className="async-loading"><LoaderCircle className="spin" /><strong>正在加载创意共创社区…</strong>{error && <p>{error}</p>}</main>;
  }

  const statusCopy = state.study.status === 'setup'
    ? { label: '准备阶段', detail: '创作者可以发布初始应用；主持人点击开始后，社区评论与综合评论才会开放。' }
    : state.study.status === 'active'
      ? { label: '异步社区进行中', detail: '自由浏览、讨论、收集创意，并把综合方向实现为社区版本。' }
      : { label: '研究已结束', detail: '研究已经结束，作品和创意来源保持只读。' };
  const ownApp = state.apps.find((app) => app.creator_code === state.viewer?.code);
  const assignedIds = new Set(state.assignments.map((item) => item.app_id));
  const unreadNotificationCount = state.notifications.filter((notification) => !notification.read_at).length;

  return (
    <div className="async-gallery-shell">
      <header className="async-global-header">
        <div className={`async-header-leading ${selectedApp ? 'has-page-back' : ''}`}>
          {selectedApp && (
            <button className="async-page-back" onClick={() => navigateToApp('')}>
              <ArrowLeft />
              <span>返回首页</span>
            </button>
          )}
          <button className="async-brand" onClick={() => navigateToApp('')}>
            <span><Sparkles /></span><div><strong>创意共创社区</strong><small>社交式应用共创平台</small></div>
          </button>
        </div>
        <div className="async-header-actions">
          {state.viewer?.role === 'host' && (
            <label className="async-model-control"><Bot /><select value={state.aiProvider} disabled={state.study.status !== 'setup' || Boolean(busy)} onChange={(event) => action('model', () => communityGalleryApi.model(clientId, event.target.value as CommunityGalleryState['aiProvider']))}>
              <option value="gpt5">GPT-5.5</option>
              <option value="deepseek">DeepSeek Flash</option>
              <option value="deepseek-pro">DeepSeek Pro</option>
              <option value="gemini">Gemini</option>
              <option value="glm">GLM-5.2</option>
            </select></label>
          )}
          {canUseCreativeTools(state) && state.viewer?.role !== 'host' && (
            <button className="async-basket-button" onClick={() => setBasketOpen(true)}><ShoppingBasket /><span>收藏夹</span><strong>{state.basket.length}</strong></button>
          )}
          {state.viewer && state.viewer.role !== 'host' && (
            <button
              className="async-notification-button"
              onClick={() => {
                setNotificationsOpen(true);
                if (unreadNotificationCount) {
                  void communityGalleryApi.readNotifications(clientId).then(setState).catch(() => undefined);
                }
              }}
              aria-label={`消息中心，${unreadNotificationCount} 条未读消息`}
            >
              <Bell />
              {unreadNotificationCount > 0 && <strong>{unreadNotificationCount}</strong>}
            </button>
          )}
          <div className="async-viewer">
            <span>{state.viewer ? (state.viewer.role === 'host' ? '主持人' : '创作者') : '当前身份'}</span>
            <strong>{state.viewer
              ? state.viewer.role === 'host' ? '账号 0' : `账号 ${Number(state.viewer.code.slice(1))}`
              : '访客'}</strong>
          </div>
          <button className="async-refresh" onClick={() => void refresh()} title="刷新"><RefreshCw className={busy ? 'spin' : ''} /></button>
        </div>
      </header>

      <main className="async-main">
        <section className={`async-status is-${state.study.status}`}>
          <span />
          <div><strong>{statusCopy.label}</strong><p>{statusCopy.detail}</p></div>
          {state.viewer && state.viewer.role !== 'host' && state.study.status !== 'closed' && state.assignments.length > 0 && (
            <em>{state.assignments.filter((item) => item.completed_at).length} / 3 个指定体验已完成</em>
          )}
        </section>

        {error && <div className="async-error"><span>{error}</span><button onClick={() => setError('')}><X /></button></div>}
        {!state.viewer && <IdentityGate busy={busy} join={(account, password) => void action('join', () => communityGalleryApi.join(clientId, account, password))} />}

        {state.viewer?.role === 'creator' && state.study.status !== 'closed' && (
          <InitialCreatorStudio state={state} clientId={clientId} action={action} busy={busy} />
        )}

        {state.viewer?.role === 'host' && !selectedApp && (
          <HostPanel state={state} clientId={clientId} action={action} busy={busy} />
        )}

        {selectedApp ? (
          <AppDetail
            state={state}
            app={selectedApp}
            clientId={clientId}
            action={action}
            busy={busy}
            openBasket={() => setBasketOpen(true)}
          />
        ) : state.viewer && (
          <section className="async-gallery-home">
            <header className="async-home-heading">
              <div>
                <span className="async-eyebrow">{state.study.status === 'setup' ? '创作准备阶段' : '社区共创进行中'}</span>
                <h1>{state.viewer.role === 'host' ? '两个社区的作品进度' : '发现作品，加入正在发生的创作'}</h1>
                <p>{state.study.status === 'setup'
                  ? '初始应用可以陆续发布；主持人点击开始后，大家才能发表评论和进行综合。'
                  : '先体验指定应用，也可以自由探索其他作品。普通讨论保持自然，综合创意由用户主动创建。'}</p>
              </div>
              {state.viewer.role !== 'host' && ownApp?.initial_version_id && <span className="async-own-app-note"><CheckCircle2 /> 你的初始应用已发布</span>}
            </header>
            <div className={`async-gallery-grid columns-${galleryColumnCount}`}>
              {publishedApps.map((app, index) => (
                <GalleryMasonryItem key={app.id} paired={Boolean(app.community_version_id)}>
                    <GalleryCard
                      state={state}
                      app={app}
                      clientId={clientId}
                      assigned={assignedIds.has(app.id)}
                      index={index}
                      open={() => {
                        navigateToApp(app.id);
                        void communityGalleryApi.track(clientId, 'open_app_from_feed', 'app', app.id);
                      }}
                      like={() => void action(`like-app-${app.id}`, () => communityGalleryApi.likeApp(clientId, app.id))}
                    />
                </GalleryMasonryItem>
              ))}
            </div>
            {publishedApps.length === 0 && (
              <div className="async-empty-gallery"><Code2 /><h2>等待初始应用发布</h2><p>创作者发布后，作品会以瀑布流卡片出现在这里。</p></div>
            )}
          </section>
        )}
      </main>

      {basketOpen && (
        <CreativeBasketDrawer
          state={state}
          clientId={clientId}
          action={action}
          close={() => setBasketOpen(false)}
        />
      )}
      {notificationsOpen && (
        <NotificationDrawer notifications={state.notifications} close={() => setNotificationsOpen(false)} />
      )}
      {celebration && (
        <FireworksCelebration
          notification={celebration.notification}
          extraCount={celebration.extraCount}
          close={() => setCelebration(null)}
        />
      )}
    </div>
  );
}
