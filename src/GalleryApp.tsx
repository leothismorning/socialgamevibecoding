import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Bug,
  Check,
  Clock3,
  Code2,
  Heart,
  LoaderCircle,
  MessageCircle,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { galleryApi } from './services/galleryApi';
import type { GalleryAppRecord, GalleryGenerationEvent, GalleryJob, GalleryRole, GalleryState, GalleryStatus } from './galleryTypes';
import './gallery.css';

const CLIENT_KEY = 'gallery-v2-client-id';

function getClientId() {
  let value = sessionStorage.getItem(CLIENT_KEY);
  if (!value) {
    value = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(CLIENT_KEY, value);
  }
  return value;
}

const statusCopy: Record<GalleryStatus, { label: string; detail: string }> = {
  preparing: { label: 'Creator 开发期', detail: '三位 Creator 分别完成并发布一个 App。' },
  round_active: { label: '评论进行中', detail: '进入任意 App 提交建议，并为其他人的评论点赞。' },
  round_processing: { label: '抽签与 AI 更新', detail: '评论已锁定，系统正在为每个 App 抽签并生成新版本。' },
  round_review: { label: '本轮完成', detail: '所有新版本已公开，Host 可以开启下一轮。' },
  final_voting: { label: '最终作品投票', detail: '比较初始版与最终版，可为多个喜欢的最终作品点赞。' },
  ended: { label: '项目已结束', detail: '全部作品、评论、抽签和版本记录保持只读。' },
};

function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function generationJobStatusLabel(status: GalleryJob['status']) {
  if (status === 'pending') return '等待启动';
  if (status === 'running') return '生成中';
  if (status === 'completed') return '已完成';
  if (status === 'cancelled') return '已停止';
  if (status === 'failed') return '生成失败';
  return '无需生成';
}

function Preview({ code, title, compact = false }: { code?: string; title: string; compact?: boolean }) {
  if (!code) return <div className="gallery-empty-preview">等待版本发布</div>;
  return (
    <iframe
      className={compact ? 'gallery-preview gallery-preview-compact' : 'gallery-preview'}
      title={title}
      srcDoc={code}
      sandbox="allow-scripts allow-forms allow-modals"
    />
  );
}

function GalleryCard({
  app,
  finalStage,
  open,
  like,
  liked,
  likeDisabled,
  likeTitle,
  index,
  developmentJob,
  developmentEvents,
}: {
  app: GalleryAppRecord;
  finalStage: boolean;
  open: () => void;
  like: () => void;
  liked: boolean;
  likeDisabled: boolean;
  likeTitle: string;
  index: number;
  developmentJob?: GalleryJob;
  developmentEvents: GalleryGenerationEvent[];
}) {
  const currentEvent = [...developmentEvents].sort((left, right) => Number(right.sort_order) - Number(left.sort_order))[0];
  const completedSteps = developmentEvents.filter((event) => Number(event.sort_order) > 0 && event.status === 'completed').length;
  const displayedCompletedSteps = developmentJob?.status === 'completed' || developmentJob?.status === 'skipped'
    ? 8
    : Math.min(8, completedSteps);
  return (
    <article className={`gallery-card gallery-waterfall-card is-waterfall-${index % 3}`} style={{ order: index }}>
      <div className="gallery-card-chrome">
        <Code2 />
        <strong>{app.title}</strong>
        <span>V{Number(app.current_version_number || 0) + 1}</span>
      </div>
      {developmentJob && currentEvent && (
        <div className={`gallery-card-development is-${developmentJob.status}`}>
          <span>{developmentJob.status === 'running' ? <LoaderCircle className="spin" /> : <Bot />}</span>
          <div><small>AI DEVELOPMENT · R{developmentJob.round_number}</small><strong>{currentEvent.title}</strong></div>
          <em>{displayedCompletedSteps}/8</em>
        </div>
      )}
      {finalStage ? (
        <div className="gallery-card-compare">
          <div><span>初始版</span><Preview code={app.initial_code} title={`${app.title} 初始版`} /></div>
          <div><span>最终版</span><Preview code={app.final_code || app.current_code} title={`${app.title} 最终版`} /></div>
        </div>
      ) : (
        <div className="gallery-card-frame">
          <Preview code={app.current_code} title={`${app.title} 当前版本`} />
        </div>
      )}
      <div className="gallery-card-body">
        <div>
          <span className="gallery-eyebrow">{app.creator_code}</span>
          <h3>{app.title}</h3>
          <p>{app.brief || 'A collaborative vibe-coded App.'}</p>
        </div>
        <div className="gallery-card-stats">
          <button
            className={liked ? 'gallery-card-like-button is-liked' : 'gallery-card-like-button'}
            disabled={likeDisabled}
            data-tooltip={likeTitle || undefined}
            onClick={like}
          ><Heart size={16} /> <strong>{finalStage ? app.final_like_count : app.showcase_like_count}</strong> {finalStage ? '最终版赞' : '作品赞'}</button>
          <button className="gallery-text-button" onClick={open}>查看作品 <ArrowRight size={15} /></button>
        </div>
      </div>
    </article>
  );
}

function GalleryRoleCard({
  role,
  title,
  detail,
  Icon,
  selected,
  disabled,
  select,
}: {
  role: GalleryRole;
  title: string;
  detail: string;
  Icon: LucideIcon;
  selected: boolean;
  disabled: boolean;
  select: () => void;
}) {
  return (
    <button
      type="button"
      className={selected ? 'gallery-role-card is-selected' : 'gallery-role-card'}
      data-role={role}
      disabled={disabled}
      aria-pressed={selected}
      onClick={select}
    >
      <span className="gallery-role-scene">
        <span className="gallery-role-face gallery-role-front" aria-hidden={selected}>
          <Icon />
          <span className="gallery-role-copy"><strong>{title}</strong><small>{detail}</small></span>
        </span>
        <span className="gallery-role-face gallery-role-back" aria-hidden={!selected}>
          <span className="gallery-role-back-copy"><em>身份已选择</em><strong>{title}</strong><small>请在下方选择编号</small></span>
        </span>
      </span>
    </button>
  );
}

function IdentityPanel({ state, join, busy }: {
  state: GalleryState;
  join: (role: GalleryRole, code: string) => void;
  busy: string;
}) {
  const [selectedRole, setSelectedRole] = useState<GalleryRole | null>(null);
  const contributorsOpen = state.publishedAppCount === state.creatorCount;
  const seatCodes = selectedRole === 'host'
    ? ['H01']
    : selectedRole === 'creator'
      ? ['C01', 'C02', 'C03']
      : Array.from({ length: 20 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
  return (
    <section className="gallery-identity-panel">
      <div>
        <span className="gallery-eyebrow">JOIN THE STUDY</span>
        <h2>选择本标签页的实验身份</h2>
        <p>每个浏览器标签页只分配一个身份；Host 独立控制实验流程，三位 Creator 分别开发自己的 App。</p>
      </div>
      <div className="gallery-identity-picker">
        <div className="gallery-role-grid">
          <GalleryRoleCard role="host" title="Host" detail="选择 H01 控制实验流程" Icon={ShieldCheck} selected={selectedRole === 'host'} disabled={Boolean(busy)} select={() => setSelectedRole('host')} />
          <GalleryRoleCard role="creator" title="Creator" detail="自主选择 C01–C03" Icon={UserRound} selected={selectedRole === 'creator'} disabled={Boolean(busy)} select={() => setSelectedRole('creator')} />
          <GalleryRoleCard role="contributor" title="Contributor" detail={contributorsOpen ? '自主选择 P01–P20' : '三位 Creator 发布后开放'} Icon={UsersRound} selected={selectedRole === 'contributor'} disabled={Boolean(busy) || !contributorsOpen} select={() => setSelectedRole('contributor')} />
        </div>
        {selectedRole && (
          <section className="gallery-seat-picker">
            <header><strong>选择你的身份编号</strong><span>任何编号都可以进入</span></header>
            <div className={`gallery-seat-grid is-${selectedRole}`}>
              {seatCodes.map((code) => (
                <button
                  key={code}
                  disabled={Boolean(busy)}
                  onClick={() => join(selectedRole, code)}
                >
                  <strong>{code}</strong>
                  <span>进入身份</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

function CreatorStudio({
  state,
  clientId,
  action,
  busy,
}: {
  state: GalleryState;
  clientId: string;
  action: (label: string, task: () => Promise<GalleryState>) => Promise<void>;
  busy: string;
}) {
  const ownApp = state.apps.find((app) => app.creator_code === state.viewer?.code);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [prompt, setPrompt] = useState('');
  const [revision, setRevision] = useState('');
  const loadedApp = useRef<string | null>(null);

  useEffect(() => {
    if (ownApp && loadedApp.current !== ownApp.id) {
      loadedApp.current = ownApp.id;
      setTitle(ownApp.title || '');
      setBrief(ownApp.brief || '');
      setPrompt(ownApp.creator_prompt || '');
    }
  }, [ownApp]);

  const uploadFile = async (file?: File) => {
    if (!file) return;
    const code = await file.text();
    await action('upload', () => galleryApi.upload(clientId, { title, brief, prompt, code }));
  };

  const generating = busy === 'generate' || busy === 'refine';
  return (
    <section className="gallery-studio" id="creator-studio">
      <div className="gallery-section-heading">
        <div>
          <span className="gallery-eyebrow"><Code2 size={14} /> CREATOR STUDIO · {state.viewer?.code}</span>
          <h2>构建你的 App</h2>
          <p>AI 会分步骤完成结构、样式、交互和图片校验；发布前可以持续对话修改。</p>
        </div>
        {ownApp?.status === 'published' && <span className="gallery-published"><Check size={15} /> 已发布</span>}
      </div>

      <div className="gallery-studio-layout">
        <div className="gallery-studio-controls">
          <label>App 名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给作品取一个名字" /></label>
          <label>作品简介<textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="让画廊中的人快速理解它" rows={3} /></label>
          <label>开发要求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述要创建的网页或小游戏" rows={5} /></label>
          <div className="gallery-studio-actions">
            <button
              className="gallery-primary-button"
              disabled={Boolean(busy) || !title.trim() || !prompt.trim()}
              onClick={() => action('generate', () => galleryApi.generate(clientId, { title, brief, prompt }))}
            >
              {busy === 'generate' ? <LoaderCircle className="spin" /> : <Sparkles />} AI 快速创建
            </button>
            <label className={`gallery-upload-button ${busy ? 'is-disabled' : ''}`}>
              <Upload /> 上传 HTML
              <input type="file" accept=".html,.htm,text/html" disabled={Boolean(busy)} onChange={(event) => void uploadFile(event.target.files?.[0])} />
            </label>
          </div>

          {ownApp?.draft_code && (
            <div className="gallery-refine-box">
              <label>继续和 AI 修改<textarea value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="例如：修复开始按钮，并让移动端布局更清晰" rows={3} /></label>
              <button
                className="gallery-secondary-button"
                disabled={Boolean(busy) || !revision.trim()}
                onClick={() => action('refine', async () => {
                  const next = await galleryApi.refine(clientId, revision);
                  setRevision('');
                  return next;
                })}
              >
                {busy === 'refine' ? <LoaderCircle className="spin" /> : <Bot />} 让 AI 修改
              </button>
            </div>
          )}

          {state.developmentMessages.length > 0 && (
            <details className="gallery-conversation">
              <summary>查看透明开发记录（{state.developmentMessages.length}）</summary>
              <div>{state.developmentMessages.slice(-6).map((message) => (
                <article key={message.id} className={`is-${message.role}`}>
                  <strong>{message.role === 'creator' ? state.viewer?.code : 'AI Agent'}</strong>
                  <p>{message.content.length > 900 ? `${message.content.slice(0, 900)}…` : message.content}</p>
                </article>
              ))}</div>
            </details>
          )}
        </div>

        <div className="gallery-studio-preview">
          <div className="gallery-preview-bar"><span>{ownApp?.title || 'Draft preview'}</span><span>{generating ? 'Agent 正在分步开发…' : 'Live draft'}</span></div>
          <Preview code={ownApp?.draft_code} title="Creator draft preview" />
          <button
            className="gallery-publish-button"
            disabled={Boolean(busy) || !ownApp?.draft_code}
            onClick={() => action('publish', () => galleryApi.publish(clientId))}
          ><Play /> {ownApp?.status === 'published' ? '重新发布当前版本' : '发布到画廊'}</button>
        </div>
      </div>
    </section>
  );
}

function EvolutionHistory({ state, app }: { state: GalleryState; app: GalleryAppRecord }) {
  const rounds = [1, 2, 3].map((roundNumber) => {
    const lottery = state.lotteries.find(
      (item) => item.app_id === app.id && Number(item.round_number) === roundNumber,
    );
    const versions = state.versions
      .filter((version) => version.app_id === app.id && Number(version.round_number) === roundNumber)
      .sort((left, right) => Number(right.version_number) - Number(left.version_number));
    const version = versions[0];
    const job = state.generationJobs.find(
      (item) => item.app_id === app.id && Number(item.round_number) === roundNumber,
    );
    return { roundNumber, lottery, versions, version, job };
  }).filter(({ lottery, version, job }) => lottery || version || job);

  if (rounds.length === 0) return null;

  return (
    <section className="gallery-evolution-history">
      <header>
        <div><span className="gallery-eyebrow"><Sparkles /> EVOLUTION HISTORY</span><h3>三轮迭代轨迹</h3></div>
        <p>每轮展示抽中的评论，以及该评论最终开发出的版本。</p>
      </header>
      <div className="gallery-evolution-rounds">
        {rounds.map(({ roundNumber, lottery, versions, version, job }) => (
          <article key={roundNumber} className={version ? 'has-version' : 'is-empty'}>
            <header>
              <span>R{roundNumber}</span>
              <div><strong>第 {roundNumber} 轮</strong><small>{version ? `采用 V${Number(version.version_number) + 1}` : '没有生成新版本'}</small></div>
              {versions.length > 1 && <em>本轮重新开发 {versions.length - 1} 次</em>}
            </header>
            <div className="gallery-evolution-content">
              <section className="gallery-evolution-comment">
                <div><MessageCircle /><strong>抽中的评论</strong></div>
                {lottery?.selected_comment ? (
                  <>
                    {lottery.selected_parent_comment && (
                      <blockquote className="is-parent">原评论：{lottery.selected_parent_comment}</blockquote>
                    )}
                    <blockquote>{lottery.selected_parent_comment ? '拓展评论：' : ''}{lottery.selected_comment}</blockquote>
                  </>
                ) : (
                  <p>本轮没有有效评论被抽中，因此 App 沿用上一轮版本。</p>
                )}
                {lottery?.selected_author && <small>{lottery.selected_parent_comment ? `原评论者：${lottery.selected_parent_author} · 拓展者：` : '评论者：'}{lottery.selected_author}</small>}
                {version?.summary && <div className="gallery-evolution-summary"><Code2 /><span>{version.summary}</span></div>}
                {!version && lottery?.selected_comment && (
                  <div className="gallery-evolution-summary is-warning"><Clock3 /><span>评论已抽中，但没有成功发布新版本。任务状态：{job ? generationJobStatusLabel(job.status) : '未知'}</span></div>
                )}
              </section>
              {version ? (
                <div className="gallery-evolution-preview">
                  <div><span>第 {roundNumber} 轮开发结果</span><strong>V{Number(version.version_number) + 1}</strong></div>
                  <Preview code={version.code} title={`${app.title} 第 ${roundNumber} 轮迭代结果`} />
                </div>
              ) : (
                <div className="gallery-evolution-empty"><Clock3 /><strong>本轮无新页面</strong><p>当前作品继续使用上一轮已经公开的版本。</p></div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DevelopmentLive({ state, app }: { state: GalleryState; app: GalleryAppRecord }) {
  const roundNumber = Number(state.study.current_round);
  const job = state.generationJobs.find(
    (candidate) => candidate.app_id === app.id && Number(candidate.round_number) === roundNumber,
  );
  if (!job) return null;
  const events = (state.generationEvents || [])
    .filter((event) => Number(event.job_id) === Number(job.id))
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
  const lottery = state.lotteries.find(
    (candidate) => candidate.app_id === app.id && Number(candidate.round_number) === roundNumber,
  );
  const currentEvent = [...events].sort((left, right) => Number(right.sort_order) - Number(left.sort_order))[0];
  const completedSteps = events.filter((event) => Number(event.sort_order) > 0 && event.status === 'completed').length;
  const displayedCompletedSteps = job.status === 'completed' || job.status === 'skipped' ? 8 : Math.min(8, completedSteps);
  const progress = job.status === 'completed' || job.status === 'skipped' ? 100 : Math.min(92, Math.round((completedSteps / 8) * 100));

  return (
    <section className={`gallery-development-live is-${job.status}`}>
      <header>
        <div>
          <span className="gallery-eyebrow"><Bot /> AI DEVELOPMENT LIVE · ROUND {roundNumber}</span>
          <h3>{job.status === 'completed' ? '本轮开发记录' : 'AI 正在开发这个 App'}</h3>
          <p>这里展示系统真实执行的公开步骤，不包含 API Key、系统提示词或模型内部推理。</p>
        </div>
        <div className="gallery-development-current">
          {job.status === 'running' && <LoaderCircle className="spin" />}
          {job.status === 'completed' && <Check />}
          {['failed', 'cancelled'].includes(job.status) && <X />}
          <div><small>{state.aiProvider} · {displayedCompletedSteps}/8</small><strong>{currentEvent?.title || generationJobStatusLabel(job.status)}</strong></div>
        </div>
      </header>

      <div className="gallery-development-progress"><span style={{ width: `${progress}%` }} /></div>

      {lottery?.selected_comment && (
        <div className="gallery-development-prompt">
          <strong><MessageCircle /> 本轮交给 AI 的任务</strong>
          {lottery.selected_parent_comment && <p><span>原评论</span>{lottery.selected_parent_comment}</p>}
          <p><span>{lottery.selected_parent_comment ? '拓展评论' : '抽中评论'}</span>{lottery.selected_comment}</p>
        </div>
      )}

      <div className="gallery-development-timeline">
        {events.map((event) => (
          <article key={event.id} className={`is-${event.status}`}>
            <span className="gallery-development-node">
              {event.status === 'running' ? <LoaderCircle className="spin" /> : event.status === 'completed' ? <Check /> : event.status === 'pending' ? <Clock3 /> : <X />}
            </span>
            <div>
              <strong>{event.title}</strong>
              {event.detail && (
                event.step_key === 'plan'
                  ? <details open={event.status === 'completed'}><summary>查看公开修改计划</summary><p>{event.detail}</p></details>
                  : <p>{event.detail}</p>
              )}
            </div>
          </article>
        ))}
        {events.length === 0 && <div className="gallery-development-empty"><LoaderCircle className="spin" /> 正在建立公开开发记录……</div>}
      </div>
    </section>
  );
}

function AppDetail({
  state,
  app,
  close,
  action,
  clientId,
  busy,
}: {
  state: GalleryState;
  app: GalleryAppRecord;
  close: () => void;
  action: (label: string, task: () => Promise<GalleryState>) => Promise<void>;
  clientId: string;
  busy: string;
}) {
  const stagedRound = Number(state.study.current_round) + 1;
  const earlyOpening = (state.roundOpenings || []).some(
    (opening) => opening.app_id === app.id && Number(opening.round_number) === stagedRound,
  );
  const roundNumber = earlyOpening && ['round_processing', 'round_review'].includes(state.study.status)
    ? stagedRound
    : Number(state.study.current_round || 1);
  const [view, setView] = useState<'initial' | 'current' | 'final'>('current');
  const comments = state.comments.filter((comment) => comment.app_id === app.id && comment.round_number === roundNumber);
  const topLevelComments = comments.filter((item) => !item.parent_comment_id);
  const myComment = topLevelComments.find((comment) => comment.author_code === state.viewer?.code);
  const myReply = comments.find((comment) => comment.author_code === state.viewer?.code && comment.parent_comment_id);
  const [comment, setComment] = useState(myComment?.content || '');
  const [replyTarget, setReplyTarget] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const lottery = state.lotteries.find((item) => item.app_id === app.id && item.round_number === roundNumber);
  const job = state.generationJobs.find((item) => item.app_id === app.id && item.round_number === roundNumber);
  const interactionOpen = Boolean(state.viewer)
    && state.viewer?.role !== 'host'
    && (state.study.status === 'round_active' || earlyOpening);
  const finalStage = state.study.status === 'final_voting' || state.study.status === 'ended';

  useEffect(() => setComment(myComment?.content || ''), [myComment?.id, myComment?.content, app.id, roundNumber]);
  useEffect(() => {
    setReplyTarget(myReply?.parent_comment_id || null);
    setReplyText(myReply?.content || '');
  }, [myReply?.id, myReply?.content, myReply?.parent_comment_id, app.id, roundNumber]);

  const previewCode = view === 'initial'
    ? app.initial_code
    : view === 'final'
      ? app.final_code || app.current_code
      : app.current_code;
  const ownApp = state.viewer?.role === 'creator' && state.viewer.code === app.creator_code;
  const hostViewer = state.viewer?.role === 'host';

  return (
    <section className="gallery-detail" id="app-detail">
      <button className="gallery-back-button" onClick={close}><ArrowLeft /> 返回画廊</button>
      <div className="gallery-detail-heading">
        <div><span className="gallery-eyebrow">{app.creator_code} · APP DETAIL</span><h2>{app.title}</h2><p>{app.brief}</p></div>
        <div className="gallery-detail-actions">
          <button
            className={app.viewer_showcase_liked ? 'gallery-like-button is-liked' : 'gallery-like-button'}
            disabled={!state.viewer || hostViewer || ownApp || state.study.status === 'ended' || Boolean(busy)}
            data-tooltip={hostViewer ? 'Host 只控制实验流程，不参与点赞' : ownApp ? '不能点赞自己的作品' : undefined}
            onClick={() => action('like-app', () => galleryApi.likeApp(clientId, app.id, 'showcase'))}
          ><Heart /> {app.showcase_like_count} 作品赞</button>
          {finalStage && (
            <button
              className={app.viewer_final_liked ? 'gallery-like-button is-liked final-like' : 'gallery-like-button final-like'}
              disabled={!state.viewer || hostViewer || ownApp || state.study.status === 'ended' || Boolean(busy)}
              onClick={() => action('like-final', () => galleryApi.likeApp(clientId, app.id, 'final'))}
            ><Sparkles /> {app.final_like_count} 最终版赞</button>
          )}
        </div>
      </div>

      <div className="gallery-detail-grid">
        <div className="gallery-detail-preview">
          <div className="gallery-version-tabs">
            <button className={view === 'initial' ? 'is-active' : ''} onClick={() => setView('initial')}>初始版</button>
            <button className={view === 'current' ? 'is-active' : ''} onClick={() => setView('current')}>当前版 V{Number(app.current_version_number || 0) + 1}</button>
            {finalStage && <button className={view === 'final' ? 'is-active' : ''} onClick={() => setView('final')}>最终版</button>}
          </div>
          <Preview code={previewCode} title={`${app.title} ${view}`} />
        </div>

        <DevelopmentLive state={state} app={app} />

        <aside className="gallery-comment-panel">
          <section className="gallery-initial-prompt">
            <div><Sparkles /><strong>初版提示词</strong></div>
            <p>{app.creator_prompt?.trim() || 'Creator 通过上传完整 HTML 创建了初版，没有填写额外提示词。'}</p>
          </section>
          <div className="gallery-comment-heading">
            <div><MessageCircle /><strong>第 {roundNumber} 轮评论 {earlyOpening && <em>预开放 · 暂不计时</em>}</strong></div>
            <span>{comments.length} 条</span>
          </div>
          {interactionOpen ? (
            <div className="gallery-comment-composer">
              <textarea maxLength={500} rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="每轮可为这个 App 提交一条建议，截止前可修改。" />
              <div><span>{comment.length}/500</span><button disabled={!comment.trim() || Boolean(busy)} onClick={() => action('comment', () => galleryApi.comment(clientId, app.id, comment))}><Send /> {myComment ? '保存修改' : '提交评论'}</button></div>
              {myComment && <button className="gallery-delete-comment" disabled={Boolean(busy)} onClick={() => action('delete-comment', () => galleryApi.deleteComment(clientId, app.id))}>删除本轮评论</button>}
            </div>
          ) : (
            <div className="gallery-locked-note"><Clock3 /> {hostViewer ? 'Host 只控制实验流程，不参与评论。' : state.study.status === 'preparing' ? '正式实验开始后开放评论。' : '当前评论已锁定。'}</div>
          )}

          <div className="gallery-comment-list">
            {topLevelComments.length === 0 && <p className="gallery-empty-comments">本轮还没有评论。</p>}
            {topLevelComments.map((item) => {
              const own = item.author_code === state.viewer?.code;
              const selected = lottery?.selected_comment_id === item.id;
              const replies = comments.filter((reply) => Number(reply.parent_comment_id) === Number(item.id));
              const editingThisReply = replyTarget === item.id;
              return (
                <article key={item.id} className={selected ? 'is-selected' : ''}>
                  <div><strong>{item.author_code}</strong>{selected && <span><Sparkles /> 本轮抽中</span>}</div>
                  <p>{item.content}</p>
                  <div className="gallery-comment-actions">
                    <button
                      className={item.viewer_liked ? 'is-liked' : ''}
                      disabled={!interactionOpen || own || Boolean(busy)}
                      data-tooltip={own ? '不能点赞自己的评论' : undefined}
                      onClick={() => action('like-comment', () => galleryApi.likeComment(clientId, item.id))}
                    ><Heart /> {item.like_count}</button>
                    {interactionOpen && !own && (
                      <button
                        className="is-reply"
                        onClick={() => {
                          setReplyTarget(editingThisReply ? null : item.id);
                          setReplyText(myReply?.parent_comment_id === item.id ? myReply.content : '');
                        }}
                      ><MessageCircle /> {myReply?.parent_comment_id === item.id ? '修改拓展' : '拓展评论'}</button>
                    )}
                  </div>
                  {editingThisReply && interactionOpen && !own && (
                    <div className="gallery-reply-composer">
                      <textarea
                        maxLength={500}
                        rows={3}
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder="补充或拓展这条评论。每人每个 App 每轮限一条拓展评论。"
                      />
                      <div><span>{replyText.length}/500</span><button disabled={!replyText.trim() || Boolean(busy)} onClick={() => action('reply-comment', () => galleryApi.comment(clientId, app.id, replyText, item.id))}><Send /> {myReply ? '保存拓展' : '提交拓展'}</button></div>
                    </div>
                  )}
                  {replies.length > 0 && (
                    <div className="gallery-comment-replies">
                      {replies.map((reply) => {
                        const ownReply = reply.author_code === state.viewer?.code;
                        const selectedReply = lottery?.selected_comment_id === reply.id;
                        return (
                          <article key={reply.id} className={selectedReply ? 'is-selected' : ''}>
                            <div><strong>{reply.author_code} · 拓展</strong>{selectedReply && <span><Sparkles /> 本轮抽中</span>}</div>
                            <p>{reply.content}</p>
                            <div className="gallery-comment-actions">
                              <button
                                className={reply.viewer_liked ? 'is-liked' : ''}
                                disabled={!interactionOpen || ownReply || Boolean(busy)}
                                data-tooltip={ownReply ? '不能点赞自己的评论' : undefined}
                                onClick={() => action('like-reply', () => galleryApi.likeComment(clientId, reply.id))}
                              ><Heart /> {reply.like_count}</button>
                              {ownReply && interactionOpen && <button className="is-delete" disabled={Boolean(busy)} onClick={() => action('delete-reply', () => galleryApi.deleteComment(clientId, app.id, reply.id))}>删除拓展</button>}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {lottery && (
            <div className="gallery-lottery-result">
              <span className="gallery-eyebrow">WEIGHTED LOTTERY</span>
              <strong>{lottery.selected_comment ? '本轮被抽中的开发建议' : '本轮没有有效评论'}</strong>
              {lottery.selected_parent_comment && <p className="is-parent">原评论：“{lottery.selected_parent_comment}”</p>}
              {lottery.selected_comment && <p>“{lottery.selected_comment}”</p>}
              <small>每条评论权重 = 点赞数 + 1；本轮总权重 {lottery.total_weight}。</small>
              {job?.status === 'running' && <em><LoaderCircle className="spin" /> AI 正在生成新版本</em>}
              {job?.status === 'failed' && <em className="is-error">生成失败：{job.error}</em>}
            </div>
          )}
        </aside>
      </div>
      <EvolutionHistory state={state} app={app} />
    </section>
  );
}

function DebugConsole({ open, close }: { open: boolean; close: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    if (!open) return;
    const load = () => fetch('/api/debug/logs').then((response) => response.json()).then((value) => setLogs(value.logs || [])).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 1500);
    return () => window.clearInterval(timer);
  }, [open]);
  if (!open) return null;
  return (
    <aside className="gallery-debug-console">
      <header><div><Bug /> <strong>Network & AI Debug</strong></div><button onClick={close}><X /></button></header>
      <div>{logs.length === 0 ? <p>No logs yet.</p> : logs.slice().reverse().map((log, index) => (
        <article key={`${log.timestamp || ''}-${index}`} className={`is-${log.kind || 'server'}`}>
          <span>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''} · {log.phase}</span>
          <strong>{log.title}</strong>
          {log.durationMs != null && <small>{log.durationMs} ms</small>}
          {log.detail && <pre>{JSON.stringify(log.detail, null, 2)}</pre>}
        </article>
      ))}</div>
    </aside>
  );
}

function LotteryNotice({ state, roundNumber, close }: { state: GalleryState; roundNumber: number; close: () => void }) {
  const apps = state.apps.filter((app) => app.status === 'published');
  return (
    <div className="gallery-lottery-modal" role="dialog" aria-modal="true" aria-labelledby="lottery-result-title">
      <section className="gallery-lottery-stage">
        <div className="gallery-lottery-sparks" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => <Sparkles key={index} />)}
        </div>
        <span className="gallery-lottery-burst"><Sparkles /></span>
        <span className="gallery-eyebrow">ROUND {roundNumber} · LOTTERY RESULT</span>
        <h2 id="lottery-result-title">第 {roundNumber} 轮抽签结果</h2>
        <p>倒计时已经结束，评论和点赞已锁定。以下建议将用于生成三个 App 的新版本。</p>
        <div className="gallery-lottery-results">
          {apps.map((app) => {
            const result = state.lotteries.find(
              (item) => item.app_id === app.id && Number(item.round_number) === roundNumber,
            );
            return (
              <article key={app.id}>
                <header><strong>{app.title}</strong><span>{app.creator_code}</span></header>
                {result?.selected_comment ? (
                  <>
                    {result.selected_parent_comment && <p className="is-parent">原评论：{result.selected_parent_comment}</p>}
                    <p>{result.selected_parent_comment ? '拓展评论：' : ''}{result.selected_comment}</p>
                    <small>{result.selected_parent_comment ? `${result.selected_parent_author} → ` : ''}{result.selected_author}</small>
                  </>
                ) : <p className="is-empty">本轮没有有效评论，沿用当前版本。</p>}
              </article>
            );
          })}
        </div>
        <button onClick={close}>知道了，查看开发进度 <ArrowRight /></button>
      </section>
    </div>
  );
}

export default function GalleryApp() {
  const [clientId] = useState(getClientId);
  const [state, setState] = useState<GalleryState | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [now, setNow] = useState(Date.now());
  const [debugOpen, setDebugOpen] = useState(false);
  const [lotteryNoticeRound, setLotteryNoticeRound] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await galleryApi.state(clientId);
      setState(next);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the gallery.');
    }
  }, [clientId]);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 2500);
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [refresh]);

  useEffect(() => {
    if (!state || state.study.status === 'preparing' || lotteryNoticeRound) return;
    const publishedCount = state.apps.filter((app) => app.status === 'published').length;
    const completedRounds = [...new Set(state.lotteries.map((item) => Number(item.round_number)))]
      .filter((roundNumber) => state.lotteries.filter((item) => Number(item.round_number) === roundNumber).length === publishedCount)
      .sort((left, right) => right - left);
    const latestCompletedRound = completedRounds[0];
    if (latestCompletedRound && !sessionStorage.getItem(`gallery-lottery-seen:${state.study.id}:${latestCompletedRound}`)) {
      setLotteryNoticeRound(latestCompletedRound);
    }
  }, [state, lotteryNoticeRound]);

  const action = useCallback(async (label: string, task: () => Promise<GalleryState>) => {
    setBusy(label);
    setError('');
    try {
      setState(await task());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }, []);

  const publishedApps = useMemo(() => state?.apps.filter((app) => app.status === 'published') || [], [state?.apps]);
  const selectedApp = publishedApps.find((app) => app.id === selectedAppId);
  const currentRound = state?.rounds.find((round) => round.round_number === state.study.current_round);
  const remaining = currentRound && state?.study.status === 'round_active' ? Date.parse(currentRound.ends_at) - now : 0;
  const isHost = state?.viewer?.role === 'host';
  const finalStage = state?.study.status === 'final_voting' || state?.study.status === 'ended';
  const currentGenerationJobs = state?.generationJobs.filter(
    (job) => Number(job.round_number) === Number(state.study.current_round),
  ) || [];
  const nextRoundNumber = Number(state?.study.current_round || 0) + 1;
  const nextRoundOpenedAppIds = new Set(
    (state?.roundOpenings || [])
      .filter((opening) => Number(opening.round_number) === nextRoundNumber)
      .map((opening) => opening.app_id) || [],
  );
  const allNextRoundCommentsOpen = publishedApps.length === 3 && nextRoundOpenedAppIds.size === 3;

  useEffect(() => {
    if (selectedAppId) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedAppId]);

  if (!state) {
    return <main className="gallery-loading"><LoaderCircle className="spin" /><strong>Loading Vibe Gallery…</strong>{error && <p>{error}</p>}</main>;
  }

  const status = statusCopy[state.study.status];
  return (
    <div className="gallery-shell">
      <header className="gallery-header">
        <button className="gallery-brand" onClick={() => setSelectedAppId('')}>
          <span><Sparkles /></span><div><strong>Vibe Gallery</strong><small>Collaborative App Evolution Study</small></div>
        </button>
        <div className="gallery-header-actions">
          <div className="gallery-model-control">
            <Bot size={17} />
            {isHost && state.study.status === 'preparing' ? (
              <select value={state.aiProvider} disabled={Boolean(busy)} onChange={(event) => action('model', () => galleryApi.model(clientId, event.target.value as GalleryState['aiProvider']))}>
                <option value="deepseek">DeepSeek Flash</option>
                <option value="deepseek-pro">DeepSeek Pro</option>
                <option value="gemini">Gemini</option>
                <option value="glm">GLM-5.2</option>
                <option value="gpt5">GPT-5.5</option>
              </select>
            ) : <strong>{state.aiProvider}</strong>}
          </div>
          {state.viewer ? <div className="gallery-identity"><span>{state.viewer.role}</span><strong>{state.viewer.code}</strong></div> : <div className="gallery-identity is-guest"><span>Browsing as</span><strong>Guest</strong></div>}
          <button className="gallery-icon-button" onClick={() => void refresh()} data-tooltip="Refresh" aria-label="Refresh"><RefreshCw className={busy ? 'spin' : ''} /></button>
        </div>
      </header>

      <main>
        <section className="gallery-status-strip">
          <div><span className={`gallery-status-dot is-${state.study.status}`} /><div><strong>{status.label}</strong><p>{status.detail}</p></div></div>
          <div className="gallery-round-indicator">
            {[1, 2, 3].map((round) => <span key={round} className={state.study.current_round >= round ? 'is-reached' : ''}>R{round}</span>)}
            {state.study.status === 'round_active' && <strong><Clock3 /> {formatCountdown(remaining)}</strong>}
          </div>
        </section>

        {error && <div className="gallery-error"><span>{error}</span><button onClick={() => setError('')}><X /></button></div>}
        {!state.viewer && <IdentityPanel state={state} busy={busy} join={(role, code) => void action('join', () => galleryApi.join(clientId, role, code))} />}

        {state.viewer?.role === 'creator' && state.study.status === 'preparing' && (
          <CreatorStudio state={state} clientId={clientId} action={action} busy={busy} />
        )}

        {selectedApp ? (
          <AppDetail state={state} app={selectedApp} close={() => setSelectedAppId('')} action={action} clientId={clientId} busy={busy} />
        ) : (
          <section className="gallery-home">
            <div className="gallery-grid" aria-label="公开作品画廊">
              {[0, 1, 2].map((index) => {
                const app = publishedApps[index];
                const developmentJob = app
                  ? currentGenerationJobs.find((job) => job.app_id === app.id)
                  : undefined;
                const developmentEvents = developmentJob
                  ? (state.generationEvents || []).filter((event) => Number(event.job_id) === Number(developmentJob.id))
                  : [];
                const ownApp = state.viewer?.role === 'creator' && state.viewer.code === app?.creator_code;
                const likeDisabled = !state.viewer || isHost || Boolean(ownApp) || state.study.status === 'ended' || Boolean(busy);
                const likeTitle = !state.viewer ? '选择身份后可以点赞'
                  : isHost ? 'Host 只控制实验流程，不参与点赞'
                    : ownApp ? '不能点赞自己的作品'
                    : state.study.status === 'ended' ? '项目已结束' : '';
                return app ? (
                  <GalleryCard
                    key={app.id}
                    app={app}
                    index={index}
                    finalStage={Boolean(finalStage)}
                    open={() => setSelectedAppId(app.id)}
                    liked={Boolean(finalStage ? app.viewer_final_liked : app.viewer_showcase_liked)}
                    likeDisabled={likeDisabled}
                    likeTitle={likeTitle}
                    like={() => void action(
                      `like-home-${app.id}`,
                      () => galleryApi.likeApp(clientId, app.id, finalStage ? 'final' : 'showcase'),
                    )}
                    developmentJob={developmentJob}
                    developmentEvents={developmentEvents}
                  />
                ) : (
                  <article className="gallery-card gallery-placeholder" style={{ order: index }} key={`placeholder-${index}`}><LoaderCircle /><strong>等待 Creator 发布</strong><p>这个画廊席位还在开发中。</p></article>
                );
              })}
            </div>

            {state.study.status === 'round_processing' && !isHost && (
              <section className="gallery-processing-panel">
                <LoaderCircle className="spin" /><div><h3>AI 正在同时生成三个新版本</h3><p>三个 App 独立开发，完成时间可能不同。页面会自动刷新。</p></div>
                <div>{state.generationJobs.filter((job) => job.round_number === state.study.current_round).map((job) => <span key={job.id} className={`is-${job.status}`}>{job.app_title}<strong>{job.status}</strong></span>)}</div>
              </section>
            )}
          </section>
        )}

        {isHost && !selectedApp && (
          <section className="gallery-host-panel">
            <header>
              <div><span className="gallery-eyebrow">HOST CONTROL · H01</span><h3>全局实验控制</h3><p>Host 只控制实验轮次、倒计时与 AI 开发任务，不参与 App 创作、评论或点赞。</p></div>
              <div className="gallery-host-primary-actions">
                {state.study.status === 'preparing' && <button disabled={state.publishedAppCount !== 3 || Boolean(busy)} onClick={() => action('start', () => galleryApi.start(clientId))}><Play /> 正式开始第 1 轮</button>}
                {state.study.status === 'round_active' && <button className="is-end-round" disabled={Boolean(busy)} onClick={() => action('end-round', () => galleryApi.endRound(clientId))}><Clock3 /> 提前结束第 {state.study.current_round} 轮</button>}
                {state.study.status === 'round_review' && <button disabled={Boolean(busy) || !allNextRoundCommentsOpen} data-tooltip={!allNextRoundCommentsOpen ? '先在下方逐个开放三个 App 的下一轮评论' : undefined} onClick={() => action('next', () => galleryApi.nextRound(clientId))}>启动第 {state.study.current_round + 1} 轮倒计时 <ArrowRight /></button>}
                {state.study.status === 'final_voting' && <button disabled={Boolean(busy)} onClick={() => action('end', () => galleryApi.end(clientId))}><Check /> 结束最终投票</button>}
                {state.study.status === 'ended' && <button className="is-new-experiment" disabled={Boolean(busy)} onClick={() => action('new-experiment', () => galleryApi.newExperiment(clientId))}><RefreshCw /> 开始新的实验</button>}
              </div>
            </header>
            {['round_processing', 'round_review'].includes(state.study.status) && currentGenerationJobs.length > 0 && (
              <div className="gallery-host-job-grid">
                {currentGenerationJobs.map((job) => {
                  const active = ['pending', 'running'].includes(job.status);
                  const nextCommentsOpened = nextRoundOpenedAppIds.has(job.app_id);
                  const canRedevelop = !active && Boolean(job.selected_comment_id) && !nextCommentsOpened;
                  const canOpenNextComments = Number(state.study.current_round) < 3
                    && ['completed', 'skipped'].includes(job.status)
                    && !nextCommentsOpened;
                  const statusLabel = generationJobStatusLabel(job.status);
                  return (
                    <article key={job.id} className={`is-${job.status}`}>
                      <div className="gallery-host-job-status">
                        <div><strong>{job.app_title}</strong><small>{job.app_creator_code} · 独立 Key {Number(job.app_creator_code.slice(1))}</small></div>
                        <span>{statusLabel}</span>
                      </div>
                      <div className="gallery-host-job-actions">
                        {active && <button className="is-stop" disabled={Boolean(busy)} onClick={() => action(`cancel-job-${job.id}`, () => galleryApi.cancelJob(clientId, job.id))}><X /> 停止 AI</button>}
                        {canRedevelop && <button className="is-redevelop" disabled={Boolean(busy)} onClick={() => action(`redevelop-job-${job.id}`, () => galleryApi.redevelopJob(clientId, job.id))}><RefreshCw /> 重新开发</button>}
                        {canOpenNextComments && <button className="is-open-comments" disabled={Boolean(busy)} onClick={() => action(`open-comments-${job.app_id}`, () => galleryApi.openNextComments(clientId, job.app_id))}><MessageCircle /> 开放第 {nextRoundNumber} 轮评论</button>}
                        {nextCommentsOpened && <em className="is-opened">第 {nextRoundNumber} 轮评论已开放 · 暂不计时</em>}
                        {!active && !job.selected_comment_id && !nextCommentsOpened && <em>本轮没有抽中评论</em>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      <button className="gallery-debug-button" onClick={() => setDebugOpen(true)}><Bug /> Debug</button>
      <DebugConsole open={debugOpen} close={() => setDebugOpen(false)} />
      {lotteryNoticeRound && (
        <LotteryNotice
          state={state}
          roundNumber={lotteryNoticeRound}
          close={() => {
            sessionStorage.setItem(`gallery-lottery-seen:${state.study.id}:${lotteryNoticeRound}`, '1');
            setLotteryNoticeRound(null);
          }}
        />
      )}
    </div>
  );
}
