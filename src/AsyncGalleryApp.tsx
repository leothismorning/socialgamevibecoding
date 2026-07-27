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
  UsersRound,
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

function canUseCreativeTools(state: CommunityGalleryState) {
  return state.viewer?.role === 'community' || state.viewer?.condition === 'experimental';
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
  join: (code: string) => void;
  busy: string;
}) {
  const [role, setRole] = useState<'host' | 'creator' | 'community' | null>(null);
  const codes = role === 'host'
    ? ['H01']
    : role === 'creator'
      ? Array.from({ length: 12 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`)
      : role === 'community'
        ? Array.from({ length: 24 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`)
        : [];
  return (
    <section className="async-identity-gate">
      <div className="async-identity-copy">
        <span className="async-eyebrow">JOIN VIBE GALLERY</span>
        <h1>把社区讨论变成可以运行的作品</h1>
        <p>选择老师分配给你的参与者编号。Community Member 可以浏览全部已发布 App，系统也会显示需要认真体验的作品。</p>
      </div>
      <div className="async-identity-picker">
        <div className="async-role-options">
          <button className={role === 'creator' ? 'is-selected' : ''} onClick={() => setRole('creator')}>
            <UserRound /><strong>Creator</strong><span>创作 Initial App，也参与社区讨论</span>
          </button>
          <button className={role === 'community' ? 'is-selected' : ''} onClick={() => setRole('community')}>
            <UsersRound /><strong>Community Member</strong><span>体验、评论与综合社区创意</span>
          </button>
          <button className={role === 'host' ? 'is-selected' : ''} onClick={() => setRole('host')}>
            <Lock /><strong>Host</strong><span>开放研究、查看进度与结束研究</span>
          </button>
        </div>
        {role && (
          <div className={`async-code-grid is-${role}`}>
            {codes.map((code) => (
              <button key={code} disabled={Boolean(busy)} onClick={() => join(code)}>
                <strong>{code}</strong><span>进入</span>
              </button>
            ))}
          </div>
        )}
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
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
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
          <span className="async-eyebrow">LATEST VERSION 已发布</span>
          <h2>{ownApp.title}</h2>
          <p>
            当前为 {latestVersion.kind === 'initial'
              ? 'Initial Version'
              : `Community Version ${latestVersion.version_number - 1}`}。
            Creator 可以随时继续开发；AI 修改会先保存为草稿，只有主动发布后才会更新公开版本。
          </p>
        </div>
        {state.viewer?.condition === 'experimental' ? (
          <button
            className="async-primary"
            disabled={Boolean(busy)}
            onClick={() => setWorkspaceOpen((current) => !current)}
          ><Code2 /> {workspaceOpen ? '收起开发空间' : '继续开发项目'}</button>
        ) : (
          <span className="async-control-continue-note">请继续使用原有外部 vibe-coding 工具修改</span>
        )}
      </section>

      {workspaceOpen && state.viewer?.condition === 'experimental' && (
        <section className="async-studio async-continuation-studio">
          <header>
            <div>
              <span className="async-eyebrow">CREATOR · CONTINUOUS DEVELOPMENT</span>
              <h2>继续开发 {ownApp.title}</h2>
              <p>以当前已发布版本为基础进行多轮对话。每轮修改先保存为草稿，确认满意后再单独发布。</p>
            </div>
            <span className="async-step-chip">Live Project</span>
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
              <div className="async-creator-chat-history" role="log" aria-label="Creator 持续开发对话">
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

  const upload = async (file?: File) => {
    if (!file) return;
    const code = await file.text();
    await action('upload-initial', () => communityGalleryApi.uploadInitial(clientId, {
      title,
      brief,
      prompt,
      code,
    }));
  };

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
          <span className="async-eyebrow">CREATION · INITIAL VERSION</span>
          <h2>先完成你的独立作品</h2>
          <p>先让 AI 生成可运行草稿，再通过多轮对话继续修改。只有你确认满意并主动发布后，作品才会出现在首页。</p>
        </div>
        <span className="async-step-chip">1 / 4 Creation</span>
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
              <label>App 名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：周末去哪玩" /></label>
              <label>一句话简介<input value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="让社区快速理解它能做什么" /></label>
              <label>创作提示<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} placeholder="描述你想做的 App、用户和关键交互" /></label>
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
                ><Sparkles /> {busy === 'generate-initial' ? 'AI 正在开发…' : 'AI 生成 App 草稿'}</button>
                <label className="async-upload-button">
                  <Upload /> 上传 HTML
                  <input
                    type="file"
                    accept=".html,text/html"
                    disabled={!title.trim() || Boolean(busy)}
                    onChange={(event) => void upload(event.target.files?.[0])}
                  />
                </label>
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
                <div className="async-creator-chat-history" role="log" aria-label="Creator 与 AI 的修改对话">
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
          ><Check /> 满意后发布 Initial Version</button>
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
  const canLike = state.viewer?.role !== 'host' && state.viewer?.code !== app.creator_code;
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
          {state.viewer?.role === 'host' && <span>{app.condition_name}</span>}
        </div>
      </header>
      <section className="async-version-preview">
        <span>{isCommunity ? `Community Version ${app.community_version_count}` : 'Initial Version'}</span>
        <AppPreview
          clientId={clientId}
          app={app}
          version={version}
          title={`${app.title} ${isCommunity ? `Community Version ${app.community_version_count}` : 'Initial Version'}`}
          compact
          cacheKey={String(isCommunity ? app.community_version_id : app.initial_version_id || '')}
        />
      </section>
      <div className="async-card-body">
        <div>
          <div className="async-card-kicker-row">
            <span className="async-eyebrow">
              {isCommunity ? '社区共同创作 · 最新版本' : `${app.creator_code} · 原创 App`}
            </span>
            <span className={isCommunity ? 'async-feed-status is-ready' : 'async-feed-status'}>
              {isCommunity
                ? `Community V${app.community_version_count}`
                : app.community_version_id ? 'Initial Version' : '等待社区版本'}
            </span>
          </div>
          <h2>{isCommunity ? `${app.title} · Community V${app.community_version_count}` : app.title}</h2>
          <p>{isCommunity
            ? latestCommunityVersion?.summary || '社区综合讨论后形成的最新可运行版本。'
            : app.brief || '一个由 Creator 自由创作的 vibe-coded App。'}</p>
        </div>
        {isCommunity && selectedSynthesis && (
          <div className="async-card-provenance">
            <GitMerge />
            <span>最新社区版本来自“{selectedSynthesis.title}”</span>
            <small>{selectedSynthesis.contributor_count} 位贡献者 · {selectedSynthesis.source_app_count} 个 App</small>
          </div>
        )}
        <footer>
          <div>
            <button
              className={app.viewer_liked ? 'async-social-button is-liked' : 'async-social-button'}
              disabled={!canLike}
              onClick={like}
              title={canLike ? '表达喜欢，不参与版本选择' : '不能点赞自己的 App'}
            ><Heart /> {app.like_count}</button>
            <span><MessageCircle /> {app.comment_count}</span>
            {app.condition_name === 'experimental' && <span><Lightbulb /> {app.synthesis_count}</span>}
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
  const canParticipate = Boolean(state.viewer && state.viewer.role !== 'host' && state.study.status !== 'closed');
  const showBasket = canUseCreativeTools(state) && state.study.status !== 'closed';

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
          <button className="async-icon-text" disabled={!canParticipate} onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>
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
      {!deleted && replyTo === comment.id && (
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
      {canParticipate && (
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
          <div><span className="async-eyebrow">CREATIVE PROVENANCE</span><h2>{synthesis.title}</h2></div>
          <button onClick={close}><X /></button>
        </header>
        <p className="async-drawer-intro">这条综合评论连接了以下直接创意来源。原作者、来源 App 和讨论位置都会被保留。</p>
        <div className="async-source-list">
          {sources.map((source, index) => (
            <article key={`${source.source_type}-${source.source_id}`}>
              <span>{index + 1}</span>
              <div>
                <header>
                  <strong>{source.author_code}</strong>
                  <small>
                    {source.app_title}
                    {source.version_kind ? ` · ${source.version_kind === 'initial' ? 'Initial Version' : 'Community Version'}` : ''}
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
        <div><strong>版本开发关系</strong><small>先比点赞数，再比综合评论来源数，仍同分则随机；V1 基于 Initial，V2 固定基于 V1</small></div>
      </header>
      <div className="async-version-lineage-grid">
        <article className="is-initial">
          <span>起点</span>
          <strong>Initial Version</strong>
          <small>{formatDate(initial.created_at)}</small>
        </article>
        {communityVersions.map((version) => {
          const iteration = version.version_number - 1;
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
                <span>基于 {base?.kind === 'community' ? `Community V${base.version_number - 1}` : 'Initial'}</span>
                <strong>Community Version {iteration}</strong>
                <small>{selectedLabel ? `采用“${selectedLabel}”` : '外部开发版本'} · {formatDate(version.created_at)}</small>
              </article>
            </div>
          );
        })}
        {communityVersions.length < 2 && (
          <div className="async-version-lineage-step is-pending">
            <span className="async-lineage-arrow"><ArrowRight /></span>
            <article>
              <span>可选</span>
              <strong>Community Version {communityVersions.length + 1}</strong>
              <small>{communityVersions.length ? '等待 Host 锁定第二次最高赞评论' : '等待 Host 锁定第一次最高赞评论'}</small>
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
  const canParticipate = Boolean(state.viewer && state.viewer.role !== 'host' && state.study.status !== 'closed');
  const creativeToolsAvailable = canUseCreativeTools(state) && state.study.status !== 'closed';
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
          <span className="async-eyebrow">VISIBLE CREATIVE EVOLUTION</span>
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
                        ? '跨 App 收藏夹素材'
                        : node.kind === 'external-synthesis'
                          ? '跨 App 综合'
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
                        <Check /> Community V{iteration} 已采用
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
        <span><i className="is-external" /> 跨 App 收藏夹素材</span>
        <span><i className="is-synthesis" /> 综合评论</span>
        <span><i className="is-selected" /> Creator 选择开发</span>
      </footer>

      {replyingTo && (
        <div className="async-overlay" role="dialog" aria-modal="true" aria-label="回复评论">
          <section className="async-flow-reply-dialog">
            <header><div><span className="async-eyebrow">REPLY TO IDEA</span><h2>回复 {replyingTo.author_code}</h2></div><button onClick={() => setReplyingTo(null)}><X /></button></header>
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
              <div><span className="async-eyebrow">DISCUSS THIS DIRECTION</span><h2>{discussionSynthesis.title}</h2></div>
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

type DevelopmentCandidate = {
  sourceType: CommunitySourceType;
  sourceId: number;
  title: string;
  content: string;
  author: string;
};

function IdeaFlowBoard({
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
  generate: (candidate: DevelopmentCandidate) => void;
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
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [departingKeys, setDepartingKeys] = useState<string[]>([]);
  const [returningKey, setReturningKey] = useState('');
  const [sourcesConfirmed, setSourcesConfirmed] = useState(false);
  const [synthesisPrompt, setSynthesisPrompt] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [likedBurstKeys, playLikedBurst] = useTimedBurst();
  const selectionAnimationTimers = useRef<number[]>([]);
  const synthesisBasketRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    selectionAnimationTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);
  useEffect(() => {
    if (!selectionLayer) return;
    const frame = window.requestAnimationFrame(() => {
      synthesisBasketRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectionLayer]);

  const sourceKey = (type: CommunitySourceType, id: number) => `${type}:${id}`;
  const expandedKeySet = new Set(expandedKeys);
  const isLongContent = (content: string) => (
    content.length > 46 || content.split(/\r?\n/).length > 2
  );
  const canParticipate = Boolean(
    state.viewer && state.viewer.role !== 'host' && state.study.status !== 'closed',
  );
  const creativeToolsAvailable = canUseCreativeTools(state) && state.study.status === 'active';
  const isOwner = state.viewer?.role === 'creator' && state.viewer.code === app.creator_code;
  const completedIterations = Number(app.community_version_count || 0);
  const openLayer: 1 | 2 | null = state.study.workflow_stage === 'synthesis_1'
    ? 1
    : state.study.workflow_stage === 'development_1' && completedIterations >= 1
      ? 2
      : null;
  const showSecondLayer = completedIterations >= 1
    || state.study.workflow_stage === 'development_2';

  const targetSyntheses = state.syntheses
    .filter((synthesis) => synthesis.target_app_id === app.id)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
  const viewerHasSubmittedCurrentSynthesis = Boolean(
    openLayer && targetSyntheses.some((synthesis) => (
      Number(synthesis.layer) === Number(openLayer)
      && synthesis.author_code === state.viewer?.code
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

  const commentNode = (
    comment: CommunityComment,
    kind: 'comment' | 'reply',
    _depth: number,
  ): StagedFlowNode => {
    const key = sourceKey('comment', comment.id);
    const expandable = isLongContent(comment.content);
    const expanded = expandable && expandedKeySet.has(key);
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
        ? (expanded ? 190 : expandable ? 146 : 112)
        : (expanded ? 224 : expandable ? 178 : FLOW_NODE_HEIGHT),
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

  const selectedKeySet = new Set(selectedKeys);
  const departingKeySet = new Set(departingKeys);
  const allFlowNodes = [...sourceNodes, ...synthesisNodes];
  const visibleDuringSelection = (node: StagedFlowNode) => (
    !selectionLayer || !selectedKeySet.has(node.key) || departingKeySet.has(node.key)
  );
  const columns = [
    {
      column: 0 as const,
      nodes: sourceNodes.filter((node) => node.column === 0 && visibleDuringSelection(node)),
    },
    {
      column: 1 as const,
      nodes: allFlowNodes.filter((node) => node.column === 1 && visibleDuringSelection(node)).sort((left, right) => (
        Number(Boolean(right.synthesis?.selected_for_iteration))
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
              Number(Boolean(right.synthesis?.selected_for_iteration))
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
  const showCommentEntry = canParticipate && !selectionLayer;
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
    if (layer === 1) return node.sourceType === 'comment';
    if (node.sourceType === 'comment') return true;
    return node.synthesis?.layer === 1;
  };
  const scheduleSelectionAnimation = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    selectionAnimationTimers.current.push(timer);
  };
  const selectSource = (node: StagedFlowNode) => {
    if (!selectionLayer || sourcesConfirmed || !eligibleForLayer(node, selectionLayer)) return;
    if (selectedKeySet.has(node.key)) return;
    setSelectedKeys((current) => {
      if (current.includes(node.key)) return current;
      return [...current, node.key];
    });
    setDepartingKeys((current) => (
      current.includes(node.key) ? current : [...current, node.key]
    ));
    scheduleSelectionAnimation(() => {
      setDepartingKeys((current) => current.filter((key) => key !== node.key));
    }, 620);
  };
  const returnSource = (key: string) => {
    if (sourcesConfirmed) return;
    setSelectedKeys((current) => current.filter((item) => item !== key));
    setDepartingKeys((current) => current.filter((item) => item !== key));
    setReturningKey(key);
    scheduleSelectionAnimation(() => {
      setReturningKey((current) => current === key ? '' : current);
    }, 520);
  };
  const selectedNodes = selectedKeys
    .map((key) => allFlowNodes.find((node) => node.key === key))
    .filter(Boolean) as StagedFlowNode[];
  const canConfirmSources = selectedNodes.length >= 1;
  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  };
  const startSelection = (layer: 1 | 2) => {
    if (viewerHasSubmittedCurrentSynthesis) return;
    setCommentComposerOpen(false);
    setSelectionLayer(layer);
    setSelectedKeys([]);
    setDepartingKeys([]);
    setReturningKey('');
    setSourcesConfirmed(false);
    setSynthesisPrompt('');
  };
  const cancelSelection = () => {
    setSelectionLayer(null);
    setSelectedKeys([]);
    setDepartingKeys([]);
    setReturningKey('');
    setSourcesConfirmed(false);
    setSynthesisPrompt('');
  };
  const confirmSelectedSources = () => {
    if (!selectedNodes.length) return;
    setSynthesisPrompt(selectedNodes
      .map((node) => node.content.trim())
      .filter(Boolean)
      .join('\n\n'));
    setSourcesConfirmed(true);
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

  const hasRunningGeneration = state.generationJobs.some(
    (job) => job.app_id === app.id && job.status === 'running',
  );
  const hasActiveDraft = app.draft_kind === 'community'
    && Number(app.draft_iteration_number || 0) > completedIterations
    && Boolean(app.draft_code);
  const stageSelection = state.stageSelections.find(
    (selection) => selection.app_id === app.id
      && Number(selection.iteration_number) === completedIterations + 1,
  );
  const canStartDevelopment = isOwner
    && Boolean(stageSelection)
    && state.study.workflow_stage === `development_${completedIterations + 1}`
    && completedIterations < 2
    && !hasRunningGeneration
    && !hasActiveDraft;

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

  return (
    <section className="async-flow-section">
      <header className="async-flow-heading">
        <div>
          <span className="async-eyebrow">STAGED COLLECTIVE CREATION</span>
          <h2>创意演化画布</h2>
          <p>普通评论和综合评论都可以随时点赞或取消赞；Host 启动开发时，系统先选择点赞数最高者，同赞时优先来源更多的综合评论，仍同分则随机选择。</p>
        </div>
        <div className="async-flow-heading-actions">
          <span><Workflow /> {edges.length} 条采用连线</span>
          {canParticipate && (
            <button onClick={openBasket}>
              <ShoppingBasket /> 收藏夹 <strong>{state.basket.length}</strong>
            </button>
          )}
        </div>
      </header>

      <VersionLineage state={state} app={app} />

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
                      ? selectionLayer === 1
                        ? '可选择 Initial 评论及收藏夹来源'
                        : 'Initial Version 下产生的评论与第一轮外部来源'
                      : column === 1
                        ? `${nodes.length} 个第一次综合评论 · 按点赞数排序`
                        : column === 2
                          ? selectionLayer === 2
                            ? 'V1 新评论及本轮收藏夹来源，可与前两列共同选用'
                            : 'Community V1 下产生的新评论与第二轮外部来源'
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
                            ? '针对 Community V1 提出普通评论'
                            : '针对 Initial Version 提出普通评论'}</strong>
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
                        ? '针对 Community V1 提出普通评论'
                        : '针对 Initial Version 提出普通评论'}</strong>
                      <span>分享体验、建议、技术细节或新的使用场景。</span>
                      <em><span>开始输入</span> <ArrowRight /></em>
                    </button>
                  )
                )}
                {layerIsOpen && !selectionLayer && (
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
                      ? '每个人在当前 App 的本轮只能提交一条；你仍可给其他综合评论点赞。'
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
              selectionLayer && !sourcesConfirmed && eligibleForLayer(node, selectionLayer),
            );
            const sourceSelected = selectedKeySet.has(node.key);
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
            const selectedForIteration = Number(
              node.comment?.selected_for_iteration
              || node.synthesis?.selected_for_iteration
              || 0,
            );
            const isCurrentWinner = stageSelection?.source_type === node.sourceType
              && Number(stageSelection.source_id) === node.sourceId;
            const canLikeSynthesis = Boolean(
              node.synthesis
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
                  selectable ? 'is-selectable-source' : '',
                  sourceSelected ? 'is-source-selected' : '',
                  departingKeySet.has(node.key) ? 'is-source-departing' : '',
                  returningKey === node.key ? 'is-source-returning' : '',
                  node.expandable ? 'has-expandable-content' : '',
                  contentExpanded ? 'is-content-expanded' : '',
                  node.comment?.deleted_at || node.synthesis?.deleted_at ? 'is-deleted' : '',
                  selectedForIteration ? 'is-selected-for-build' : '',
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
                    {node.kind === 'comment'
                      ? '普通评论'
                      : node.kind === 'reply'
                        ? '回复'
                        : node.kind === 'external-comment'
                          ? '跨 App 收藏夹评论'
                          : node.kind === 'external-synthesis'
                            ? '跨 App 第一次综合'
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
                        <Lightbulb /> 综合了 {synthesisIdeaCount} 个 idea
                      </span>
                    )}
                    {!node.synthesis && node.used && outgoingSynthesisCount > 0 && (
                      <span className="async-flow-used">
                        <GitBranch /> 被综合 {outgoingSynthesisCount} 次
                      </span>
                    )}
                    {selectedForIteration > 0 && (
                      <span className="async-flow-selected">
                        <Check /> 第 {selectedForIteration} 次开发入选
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
                        {node.comment.app_id === app.id && (
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
                        {node.kind === 'synthesis' && !node.synthesis.deleted_at && (
                          <button onClick={(event) => { stop(event); setDiscussionSynthesis(node.synthesis!); }}><MessageCircle /> 讨论</button>
                        )}
                        {!node.synthesis.deleted_at && (
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
                    {isCurrentWinner && canStartDevelopment && (
                      <button
                        className="is-build"
                        onClick={(event) => {
                          stop(event);
                          generate({
                            sourceType: node.sourceType,
                            sourceId: node.sourceId,
                            title: stageSelection?.source_title
                              || node.title
                              || `普通评论 · ${node.author}`,
                            content: stageSelection?.source_content || node.content,
                            author: stageSelection?.source_author_code || node.author,
                          });
                        }}
                      ><Sparkles /> 按入选提示词开发</button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}

          {sourceNodes.length === 0 && !showCommentEntry && (
            <div className="async-flow-empty-source" style={{ left: FLOW_START_X, top: FLOW_START_Y }}>
              <MessageCircle /><strong>还没有普通评论</strong><span>发布第一个想法后，节点会出现在这里。</span>
            </div>
          )}
        </div>
      </div>

      {selectionLayer && (
        <section ref={synthesisBasketRef} className="async-synthesis-basket-workbench">
          <header>
            <div>
              <span>第 {selectionLayer} 次综合 · 本次综合篮</span>
              <strong>{sourcesConfirmed ? '理解这些想法，并重新写成你的综合提示词' : '点击画布中的评论，把想法放进篮子'}</strong>
              <small>
                {sourcesConfirmed
                  ? '已确认来源；如需增删评论，请先返回修改选择'
                  : '可以只选择一条，也可以选择任意多条；点击篮中卡片即可放回'}
              </small>
            </div>
            <button className="async-secondary" onClick={cancelSelection}><X /> 取消综合</button>
          </header>

          <div className="async-synthesis-basket-body">
            <div className="async-synthesis-basket-mark" aria-hidden="true">
              <ShoppingBasket />
              <span>{selectedNodes.length}<small>条</small></span>
            </div>
            <div className="async-synthesis-basket-slots">
              {selectedNodes.length === 0 ? (
                <div className="async-synthesis-basket-empty">
                  <Heart />
                  <span>点击画布中的评论开始选择</span>
                </div>
              ) : selectedNodes.map((node) => (
                  <button
                    className={[
                      'async-synthesis-basket-card',
                      departingKeySet.has(node.key) ? 'is-just-added' : '',
                      sourcesConfirmed ? 'is-locked' : '',
                    ].filter(Boolean).join(' ')}
                    key={node.key}
                    title={sourcesConfirmed ? '返回修改选择后可以移除' : '点击放回画布并取消选择'}
                    onClick={() => returnSource(node.key)}
                  >
                    <span className="async-synthesis-basket-card-idea">
                      <Lightbulb strokeWidth={2.5} />
                    </span>
                    <small>{node.author} · {node.appTitle}</small>
                    <strong>{node.title || (node.kind === 'reply' ? '回复' : '普通评论')}</strong>
                    <p>{node.content}</p>
                    <em>{sourcesConfirmed ? <><Lock /> 来源已确认</> : <><ArrowLeft /> 点击放回</>}</em>
                  </button>
              ))}
            </div>
          </div>

          {!sourcesConfirmed ? (
            <div className="async-synthesis-basket-confirm">
              <span>{selectedNodes.length
                ? `已选择 ${selectedNodes.length} 条评论，不设数量上限`
                : '至少选择一条评论后继续'}</span>
              <button
                className="async-primary"
                disabled={!canConfirmSources}
                onClick={confirmSelectedSources}
              ><Check /> 确认选择</button>
            </div>
          ) : (
            <div className="async-synthesis-basket-prompt">
              <label>
                <span>你的综合提示词</span>
                <strong>
                  您的提示词将展示在卡片上，后面所有人会通过点赞选择要开发的综合评论。
                </strong>
                <textarea
                  value={synthesisPrompt}
                  onChange={(event) => setSynthesisPrompt(event.target.value)}
                  rows={5}
                  placeholder="理解所选评论后，写出可以直接交给 vibe-coding AI 实现的完整提示词…"
                />
              </label>
              <div>
                <button
                  className="async-secondary"
                  onClick={() => setSourcesConfirmed(false)}
                ><ArrowLeft /> 返回修改选择</button>
                <button
                  className="async-primary"
                  disabled={!synthesisPrompt.trim() || Boolean(busy)}
                  onClick={publishSynthesis}
                ><GitMerge /> 发布综合评论</button>
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="async-flow-legend">
        <span><i className="is-comment" /> 普通评论与回复</span>
        <span><i className="is-external" /> 跨 App 收藏夹素材</span>
        <span><i className="is-synthesis" /> 综合评论</span>
        <span><i className="is-selected" /> Host 锁定开发</span>
      </footer>

      {replyingTo && (
        <div className="async-overlay" role="dialog" aria-modal="true" aria-label="回复评论">
          <section className="async-flow-reply-dialog">
            <header><div><span className="async-eyebrow">REPLY TO IDEA</span><h2>回复 {replyingTo.author_code}</h2></div><button onClick={() => setReplyingTo(null)}><X /></button></header>
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
              <div><span className="async-eyebrow">EDIT YOUR COMMENT</span><h2>编辑自己的评论</h2></div>
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
              <div><span className="async-eyebrow">EDIT YOUR SYNTHESIS</span><h2>编辑自己的综合评论</h2></div>
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
              <div><span className="async-eyebrow">DISCUSS THIS DIRECTION</span><h2>{discussionSynthesis.title}</h2></div>
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
  const canGenerate = isOwner && !app.community_version_id && state.study.status !== 'closed';
  return (
    <article className="async-synthesis-card">
      <header><span><GitMerge /></span><div><strong>{synthesis.title}</strong><small>{synthesis.author_code} · {formatDate(synthesis.created_at)}</small></div></header>
      <p>{synthesis.content}</p>
      <div className="async-synthesis-meta">
        <span>{synthesis.source_count} 条素材</span>
        <span>{synthesis.source_app_count} 个 App</span>
        <span>{synthesis.contributor_count} 位贡献者</span>
      </div>
      <footer>
        <button onClick={viewSources}><Link2 /> 查看来源</button>
        {canUseCreativeTools(state) && state.viewer?.role !== 'host' && state.study.status !== 'closed' && (
          <button
            className={synthesis.viewer_in_basket ? 'is-in-basket' : ''}
            onClick={() => action(`basket-synthesis-${synthesis.id}`, () => communityGalleryApi.toggleBasket(clientId, 'synthesis', synthesis.id))}
          ><ShoppingBasket /> {synthesis.viewer_in_basket ? '已收藏' : '收藏'}</button>
        )}
        {canGenerate && <button className="is-generate" onClick={generate}><Sparkles /> 生成 Community Version</button>}
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
          <div><span className="async-eyebrow">FAVORITES</span><h2>收藏夹 <em>{state.basket.length}</em></h2></div>
          <button onClick={close}><X /></button>
        </header>
        <p className="async-drawer-intro">这里是你的个人素材库。仅收藏的跨 App 内容平时不会占据画布；进入综合选材时才临时出现，被综合采用后才会作为正式来源节点保留。</p>
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
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploadPrompt, setUploadPrompt] = useState('');
  const latestJob = state.generationJobs.find((job) => job.app_id === app.id);
  const events = latestJob
    ? state.generationEvents.filter((event) => Number(event.job_id) === Number(latestJob.id))
    : [];
  const iterationNumber = Number(app.community_version_count || 0) + 1;
  const appVersions = state.versions
    .filter((version) => version.app_id === app.id)
    .sort((left, right) => left.version_number - right.version_number);
  const initialVersion = appVersions.find((version) => version.kind === 'initial');
  const firstCommunityVersion = appVersions.find(
    (version) => version.kind === 'community' && version.version_number === 2,
  );
  const baseVersionId = iterationNumber === 2
    ? Number(firstCommunityVersion?.id || 0)
    : Number(initialVersion?.id || app.initial_version_id);
  const expectedStage = `development_${iterationNumber}`;
  const stageIsOpen = state.study.workflow_stage === expectedStage;
  const stageSelection = state.stageSelections.find(
    (selection) => selection.app_id === app.id
      && Number(selection.iteration_number) === iterationNumber,
  );
  const selectedSynthesis = stageSelection?.source_type === 'synthesis'
    ? state.syntheses.find(
        (synthesis) => Number(synthesis.id) === Number(stageSelection.source_id),
      )
    : undefined;
  const selectedComment = stageSelection?.source_type === 'comment'
    ? state.comments.find(
        (comment) => Number(comment.id) === Number(stageSelection.source_id),
      )
    : undefined;
  const selectedDirectionLabel = stageSelection?.source_title
    || stageSelection?.source_content
    || selectedSynthesis?.title
    || selectedComment?.content
    || '社区入选方向';
  const hasCommunityDraft = app.draft_kind === 'community'
    && Number(app.draft_iteration_number || 0) > Number(app.community_version_count || 0)
    && Boolean(app.draft_code);
  const upload = async (file?: File) => {
    if (!file) return;
    const code = await file.text();
    await action('upload-community', () => communityGalleryApi.uploadCommunity(clientId, app.id, {
      code,
      summary: uploadSummary,
      prompt: uploadPrompt,
      baseVersionId,
    }));
  };

  if (app.community_version_count >= 2) return null;
  if (!stageIsOpen && !hasCommunityDraft && latestJob?.status !== 'running') return null;

  return (
    <section className="async-community-studio">
      <header>
        <div><span className="async-eyebrow">PROTOTYPE · HUMAN CURATION</span><h2>Community Version {iterationNumber} 工作台</h2></div>
        <span className="async-step-chip">3 / 4 Prototype</span>
      </header>
      {state.viewer?.condition === 'control' && !hasCommunityDraft && (
        <div className="async-control-upload">
          <p>
            {stageIsOpen
              ? `Host 已进入第 ${iterationNumber} 次开发。请在原有外部 vibe-coding 工具中完成原型，再上传回平台。`
              : '此轮开发已经关闭；当前草稿仍可查看和发布。'}
          </p>
          <div className="async-fixed-base-note"><GitBranch />
            {iterationNumber === 1 ? '本轮固定基于 Initial Version。' : '本轮固定基于 Community Version 1。'}
          </div>
          <label>开发说明<textarea value={uploadPrompt} onChange={(event) => setUploadPrompt(event.target.value)} rows={3} placeholder="简要记录你如何使用社区评论" /></label>
          <label>版本摘要<input value={uploadSummary} onChange={(event) => setUploadSummary(event.target.value)} placeholder="这个版本主要改变了什么" /></label>
          <label className={`async-upload-button ${stageIsOpen ? '' : 'is-disabled'}`}><Upload /> 上传外部 Community Version {iterationNumber}<input disabled={!stageIsOpen} type="file" accept=".html,text/html" onChange={(event) => void upload(event.target.files?.[0])} /></label>
        </div>
      )}
      {latestJob?.status === 'running' && (
        <div className="async-generation-progress">
          <LoaderCircle className="spin" />
          <div><strong>AI 正在把入选评论实现并自动发布为新版本</strong><span>页面会自动刷新开发步骤</span></div>
          <ol>
            {events.map((event) => <li key={event.id} className={`is-${event.status}`}><Check /> {event.title}</li>)}
          </ol>
        </div>
      )}
      {hasCommunityDraft && (
        <div className="async-community-draft-layout">
          <div className="async-community-draft-preview">
            <AppPreview clientId={clientId} app={app} version="draft" title={`${app.title} Community Draft`} cacheKey={state.serverNow} />
          </div>
          <div>
            <p>{state.viewer?.condition === 'experimental'
              ? `系统正在把 Host 锁定的“${selectedDirectionLabel}”自动发布为社区新版本。`
              : '试玩从外部工具上传的社区版本草稿，确认无误后再发布。'}</p>
            {state.viewer?.condition === 'experimental' ? (
              <>
                <label>继续修改<textarea value={revision} onChange={(event) => setRevision(event.target.value)} rows={4} placeholder="补充约束、修复问题或调整实现细节" /></label>
                <button
                  className="async-secondary"
                  disabled={!revision.trim() || Boolean(busy)}
                  onClick={() => action('refine-community', async () => {
                    const next = await communityGalleryApi.refine(clientId, revision);
                    setRevision('');
                    return next;
                  })}
                ><Bot /> AI 修改草稿</button>
              </>
            ) : (
              <>
                <p>如需修改，请返回原有外部 vibe-coding 工具，完成后重新上传 HTML。</p>
                <label className="async-upload-button"><Upload /> 重新上传外部版本<input type="file" accept=".html,text/html" onChange={(event) => void upload(event.target.files?.[0])} /></label>
              </>
            )}
            {state.viewer?.condition === 'control' && (
              <button
                className="async-primary"
                disabled={Boolean(busy)}
                onClick={() => action('publish-community', () => communityGalleryApi.publishCommunity(clientId, app.id))}
              ><Check /> 发布 Community Version {Number(app.draft_iteration_number || iterationNumber)}</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function GenerateCommunityDialog({
  state,
  app,
  candidate,
  clientId,
  action,
  busy,
  close,
}: {
  state: CommunityGalleryState;
  app: CommunityApp;
  candidate: DevelopmentCandidate;
  clientId: string;
  action: (label: string, task: () => Promise<CommunityGalleryState>) => Promise<void>;
  busy: string;
  close: () => void;
}) {
  const [instruction, setInstruction] = useState(candidate.content);
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
  useEffect(() => {
    setInstruction(candidate.content);
  }, [candidate.content, candidate.sourceId, candidate.sourceType]);
  return (
    <div className="async-overlay" role="dialog" aria-modal="true" aria-label="生成 Community Version">
      <section className="async-generate-dialog">
        <header><div><span className="async-eyebrow">IN-SITU AI PROTOTYPING</span><h2>把“{candidate.title}”开发成 Community Version {iterationNumber}</h2></div><button onClick={close}><X /></button></header>
        <blockquote>{candidate.content}</blockquote>
        <div className="async-fixed-base-note is-dialog"><GitBranch />
          {iterationNumber === 1
            ? 'Host 已按“点赞数 → 来源数 → 随机”锁定本 App 的评论；本轮固定从 Initial Version 开发。'
            : 'Host 已按“点赞数 → 来源数 → 随机”锁定本 App 的评论；本轮固定在 Community Version 1 上继续开发。'}
        </div>
        <p>系统已将入选的{candidate.sourceType === 'synthesis' ? '综合评论' : '普通评论'}自动设为开发提示词，并会同时读取 {selectedBase?.kind === 'community' ? 'Community Version 1' : 'Initial Version'}{candidate.sourceType === 'synthesis' ? '和完整来源链' : ''}。Creator 可以直接开发，也可以在不改变入选方向的前提下补充约束。</p>
        <label>
          开发提示词（默认来自最高赞评论）
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={6}
            placeholder="系统会默认使用入选评论的文本…"
          />
        </label>
        <button
          className="async-primary"
          disabled={Boolean(busy) || !baseVersionId}
          onClick={() => action('generate-community', async () => {
            const next = await communityGalleryApi.generateCommunity(
              clientId,
              app.id,
              candidate.sourceType,
              candidate.sourceId,
              instruction,
              baseVersionId,
            );
            close();
            return next;
          })}
        ><Sparkles /> {busy === 'generate-community' ? 'AI 正在开发…' : `使用该提示词生成 Community Version ${iterationNumber}`}</button>
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
  const [generateCandidate, setGenerateCandidate] = useState<DevelopmentCandidate | null>(null);
  const isOwner = state.viewer?.role === 'creator' && state.viewer.code === app.creator_code;
  const assignment = state.assignments.find((item) => item.app_id === app.id);

  useEffect(() => {
    void communityGalleryApi.track(clientId, 'open_app_detail', 'app', app.id, {
      assigned: Boolean(assignment),
    });
  }, [app.id, assignment, clientId]);

  return (
    <section className="async-app-detail">
      <header className="async-detail-heading">
        <div>
          <span className="async-eyebrow">{app.creator_code} · {assignment ? '你的指定体验 App' : '社区 App'}</span>
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
                ? 'Initial Version'
                : `Community V${version.version_number - 1}`}
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
            title={`${app.title} ${viewedVersion.kind} ${viewedVersion.version_number}`}
            cacheKey={String(viewedVersion.id)}
          />
        )}
      </div>

      {isOwner && <CommunityDraftPanel state={state} app={app} clientId={clientId} action={action} busy={busy} />}

      {app.condition_name === 'experimental' ? (
        <IdeaFlowBoard
          state={state}
          app={app}
          clientId={clientId}
          action={action}
          busy={busy}
          openBasket={openBasket}
          viewSources={setSourceSynthesis}
          generate={setGenerateCandidate}
        />
      ) : (
        <div className="async-discussion-layout is-control">
          <section className="async-discussion-panel">
            <header><div><MessageCircle /><span><strong>普通评论区</strong><small>像社交平台一样自由讨论和回复</small></span></div><em>{app.comment_count}</em></header>
            <CommentThread
              state={state}
              app={app}
              clientId={clientId}
              action={action}
              busy={busy}
              openSynthesis={setSourceSynthesis}
            />
          </section>
        </div>
      )}

      {sourceSynthesis && <SourceDrawer state={state} synthesis={sourceSynthesis} close={() => setSourceSynthesis(null)} />}
      {generateCandidate && (
        <GenerateCommunityDialog
          state={state}
          app={app}
          candidate={generateCandidate}
          clientId={clientId}
          action={action}
          busy={busy}
          close={() => setGenerateCandidate(null)}
        />
      )}
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
  const creatorParticipants = state.participants.filter((participant) => participant.role === 'creator');
  const communityParticipants = state.participants.filter((participant) => participant.role === 'community');
  const serverControlCreators = creatorParticipants
    .filter((participant) => participant.condition_name === 'control')
    .map((participant) => participant.code)
    .sort();
  const serverControlCommunity = communityParticipants
    .filter((participant) => participant.condition_name === 'control')
    .map((participant) => participant.code)
    .sort();
  const [controlCreators, setControlCreators] = useState<string[]>(serverControlCreators);
  const [controlCommunity, setControlCommunity] = useState<string[]>(serverControlCommunity);

  useEffect(() => {
    setControlCreators(serverControlCreators);
    setControlCommunity(serverControlCommunity);
  }, [state.study.conditions_configured, state.study.id]);

  const toggleConditionMember = (
    code: string,
    values: string[],
    limit: number,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (values.includes(code)) {
      setter(values.filter((value) => value !== code));
      return;
    }
    if (values.length < limit) setter([...values, code].sort());
  };
  const conditionsDirty = controlCreators.join(',') !== serverControlCreators.join(',')
    || controlCommunity.join(',') !== serverControlCommunity.join(',');
  const conditionSelectionValid = controlCreators.length === 6 && controlCommunity.length === 12;
  const joined = state.participants.filter((participant) => participant.joined).length;
  const communityVersions = state.apps.filter((app) => app.community_version_id).length;
  const experimentalApps = state.apps.filter(
    (app) => app.condition_name === 'experimental' && app.status === 'published',
  );
  const stage = state.study.workflow_stage;
  const publishedApps = state.apps.filter((app) => app.status === 'published');
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
      };
    }
    if (publishedVersion || job?.status === 'completed') {
      return {
        key: 'completed',
        label: '成功',
        detail: `Community V${iterationNumber} 已发布`,
        time: job?.completed_at || publishedVersion?.created_at,
        jobId: job?.id,
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
        detail: latestEvent?.title
          || (app.condition_name === 'control' ? 'Creator 已上传草稿，等待发布' : 'AI 正在生成新版本'),
        time: latestEvent?.updated_at || job?.created_at,
        jobId: job?.id,
      };
    }
    return {
      key: 'pending',
      label: '未开始',
      detail: app.condition_name === 'control'
        ? '等待 Creator 从外部工具上传'
        : '等待本轮开发启动',
      time: undefined,
      jobId: undefined,
    };
  };
  const activeDevelopmentIteration: 1 | 2 = stage === 'development_2' ? 2 : 1;
  const activeDevelopmentStatuses = publishedApps.map(
    (app) => developmentStatusFor(app, activeDevelopmentIteration),
  );
  const activeDevelopmentCounts = {
    running: activeDevelopmentStatuses.filter((status) => status.key === 'running').length,
    completed: activeDevelopmentStatuses.filter((status) => status.key === 'completed').length,
    failed: activeDevelopmentStatuses.filter((status) => status.key === 'failed').length,
  };
  const appsWithFirstRoundCandidates = experimentalApps.filter((app) => (
    state.comments.some((comment) => (
      comment.app_id === app.id
      && comment.target_type === 'app'
      && Number(comment.version_id) === Number(app.initial_version_id)
    ))
    || state.syntheses.some((synthesis) => (
      synthesis.target_app_id === app.id && Number(synthesis.layer) === 1
    ))
  ));
  const appsWithSecondRoundCandidates = experimentalApps.filter((app) => {
    const communityV1 = state.versions.find((version) => (
      version.app_id === app.id
      && version.kind === 'community'
      && Number(version.version_number) === 2
    ));
    return state.comments.some((comment) => (
      comment.app_id === app.id
      && comment.target_type === 'app'
      && Number(comment.version_id) === Number(communityV1?.id)
    )) || state.syntheses.some((synthesis) => (
      synthesis.target_app_id === app.id && Number(synthesis.layer) === 2
    ));
  });
  const appsWithV1 = experimentalApps.filter((app) => Number(app.community_version_count || 0) >= 1);
  const canLockFirstDevelopment = experimentalApps.length > 0
    && appsWithFirstRoundCandidates.length === experimentalApps.length;
  const canLockSecondDevelopment = experimentalApps.length > 0
    && appsWithV1.length === experimentalApps.length
    && appsWithSecondRoundCandidates.length === experimentalApps.length;
  const missingAutomaticJobs = (iterationNumber: 1 | 2) => {
    const selectedAppIds = new Set(
      state.stageSelections
        .filter((selection) => Number(selection.iteration_number) === iterationNumber)
        .map((selection) => selection.app_id),
    );
    const startedAppIds = new Set(
      state.generationJobs
        .filter((job) => Number(job.iteration_number) === iterationNumber)
        .map((job) => job.app_id),
    );
    return experimentalApps.filter(
      (app) => selectedAppIds.has(app.id) && !startedAppIds.has(app.id),
    );
  };
  const missingFirstAutomaticJobs = missingAutomaticJobs(1);
  const missingSecondAutomaticJobs = missingAutomaticJobs(2);
  const rollbackIteration = stage === 'development_1' ? 1 : stage === 'development_2' ? 2 : null;
  const hasCurrentRoundWork = rollbackIteration !== null && (
    state.generationJobs.some((job) => Number(job.iteration_number) === rollbackIteration)
    || state.apps.some((app) => (
      app.draft_kind === 'community'
      && Number(app.draft_iteration_number) === rollbackIteration
    ))
    || state.versions.some((version) => (
      version.kind === 'community'
      && Number(version.version_number) === rollbackIteration + 1
    ))
  );
  const stageCopy = stage === 'synthesis_1'
    ? {
        eyebrow: 'STAGE 1 · FIRST-LAYER SYNTHESIS',
        title: '等待社区评论、综合与点赞',
        detail: `已有 ${appsWithFirstRoundCandidates.length}/${experimentalApps.length} 个 App 存在第一轮可评选评论。系统先比点赞数，同赞时比较综合评论的来源数（普通评论为 0），仍同分则随机选择。`,
      }
    : stage === 'development_1'
      ? {
          eyebrow: 'STAGE 2 · COMMUNITY VERSION 1',
          title: '系统正在生成并自动发布 Community V1',
          detail: `自动开发任务 ${state.generationJobs.filter((job) => Number(job.iteration_number) === 1).length}/${experimentalApps.length}，已发布 ${appsWithV1.length}/${experimentalApps.length} 个 V1。`,
        }
      : {
          eyebrow: 'STAGE 3 · COMMUNITY VERSION 2',
          title: '系统正在基于 V1 自动生成并发布 Community V2',
          detail: `自动开发任务 ${state.generationJobs.filter((job) => Number(job.iteration_number) === 2).length}/${experimentalApps.length}。生成完成后最终社区版本会立即发布。`,
        };
  return (
    <section className="async-host-panel">
      <header>
        <div><span className="async-eyebrow">HOST · ASYNCHRONOUS STUDY</span><h2>研究控制与完成进度</h2><p>Host 锁定评选结果后，系统会立即后台生成并自动发布实验组 Community Version；Creator 仍可随时进入开发空间继续修改。</p></div>
        <div className="async-host-actions">
          <a href={`/api/community-gallery/export?clientId=${encodeURIComponent(clientId)}`}><Download /> 导出研究数据</a>
          {state.study.status === 'setup' && (
            <button
              disabled={Boolean(busy) || !state.study.conditions_configured || conditionsDirty}
              title={!state.study.conditions_configured || conditionsDirty
                ? '请先选择并保存对照组成员'
                : '记录正式研究开始'}
              onClick={() => action('start-study', () => communityGalleryApi.startStudy(clientId))}
            ><Play /> 记录正式研究开始</button>
          )}
          {state.study.status === 'active' && (
            <button disabled={Boolean(busy)} onClick={() => action('close-study', () => communityGalleryApi.closeStudy(clientId))}><Check /> 结束研究</button>
          )}
          {state.study.status === 'closed' && (
            <button disabled={Boolean(busy)} onClick={() => action('new-study', () => communityGalleryApi.newStudy(clientId))}><RefreshCw /> 新建研究</button>
          )}
        </div>
      </header>
      {state.study.status === 'setup' && (
        <section className="async-condition-assignment">
          <header>
            <div>
              <span className="async-eyebrow">HOST · GROUP ASSIGNMENT</span>
              <h3>由 Host 选择对照组</h3>
              <p>选择 6 名 Creator 和 12 名 Community Member 进入传统评论平台；未选中的参与者自动进入完整 Vibe Gallery。保存并开始研究后分组锁定。</p>
            </div>
            <div className="async-condition-save">
              <span className={conditionSelectionValid ? 'is-ready' : ''}>
                {controlCreators.length}/6 Creator · {controlCommunity.length}/12 Community
              </span>
              <button
                className="async-primary"
                disabled={Boolean(busy) || !conditionSelectionValid || (!conditionsDirty && state.study.conditions_configured)}
                onClick={() => action(
                  'save-study-conditions',
                  () => communityGalleryApi.setConditions(
                    clientId,
                    controlCreators,
                    controlCommunity,
                  ),
                )}
              ><Check /> {state.study.conditions_configured && !conditionsDirty ? '分组已保存' : '保存分组'}</button>
            </div>
          </header>
          <div className="async-condition-groups">
            <section>
              <header><div><strong>Creator 对照组</strong><small>请选择 6 人</small></div><em>{controlCreators.length}/6</em></header>
              <div>
                {creatorParticipants.map((participant) => (
                  <button
                    key={participant.code}
                    className={controlCreators.includes(participant.code) ? 'is-control' : ''}
                    disabled={Boolean(busy)}
                    onClick={() => toggleConditionMember(
                      participant.code,
                      controlCreators,
                      6,
                      setControlCreators,
                    )}
                  >
                    <strong>{participant.code}</strong>
                    <span>{controlCreators.includes(participant.code) ? '对照组' : '实验组'}</span>
                    {participant.joined ? <i>已进入</i> : null}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <header><div><strong>Community Member 对照组</strong><small>请选择 12 人</small></div><em>{controlCommunity.length}/12</em></header>
              <div>
                {communityParticipants.map((participant) => (
                  <button
                    key={participant.code}
                    className={controlCommunity.includes(participant.code) ? 'is-control' : ''}
                    disabled={Boolean(busy)}
                    onClick={() => toggleConditionMember(
                      participant.code,
                      controlCommunity,
                      12,
                      setControlCommunity,
                    )}
                  >
                    <strong>{participant.code}</strong>
                    <span>{controlCommunity.includes(participant.code) ? '对照组' : '实验组'}</span>
                    {participant.joined ? <i>已进入</i> : null}
                  </button>
                ))}
              </div>
            </section>
          </div>
          <footer>
            <span><i className="is-control" /> 已选择：传统普通评论区</span>
            <span><i className="is-experimental" /> 未选择：综合评论与 AI 开发功能</span>
          </footer>
        </section>
      )}
      {state.study.status === 'active' && (
        <section className="async-host-stage">
          <div>
            <span className="async-eyebrow">{stageCopy.eyebrow}</span>
            <strong>{stageCopy.title}</strong>
            <p>{stageCopy.detail}</p>
          </div>
          <aside className="async-host-stage-actions">
            {rollbackIteration !== null && (
              <button
                className="async-secondary"
                disabled={Boolean(busy) || hasCurrentRoundWork}
                title={hasCurrentRoundWork
                  ? `第 ${rollbackIteration} 次开发已经开始，不能返回上一阶段`
                  : '撤销本轮锁定并返回上一阶段'}
                onClick={() => action(
                  'return-to-previous-stage',
                  () => communityGalleryApi.returnToPreviousStage(clientId),
                )}
              ><ArrowLeft /> 返回上一阶段</button>
            )}
            {stage === 'synthesis_1' && (
              <button
                className="async-primary"
                disabled={Boolean(busy) || !canLockFirstDevelopment}
                onClick={() => action('enter-development-1', () => communityGalleryApi.enterDevelopment(clientId, 1))}
              ><Lock /> 锁定评选结果并自动发布 V1</button>
            )}
            {stage === 'development_1' && (
              <>
                {missingFirstAutomaticJobs.length > 0 && (
                  <button
                    className="async-primary"
                    disabled={Boolean(busy)}
                    onClick={() => action(
                      'resume-development-1',
                      () => communityGalleryApi.enterDevelopment(clientId, 1),
                    )}
                  ><Sparkles /> 启动缺失的第一次自动开发（{missingFirstAutomaticJobs.length}）</button>
                )}
                <button
                  className="async-primary"
                  disabled={Boolean(busy) || !canLockSecondDevelopment}
                  title={!canLockSecondDevelopment
                    ? `需要每个实验组 App 都发布 V1，并至少有一条针对 V1 的第二轮普通评论或第二轮综合评论（当前 ${appsWithSecondRoundCandidates.length}/${experimentalApps.length}）`
                    : '只从针对 Community V1 的第二轮普通评论和第二轮综合评论中评选'}
                  onClick={() => action('enter-development-2', () => communityGalleryApi.enterDevelopment(clientId, 2))}
                ><Lock /> 锁定评选结果并自动发布 V2</button>
              </>
            )}
            {stage === 'development_2' && (
              missingSecondAutomaticJobs.length > 0
                ? (
                    <button
                      className="async-primary"
                      disabled={Boolean(busy)}
                      onClick={() => action(
                        'resume-development-2',
                        () => communityGalleryApi.enterDevelopment(clientId, 2),
                      )}
                    ><Sparkles /> 启动缺失的第二次自动开发（{missingSecondAutomaticJobs.length}）</button>
                  )
                : activeDevelopmentCounts.failed > 0
                  ? <span className="async-stage-failed"><X /> 第二次开发失败 {activeDevelopmentCounts.failed} 个</span>
                  : activeDevelopmentCounts.running > 0
                    ? <span className="async-stage-running"><LoaderCircle className="spin" /> 第二次开发中 {activeDevelopmentCounts.running} 个</span>
                    : <span className="async-stage-complete"><Check /> 第二次开发已完成</span>
            )}
          </aside>
        </section>
      )}
      <div className="async-host-stats">
        <article><span>Control Initial Apps</span><strong>{state.counts.controlApps} / 6</strong></article>
        <article><span>Vibe Gallery Initial Apps</span><strong>{state.counts.experimentalApps} / 6</strong></article>
        <article><span>已进入参与者</span><strong>{joined} / 37</strong></article>
        <article><span>Community Versions</span><strong>{communityVersions} / 12</strong></article>
      </div>
      {publishedApps.length > 0 && (
        <section className="async-host-development-board">
          <header>
            <div>
              <span className="async-eyebrow">APP DEVELOPMENT STATUS</span>
              <h3>每个 App 的开发状态</h3>
              <p>状态来自后台开发任务和已发布版本；失败时会保留具体原因，便于 Host 立即定位问题。</p>
            </div>
            <div className="async-development-summary">
              <span className="is-running"><LoaderCircle /> 开发中 {activeDevelopmentCounts.running}</span>
              <span className="is-completed"><CheckCircle2 /> 成功 {activeDevelopmentCounts.completed}</span>
              <span className="is-failed"><X /> 失败 {activeDevelopmentCounts.failed}</span>
            </div>
          </header>
          <div className="async-development-table" role="table" aria-label="App 开发状态">
            <div className="async-development-table-heading" role="row">
              <span role="columnheader">App</span>
              <span role="columnheader">第一次开发 · V1</span>
              <span role="columnheader">第二次开发 · V2</span>
            </div>
            {publishedApps.map((app) => {
              const firstStatus = developmentStatusFor(app, 1);
              const secondStatus = developmentStatusFor(app, 2);
              return (
                <article key={app.id} role="row">
                  <div className="async-development-app" role="cell">
                    <span>{app.condition_name === 'control' ? '对照组' : '实验组'}</span>
                    <strong>{app.title}</strong>
                    <small>{app.creator_code}</small>
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
                      {status.key === 'failed' && status.jobId && app.condition_name === 'experimental' && (
                        <button
                          className="async-retry-development"
                          disabled={Boolean(busy)}
                          onClick={() => action(
                            `retry-development-${status.jobId}`,
                            () => communityGalleryApi.retryDevelopment(clientId, status.jobId!),
                          )}
                        ><RefreshCw /> 重新开发</button>
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
          <div><span className="async-eyebrow">YOUR CREATIVE IMPACT</span><h2>消息中心</h2></div>
          <button onClick={close} aria-label="关闭消息中心"><X /></button>
        </header>
        <p className="async-drawer-intro">当你的普通评论或综合评论被 Creator 采用并进入开发流程时，消息会保留在这里。</p>
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
        <small>YOUR IDEA IS BECOMING REAL</small>
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
      setError(cause instanceof Error ? cause.message : '无法加载 Vibe Gallery。');
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
    const creatorApp = state.viewer.role === 'creator'
      ? state.apps.find((app) => app.creator_code === state.viewer?.code)
      : undefined;
    const creatorIsEditingDraft = state.viewer.role === 'creator' && (
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
    return <main className="async-loading"><LoaderCircle className="spin" /><strong>正在加载 Vibe Gallery…</strong>{error && <p>{error}</p>}</main>;
  }

  const statusCopy = state.study.status === 'setup'
    ? { label: 'Creation & Open Discussion', detail: 'Creator 可持续发布 Initial App；每个 App 发布后立即开放体验和评论。' }
    : state.study.status === 'active'
      ? { label: 'Async Community Active', detail: '自由浏览、讨论、收集创意，并把综合方向实现为 Community Version。' }
      : { label: 'Study Closed', detail: '研究已经结束，作品和创意来源保持只读。' };
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
            <span><Sparkles /></span><div><strong>Vibe Gallery</strong><small>Social Vibe-Coding Community</small></div>
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
            <span>{state.viewer ? state.viewer.role : 'Browsing as'}</span>
            <strong>{state.viewer?.code || 'Guest'}</strong>
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
        {!state.viewer && <IdentityGate busy={busy} join={(code) => void action('join', () => communityGalleryApi.join(clientId, code))} />}

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
                <span className="async-eyebrow">{state.study.status === 'setup' ? 'CREATION & OPEN DISCUSSION' : 'COMMUNITY CREATION IN PROGRESS'}</span>
                <h1>{state.viewer.role === 'host' ? '两个社区的作品进度' : '发现作品，加入正在发生的创作'}</h1>
                <p>{state.study.status === 'setup'
                  ? '每个 Initial App 发布后立即开放体验和评论，不需要等待其他 App。'
                  : '先体验指定 App，也可以自由探索其他作品。普通讨论保持自然，综合创意由用户主动创建。'}</p>
              </div>
              {state.viewer.role === 'creator' && ownApp?.initial_version_id && <span className="async-own-app-note"><CheckCircle2 /> 你的 Initial App 已发布</span>}
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
              <div className="async-empty-gallery"><Code2 /><h2>等待 Initial App 发布</h2><p>Creator 发布后，作品会以瀑布流卡片出现在这里。</p></div>
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
