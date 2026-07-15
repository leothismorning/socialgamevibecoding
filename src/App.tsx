import React from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Bug,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Code2,
  Eye,
  FlaskConical,
  MessageCircle,
  MousePointer2,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Flag,
  Undo2,
  Trash2,
  Trophy,
  UserRound,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { studyApi } from './services/studyApi';
import {
  clearClientDebugEntries,
  clearServerDebugLogs,
  fetchServerDebugLogs,
  getClientDebugEntries,
  subscribeClientDebug,
  type ClientDebugEntry,
} from './services/debugClient';
import {
  StudyComment,
  StudyDevelopmentDraft,
  StudyEndVote,
  StudyEndVoteSummary,
  StudyFusionPlan,
  StudyLeaderboardEntry,
  StudyPhase,
  StudySelectedIdea,
  StudyState,
} from './types';
import { cn } from './lib/utils';
import { RoleSelection } from './components/RoleSelection';
import { InteractiveSurface } from './components/InteractiveSurface';
import { useGlobalPointerSpotlight } from './hooks/useGlobalPointerSpotlight';
import { VersionEvolution } from './components/VersionEvolution';
import { ThemeToggle } from './theme';
import { CursorSafeIframe } from './components/CursorSafeIframe';
import { ParticipantRoster } from './components/ParticipantRoster';
import { LiveCommentLeaderboard } from './components/LiveCommentLeaderboard';

type Role = 'creator' | 'participant';

const phaseLabels: Record<StudyPhase, { title: string; subtitle: string; tone: string }> = {
  setup: { title: 'Setup', subtitle: 'Creator is preparing the project', tone: 'bg-slate-100 text-slate-500' },
  experience: { title: 'Experience', subtitle: 'Participants explore the current version', tone: 'bg-sky-100 text-sky-600' },
  commenting: { title: 'Commenting', subtitle: 'Timed ideas and requests are open', tone: 'bg-emerald-100 text-emerald-600' },
  investing: { title: 'Investing', subtitle: 'Use coins to back promising comments', tone: 'bg-amber-100 text-amber-600' },
  developing: { title: 'Developing', subtitle: 'Top three ideas are being fused', tone: 'bg-violet-100 text-violet-600' },
  previewing: { title: 'Previewing', subtitle: 'Try the new version before next round', tone: 'bg-blue-100 text-blue-600' },
  ending_vote: { title: 'End Vote', subtitle: 'Participants decide whether the project should end', tone: 'bg-rose-100 text-rose-600' },
  aborted: { title: 'Stopped', subtitle: 'Creator stopped this experiment', tone: 'bg-rose-100 text-rose-700' },
  ended: { title: 'Ended', subtitle: 'Study session completed', tone: 'bg-slate-900 text-white' },
};

const participantCodePattern = /^P(?:[1-9]|1[0-9])$/;
const ROOM_CAPACITY = 20;
const MINIMUM_ROOM_OCCUPANCY = 15;
const COMMENT_CHARACTER_LIMIT = 280;

function getParticipantClientId() {
  const stored = localStorage.getItem('participant-client-id');
  if (stored) return stored;
  const created = crypto.randomUUID();
  localStorage.setItem('participant-client-id', created);
  return created;
}

function getRankedComments(comments: StudyComment[]) {
  const originalOrder = new Map(comments.map((comment, index) => [comment.id, index]));
  return [...comments].sort((a, b) =>
    Number(b.investor_count || 0) - Number(a.investor_count || 0) ||
    Number(originalOrder.get(a.id)) - Number(originalOrder.get(b.id))
  );
}

export default function App() {
  useGlobalPointerSpotlight();
  const [state, setState] = React.useState<StudyState | null>(null);
  const [role, setRole] = React.useState<Role | null>(() => (localStorage.getItem('study-role') as Role | null) || null);
  const [participantCode, setParticipantCode] = React.useState(() => {
    const stored = localStorage.getItem('participant-code') || '';
    return participantCodePattern.test(stored) ? stored : '';
  });
  const [participantClientId] = React.useState(getParticipantClientId);
  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [tiedComments, setTiedComments] = React.useState<StudyComment[]>([]);
  const [tieRankScores, setTieRankScores] = React.useState<number[]>([]);
  const [showCreatorSetup, setShowCreatorSetup] = React.useState(false);
  const [archiveState, setArchiveState] = React.useState<StudyState | null>(null);

  const load = React.useCallback(async () => {
    try {
      setState(await studyApi.state(role, participantCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load study state.');
    }
  }, [participantCode, role]);

  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = async (action: () => Promise<StudyState>) => {
    setIsBusy(true);
    setError(null);
    setTiedComments([]);
    setTieRankScores([]);
    try {
      setState(await action());
    } catch (err: any) {
      if (err?.tiedComments) setTiedComments(err.tiedComments);
      if (err?.rankScores) setTieRankScores(err.rankScores);
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const chooseRole = (nextRole: Role) => {
    setRole(nextRole);
    localStorage.setItem('study-role', nextRole);
  };

  const leaveIdentity = () => {
    if (role === 'participant') {
      void studyApi.leave(participantClientId).catch(() => undefined);
    }
    setRole(null);
    setParticipantCode('');
    localStorage.removeItem('study-role');
    localStorage.removeItem('participant-code');
  };

  const openArchive = async (experimentId: string) => {
    setIsBusy(true);
    setError(null);
    try {
      setArchiveState(await studyApi.archive(experimentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load experiment archive.');
    } finally {
      setIsBusy(false);
    }
  };

  if (!state) {
    return <LoadingScreen />;
  }

  const identityLabel = role === 'creator'
    ? 'Creator / Host'
    : role === 'participant'
      ? participantCode
        ? `Participant · ${participantCode}`
        : 'Participant · Not joined'
      : undefined;

  if (archiveState) {
    return (
      <Shell
        error={error}
        isBusy={isBusy}
        identityLabel={identityLabel}
        onRefresh={() => openArchive(archiveState.experiment!.id)}
        onLeave={() => {
          setArchiveState(null);
          leaveIdentity();
        }}
      >
        <EndedArchive
          state={archiveState}
          role={role}
          onBack={() => setArchiveState(null)}
        />
      </Shell>
    );
  }

  if (!role) {
    return <RoleGate state={state} onChoose={chooseRole} onViewArchive={openArchive} />;
  }

  if (role === 'creator' && (!state.experiment || showCreatorSetup)) {
    return (
      <Shell identityLabel={identityLabel} error={error} isBusy={isBusy} onRefresh={load} onLeave={leaveIdentity}>
        <CreatorSetup
          existingExperimentTitle={state.experiment?.title}
          onCancel={state.experiment ? () => setShowCreatorSetup(false) : undefined}
          onSubmit={(input) =>
            run(async () => {
              const next = await studyApi.createExperiment(input);
              setShowCreatorSetup(false);
              setArchiveState(null);
              return next;
            })
          }
          isBusy={isBusy}
        />
      </Shell>
    );
  }

  const hasJoinedActiveExperiment = state.participants.some(
    (participant) => participant.code === participantCode && Boolean(participant.joined_at),
  );

  if (role === 'participant' && (!participantCode || !hasJoinedActiveExperiment)) {
    return (
      <Shell identityLabel={identityLabel} error={error} isBusy={isBusy} onRefresh={load} onLeave={leaveIdentity}>
        <ParticipantGate
          onJoin={() =>
            run(async () => {
              const joined = await studyApi.join(participantClientId);
              const assignedCode = joined.viewerParticipantCode;
              if (!assignedCode) throw new Error('The room did not return an assigned participant number.');
              setParticipantCode(assignedCode);
              localStorage.setItem('participant-code', assignedCode);
              return joined;
            })
          }
          isBusy={isBusy}
        />
      </Shell>
    );
  }

  return (
    <Shell identityLabel={identityLabel} error={error} isBusy={isBusy} onRefresh={load} onLeave={leaveIdentity}>
      <StudyRoom
        state={state}
        role={role}
        participantCode={participantCode}
        isBusy={isBusy}
        tiedComments={tiedComments}
        tieRankScores={tieRankScores}
        onRun={run}
        onNewExperiment={() => setShowCreatorSetup(true)}
        onAbortExperiment={() =>
          run(async () => {
            const next = await studyApi.abortExperiment();
            setShowCreatorSetup(true);
            return next;
          })
        }
      />
    </Shell>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen min-h-screen grid place-items-center bg-[#f7f9ff] text-blue-950">
      <div className="loading-panel rounded-[2rem] bg-white/80 border border-white p-8 shadow-2xl shadow-blue-100 flex items-center gap-4">
        <RefreshCw className="h-5 w-5 animate-spin text-violet-500" />
        <span className="text-sm font-bold tracking-wide">Loading study system...</span>
      </div>
    </div>
  );
}

function Shell({
  children,
  error,
  isBusy,
  identityLabel,
  onRefresh,
  onLeave,
}: {
  children: React.ReactNode;
  error: string | null;
  isBusy: boolean;
  identityLabel?: string;
  onRefresh: () => void;
  onLeave: () => void;
}) {
  const [debugOpen, setDebugOpen] = React.useState(false);

  return (
    <div className="app-shell min-h-screen bg-[#f7f9ff] text-blue-950 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-28 -left-20 h-80 w-80 rounded-full bg-sky-200/60 blur-3xl" />
      <div className="pointer-events-none absolute top-20 right-10 h-96 w-96 rounded-full bg-violet-200/60 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-100/80 blur-3xl" />

      <header className="app-header relative z-10 h-20 px-8 flex items-center justify-between border-b border-white/70 bg-white/55 backdrop-blur-2xl">
        <div className="flex items-center gap-4">
          <div className="brand-mark h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-400 to-violet-600 grid place-items-center text-2xl shadow-xl shadow-violet-200">
            🏝️
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Vibecoding Study</h1>
            <p className="text-xs text-slate-500 font-semibold">Single-project CHI experiment prototype</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {identityLabel && (
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-violet-100 bg-white/80 px-3 text-xs font-black text-blue-950 shadow-sm sm:px-4">
              <UserRound className="h-4 w-4 text-violet-500" />
              <span className="hidden text-slate-400 xl:inline">当前身份</span>
              <span>{identityLabel}</span>
            </div>
          )}
          <button
            onClick={onRefresh}
            className="h-11 px-4 rounded-2xl bg-white border border-blue-100 text-slate-500 hover:text-blue-600 shadow-sm flex items-center gap-2 text-xs font-bold transition"
          >
            <RefreshCw className={cn('h-4 w-4', isBusy && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={onLeave}
            className="h-11 px-4 rounded-2xl bg-blue-950 text-white text-xs font-bold hover:bg-blue-900 transition"
          >
            Switch identity
          </button>
        </div>
      </header>

      <main className="app-main relative z-10 p-7">{children}</main>

      {error && (
        <div className="error-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-2xl rounded-2xl bg-rose-50 border border-rose-200 px-5 py-4 text-sm font-semibold text-rose-700 shadow-2xl shadow-rose-100">
          {error}
        </div>
      )}

      <button
        onClick={() => setDebugOpen(true)}
        className="fixed left-5 bottom-5 z-40 h-13 px-5 rounded-2xl bg-blue-950 text-white shadow-2xl shadow-blue-200 flex items-center gap-2 text-sm font-black hover:bg-blue-900 transition"
      >
        <Bug className="h-5 w-5" />
        Debug
      </button>

      <DebugConsole open={debugOpen} onClose={() => setDebugOpen(false)} />
    </div>
  );
}

function DebugConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [clientLogs, setClientLogs] = React.useState<ClientDebugEntry[]>([]);
  const [serverLogs, setServerLogs] = React.useState<ClientDebugEntry[]>([]);
  const [filter, setFilter] = React.useState<'all' | 'client' | 'server' | 'ai' | 'error'>('all');
  const [loading, setLoading] = React.useState(false);

  const refreshServerLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      setServerLogs(await fetchServerDebugLogs());
    } catch (error: any) {
      setServerLogs((prev) => [
        {
          id: crypto.randomUUID(),
          source: 'error',
          phase: 'error',
          title: 'Failed to fetch server debug logs',
          timestamp: new Date().toISOString(),
          detail: { message: error?.message },
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const sync = () => setClientLogs([...getClientDebugEntries()]);
    sync();
    return subscribeClientDebug(sync);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    refreshServerLogs();
    const timer = window.setInterval(refreshServerLogs, 2000);
    return () => window.clearInterval(timer);
  }, [open, refreshServerLogs]);

  if (!open) return null;

  const logs = [...clientLogs, ...serverLogs]
    .filter((log) => filter === 'all' || log.source === filter)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const clearAll = async () => {
    clearClientDebugEntries();
    await clearServerDebugLogs().catch(() => undefined);
    setClientLogs([]);
    setServerLogs([]);
  };

  return (
    <div className="debug-console fixed inset-x-4 bottom-4 z-50 rounded-[2rem] bg-slate-950 text-slate-100 shadow-2xl border border-white/10 overflow-hidden">
      <header className="h-14 px-5 flex items-center justify-between border-b border-white/10 bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-500 grid place-items-center">
            <Bug className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm">Debug Console</h3>
            <p className="text-[11px] text-slate-400">前端 fetch、后端 API、DeepSeek 请求与返回</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'client', 'server', 'ai', 'error'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={cn(
                'h-8 px-3 rounded-lg text-[11px] font-black uppercase transition',
                filter === item ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-400 hover:text-white',
              )}
            >
              {item}
            </button>
          ))}
          <button
            onClick={refreshServerLogs}
            className="h-8 px-3 rounded-lg bg-white/5 text-slate-300 text-[11px] font-black flex items-center gap-1"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button onClick={clearAll} className="h-8 w-8 rounded-lg bg-white/5 text-slate-400 grid place-items-center hover:text-white">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="h-8 w-8 rounded-lg bg-white/5 text-slate-400 grid place-items-center hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="h-[42vh] overflow-y-auto custom-scrollbar-dark p-4 space-y-3">
        {logs.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-slate-500">No debug logs yet. Try creating an experiment again.</div>
        ) : (
          logs.map((log) => <DebugLogRow key={`${log.source}-${log.id}`} log={log} />)
        )}
      </div>
    </div>
  );
}

function DebugLogRow({ log }: { key?: React.Key; log: ClientDebugEntry }) {
  const color =
    log.source === 'ai'
      ? 'text-violet-300 bg-violet-500/10 border-violet-500/20'
      : log.source === 'error'
        ? 'text-rose-300 bg-rose-500/10 border-rose-500/20'
        : log.source === 'server'
          ? 'text-sky-300 bg-sky-500/10 border-sky-500/20'
          : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';

  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 group" open={log.source === 'error' || log.source === 'ai'}>
      <summary className="cursor-pointer list-none flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-2 py-1 rounded-lg border text-[10px] font-black uppercase', color)}>{log.source}</span>
            <span className="text-[10px] font-black uppercase text-slate-500">{log.phase}</span>
            {typeof log.durationMs === 'number' && <span className="text-[10px] text-slate-500">{log.durationMs}ms</span>}
          </div>
          <p className="font-bold text-sm text-slate-100 truncate">{log.title}</p>
        </div>
        <time className="text-[10px] text-slate-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</time>
      </summary>
      {log.detail && (
        <pre className="mt-3 overflow-x-auto rounded-xl bg-black/35 p-3 text-[11px] leading-5 text-slate-300">
{JSON.stringify(log.detail, null, 2)}
        </pre>
      )}
    </details>
  );
}

function RoleGate({
  state,
  onChoose,
  onViewArchive,
}: {
  state: StudyState;
  onChoose: (role: Role) => void;
  onViewArchive: (experimentId: string) => void;
}) {
  return (
    <div className="role-selection-page min-h-screen bg-black">
      <ThemeToggle className="theme-toggle-floating" />
      <RoleSelection
        onCommit={(selectedRole) => onChoose(selectedRole === 'host' ? 'creator' : 'participant')}
      />
      <div className="role-selection-history mx-auto w-full max-w-5xl px-6 pb-14">
        <ExperimentHistoryPanel state={state} onViewArchive={onViewArchive} />
      </div>
    </div>
  );
}

type CreateMode = 'quick' | 'upload';

function CreatorSetup({
  existingExperimentTitle,
  onCancel,
  onSubmit,
  isBusy,
}: {
  existingExperimentTitle?: string;
  onCancel?: () => void;
  onSubmit: (input: {
    title: string;
    brief: string;
    creatorName: string;
    initialPrompt: string;
    initialCode: string;
    maxRounds: number;
  }) => void;
  isBusy: boolean;
}) {
  const [title, setTitle] = React.useState('Dream Island');
  const [brief, setBrief] = React.useState('A soft, playful island exploration prototype for collaborative creative development.');
  const [creatorName, setCreatorName] = React.useState('Creator');
  const [mode, setMode] = React.useState<CreateMode>('quick');
  const [initialPrompt, setInitialPrompt] = React.useState(
    'Create a dreamy island exploration web prototype with a playful hero area, soft sky colors, and one simple interaction.',
  );
  const [initialCode, setInitialCode] = React.useState('');
  const [uploadedFileName, setUploadedFileName] = React.useState('');
  const [maxRounds, setMaxRounds] = React.useState(4);

  const handleFileUpload = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setUploadedFileName(file.name);
    setInitialCode(text);
  };

  const submitProject = () => {
    const code = mode === 'upload' ? initialCode : '';
    const prompt = mode === 'quick' ? initialPrompt : '';
    if (mode === 'upload' && !code.trim()) {
      window.alert('请先上传完整 HTML 文件。');
      return;
    }
    if (mode === 'quick' && !prompt.trim()) {
      window.alert('请先填写快速创建 prompt。');
      return;
    }
    onSubmit({ title, brief, creatorName, initialPrompt: prompt, initialCode: code, maxRounds });
  };

  return (
    <section className="setup-grid max-w-6xl mx-auto grid lg:grid-cols-[.85fr_1.15fr] gap-7">
      <div className="setup-intro rounded-[2.5rem] bg-white/75 backdrop-blur border border-white p-8 shadow-xl shadow-blue-100">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-500 mb-4">Creator setup</p>
        <h2 className="product-title text-4xl font-black mb-4">{existingExperimentTitle ? '开启新的实验项目' : '上传或创建第一个项目'}</h2>
        <p className="text-sm text-slate-500 leading-7">
          你可以上传已有 HTML 项目，也可以用“快速创建”调用 DeepSeek，像 AI Studio 一样根据描述生成一个在线网页。
        </p>
        {existingExperimentTitle && (
          <div className="notice-dark mt-6 rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-700 leading-6">
            当前实验「{existingExperimentTitle}」会完整保存在历史实验中。新实验使用独立参与者、金币、评论和版本数据。
          </div>
        )}
        <div className="mt-8 grid grid-cols-2 gap-3 text-center">
          {['Quick Create with DeepSeek', 'Upload HTML Project'].map((item) => (
            <div key={item} className="rounded-2xl bg-blue-50 p-4">
              <p className="text-xs font-black text-blue-600">{item}</p>
            </div>
          ))}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitProject();
        }}
        className="rounded-[2.5rem] bg-white/85 backdrop-blur border border-white p-8 shadow-xl shadow-violet-100 space-y-5"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Project title" value={title} onChange={setTitle} />
          <Field label="Creator name" value={creatorName} onChange={setCreatorName} />
        </div>
        <TextField label="Project brief" value={brief} onChange={setBrief} rows={3} />

        <div>
          <label className="text-xs font-black uppercase tracking-widest text-slate-400">Creation method</label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {[
              { id: 'quick', title: '快速创建', desc: '调用 DeepSeek 生成网页' },
              { id: 'upload', title: '上传项目', desc: '上传 .html 文件' },
            ].map((item) => (
              <InteractiveSurface key={item.id} strength="surface" className="h-full">
                <button
                  type="button"
                  onClick={() => setMode(item.id as CreateMode)}
                  className={cn(
                    'creation-option h-full w-full rounded-2xl border p-4 text-left transition',
                    mode === item.id ? 'selected bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' : 'bg-white border-blue-100 text-slate-500',
                  )}
                >
                  <p className="text-sm font-black">{item.title}</p>
                  <p className={cn('mt-1 text-[11px] font-semibold', mode === item.id ? 'text-blue-100' : 'text-slate-400')}>{item.desc}</p>
                </button>
              </InteractiveSurface>
            ))}
          </div>
        </div>

        {mode === 'quick' && (
          <div className="space-y-3">
            <TextField label="Quick create prompt for DeepSeek" value={initialPrompt} onChange={setInitialPrompt} rows={5} />
            <div className="notice-dark rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-700 leading-6">
              快速创建会请求 DeepSeek 生成初始 HTML。若网络或代理不可用，左下角 Debug 控制台会显示具体失败原因。
            </div>
          </div>
        )}

        {mode === 'upload' && (
          <div className="rounded-2xl bg-white border border-blue-100 p-5">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Upload complete HTML file</span>
              <input
                type="file"
                accept=".html,.htm,text/html"
                onChange={(event) => handleFileUpload(event.target.files?.[0])}
                className="mt-3 block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
              />
            </label>
            <p className="mt-3 text-xs text-slate-500">
              {uploadedFileName ? `已读取：${uploadedFileName}，${initialCode.length} characters` : '第一版先支持上传单个自包含 HTML 文件。'}
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-black uppercase tracking-widest text-slate-400">Max rounds</label>
          <div className="mt-2 flex gap-3">
            {[3, 4].map((round) => (
              <InteractiveSurface key={round} strength="magnetic">
              <button
                type="button"
                onClick={() => setMaxRounds(round)}
                className={cn(
                  'h-11 px-5 rounded-2xl border text-sm font-black transition',
                  maxRounds === round ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-blue-100',
                )}
              >
                {round} rounds
              </button>
              </InteractiveSurface>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-14 px-6 rounded-2xl bg-slate-100 text-slate-500 font-black"
            >
              Cancel
            </button>
          )}
          <button
            disabled={isBusy}
            className="primary-action flex-1 h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 text-white font-black shadow-xl shadow-violet-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isBusy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-white" />}
            {existingExperimentTitle ? 'Archive current & start new experiment' : 'Create experiment'}
          </button>
        </div>
      </form>
    </section>
  );
}

function ParticipantGate({ onJoin, isBusy }: { onJoin: () => void; isBusy: boolean }) {
  const requested = React.useRef(false);

  React.useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    onJoin();
  }, [onJoin]);

  return (
    <section className="join-panel max-w-3xl mx-auto rounded-[2.5rem] bg-white/80 backdrop-blur border border-white p-10 shadow-2xl shadow-blue-100">
      <div className="text-center mb-8">
        <div className="inline-grid h-16 w-16 place-items-center rounded-3xl bg-emerald-50 text-emerald-700 mb-5">
          <Users className={cn('h-8 w-8', isBusy && 'animate-pulse')} />
        </div>
        <h2 className="text-3xl font-black">Assigning your participant number</h2>
        <p className="mt-3 text-sm text-slate-500">
          The room assigns P1–P19 in join order. This number is kept when you refresh or reconnect.
        </p>
      </div>
      <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-emerald-50">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[#C7F8FB] via-[#95CDB6] to-[#0FA958]" />
      </div>
    </section>
  );
}

function StudyRoom({
  state,
  role,
  participantCode,
  isBusy,
  tiedComments,
  tieRankScores,
  onRun,
  onNewExperiment,
  onAbortExperiment,
}: {
  state: StudyState;
  role: Role;
  participantCode: string;
  isBusy: boolean;
  tiedComments: StudyComment[];
  tieRankScores: number[];
  onRun: (action: () => Promise<StudyState>) => void;
  onNewExperiment: () => void;
  onAbortExperiment: () => void;
}) {
  if (!state.experiment) {
    return (
      <section className="max-w-3xl mx-auto rounded-[2.5rem] bg-white/80 border border-white p-10 text-center shadow-xl shadow-blue-100">
        <h2 className="text-3xl font-black mb-3">等待 Creator 上传项目</h2>
        <p className="text-slate-500">Creator 创建实验后，所有参与者会自动进入同一个项目房间。</p>
      </section>
    );
  }

  const experiment = state.experiment;
  const phase = phaseLabels[experiment.phase];
  const currentVersion =
    state.versions.find((version) => version.id === experiment.current_version_id) || state.versions[state.versions.length - 1];
  const liveDraft = experiment.phase === 'developing' ? state.currentDraft : null;
  const currentComments = state.comments.filter((comment) => comment.round_number === experiment.current_round);
  const currentRoundState = state.rounds.find((round) => round.round_number === experiment.current_round);
  const investmentLocked = Boolean(currentRoundState?.investment_locked_v3);
  const joinedParticipants = state.participants.filter((participant) => participant.joined_at);
  const roomOccupancy = joinedParticipants.length + 1;
  const me = state.participants.find((participant) => participant.code === participantCode);

  if (experiment.phase === 'ended' || experiment.phase === 'aborted') {
    return (
      <EndedArchive
        state={state}
        role={role}
        onNewExperiment={onNewExperiment}
      />
    );
  }

  return (
    <div className="study-room max-w-[1800px] mx-auto space-y-6">
      <div className="study-stats grid grid-cols-2 lg:grid-cols-5 gap-4">
        <TopStat icon={<Sparkles />} label={experiment.title} value={`Round ${experiment.current_round}/${experiment.max_rounds}`} />
        <TopStat icon={<Clock3 />} label={phase.subtitle} value={phase.title} tone={phase.tone} />
        <TopStat icon={<Users />} label="Joined participants" value={`${roomOccupancy}/${ROOM_CAPACITY}`} />
        <TopStat
          icon={<CircleDollarSign />}
          label={role === 'creator' ? 'Creator coins' : `${participantCode || 'Participant'} coins`}
          value={`${role === 'creator' ? experiment.creator_coins : me?.coins ?? 0}`}
        />
        <TopStat
          icon={<Trophy />}
          label="Selected ideas"
          value={`${state.selectedIdeas.filter((idea) => idea.round_number === experiment.current_round).length}/3`}
        />
      </div>

      <ParticipantRoster
        participants={state.participants}
        minimumOccupancy={MINIMUM_ROOM_OCCUPANCY}
        capacity={ROOM_CAPACITY}
      />

      <div className="workbench-primary-grid grid items-start xl:grid-cols-[minmax(0,1fr)_480px] gap-6">
        <section className="prototype-frame workbench-preview flex min-h-0 flex-col rounded-[2rem] bg-white/80 border border-white shadow-xl shadow-blue-100 overflow-hidden">
          <div className="h-16 px-6 flex items-center justify-between border-b border-blue-50">
            <div>
              <h2 className="font-black text-lg">{liveDraft ? `Live Candidate Draft ${liveDraft.attempt_number}` : 'Current Prototype'}</h2>
              <p className="text-xs text-slate-500">
                {liveDraft
                  ? 'Visible to everyone while Creator and DeepSeek debug it. This is not published yet.'
                  : 'Participants experience this version before each commenting phase.'}
              </p>
            </div>
            <div className={cn('px-4 py-2 rounded-2xl text-xs font-black', phase.tone)}>{phase.title}</div>
          </div>
          <div className="prototype-canvas min-h-0 flex-1">
            {liveDraft || currentVersion ? (
              <CursorSafeIframe
                title={liveDraft ? 'Live candidate prototype' : 'Current prototype'}
                srcDoc={(liveDraft || currentVersion)?.code}
                className="w-full h-full border-0"
              />
            ) : (
              <div className="h-full grid place-items-center text-slate-400">No prototype yet.</div>
            )}
          </div>
        </section>

        <aside className="workbench-feedback-stack custom-scrollbar-light min-h-0 space-y-4">
          <CreatorControls
            role={role}
            phase={experiment.phase}
            isBusy={isBusy}
            commentCount={currentComments.length}
            selectedIdeas={state.selectedIdeas.filter((idea) => idea.round_number === experiment.current_round)}
            fusionPlan={state.fusionPlan}
            currentDraft={state.currentDraft}
            endVoteSummary={state.endVoteSummary}
            tiedComments={tiedComments}
            tieRankScores={tieRankScores}
            roomOccupancy={roomOccupancy}
            minimumRoomOccupancy={MINIMUM_ROOM_OCCUPANCY}
            onRun={onRun}
            onAbortExperiment={onAbortExperiment}
          />
          {experiment.phase === 'developing' && state.currentDraft && (
            <DevelopmentChatPanel
              state={state}
              role={role}
              isBusy={isBusy}
              onRun={onRun}
            />
          )}
          {experiment.phase === 'ending_vote' && (
            <EndVotePanel
              role={role}
              participantCode={participantCode}
              votes={state.endVotes}
              summary={state.endVoteSummary}
              onRun={onRun}
              isBusy={isBusy}
            />
          )}
          <div className="feedback-market-group">
            <LiveCommentLeaderboard
              role={role}
              participantCode={participantCode}
              phase={experiment.phase}
              comments={currentComments}
              investments={state.investments.filter((investment) => investment.round_number === experiment.current_round)}
              investmentLocked={investmentLocked}
              availableCoins={role === 'creator' ? experiment.creator_coins : me?.coins || 0}
              selectedIdeas={state.selectedIdeas.filter((idea) => idea.round_number === experiment.current_round)}
              onRun={onRun}
              isBusy={isBusy}
              invest={(commentId, amount) => studyApi.invest(role, participantCode, commentId, amount)}
            />
            <CommentPanel
              role={role}
              participantCode={participantCode}
              phase={experiment.phase}
              comments={currentComments}
              marketPrivacyActive={state.marketPrivacyActive}
              onRun={onRun}
              isBusy={isBusy}
              composerOnly
            />
          </div>
        </aside>
      </div>

      <div className="version-workbench-row">
        <VersionTimeline state={state} />
      </div>
    </div>
  );
}

function TopStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-[1.6rem] bg-white/75 border border-white p-5 shadow-lg shadow-blue-100/60 flex items-center gap-4 min-w-0">
      <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 grid place-items-center [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 truncate">{label}</p>
        <p className={cn('text-xl font-black truncate', tone && `inline-block text-sm px-3 py-1 rounded-xl mt-1 ${tone}`)}>{value}</p>
      </div>
    </div>
  );
}

function CreatorControls({
  role,
  phase,
  isBusy,
  commentCount,
  selectedIdeas,
  fusionPlan,
  currentDraft,
  endVoteSummary,
  tiedComments,
  tieRankScores,
  roomOccupancy,
  minimumRoomOccupancy,
  onRun,
  onAbortExperiment,
}: {
  role: Role;
  phase: StudyPhase;
  isBusy: boolean;
  commentCount: number;
  selectedIdeas: StudySelectedIdea[];
  fusionPlan: StudyFusionPlan | null;
  currentDraft: StudyDevelopmentDraft | null;
  endVoteSummary: StudyEndVoteSummary;
  tiedComments: StudyComment[];
  tieRankScores: number[];
  roomOccupancy: number;
  minimumRoomOccupancy: number;
  onRun: (action: () => Promise<StudyState>) => void;
  onAbortExperiment: () => void;
}) {
  const [tieChoices, setTieChoices] = React.useState<number[]>([]);
  const [confirmingAbort, setConfirmingAbort] = React.useState(false);

  React.useEffect(() => {
    const used = new Set<number>();
    const defaults = tieRankScores.map((score) => {
      const match = tiedComments.find((comment) => Number(comment.investor_count || 0) === score && !used.has(comment.id));
      if (match) used.add(match.id);
      return match?.id || 0;
    });
    setTieChoices(defaults);
  }, [tiedComments, tieRankScores]);

  if (role !== 'creator') {
    return (
      <Card title="Host controls" icon={<MousePointer2 />}>
        <p className="text-sm text-slate-500 leading-7">Creator/Host controls the phase transitions. Your participant view updates automatically.</p>
      </Card>
    );
  }

  const actions: Partial<Record<StudyPhase, { label: string; helper: string; run: () => Promise<StudyState>; icon: React.ReactNode }>> = {
    experience: {
      label: 'Start commenting',
      helper:
        roomOccupancy >= minimumRoomOccupancy
          ? `${roomOccupancy}/20 people are ready. Participants can now submit timed comments.`
          : `At least ${minimumRoomOccupancy} people including Host are required. Current room: ${roomOccupancy}/20.`,
      run: () => studyApi.setPhase('commenting'),
      icon: <MessageCircle />,
    },
    commenting: {
      label: 'Close comments & open investing',
      helper: 'Participants get 100 plus the investment their previous-round comments earned. Creator resets to 200.',
      run: () => studyApi.setPhase('investing'),
      icon: <CircleDollarSign />,
    },
    investing: {
      label: 'Lock voting top 3',
      helper:
        commentCount < 3
          ? 'At least three ideas are required. Go back to commenting so participants can submit ideas.'
          : 'The system selects the top three automatically. Creator cannot override the ranking.',
      run: () => studyApi.selectTopIdeas(),
      icon: <Trophy />,
    },
    developing: {
      label: fusionPlan ? 'Generate visible initial draft' : 'Generate AI fusion plan',
      helper: fusionPlan
        ? 'DeepSeek creates Candidate Draft 1. It becomes visible to every participant immediately, even before debugging.'
        : 'DeepSeek will create a read-only plan covering the core idea and both supporting ideas.',
      run: () => (fusionPlan ? studyApi.createInitialDraft() : studyApi.generateFusionPlan()),
      icon: <Code2 />,
    },
  };

  const action = phase === 'developing' && currentDraft ? undefined : actions[phase];

  return (
    <Card title="Creator flow control" icon={<FlaskConical />}>
      {phase === 'previewing' ? (
        <div className="space-y-3">
          <button
            disabled={isBusy}
            onClick={() => onRun(() => studyApi.nextRound())}
            className="primary-action flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 font-black text-white shadow-xl shadow-violet-200 disabled:opacity-50"
          >
            <ChevronRight className="h-5 w-5" />
            Start next round
          </button>
          <button
            disabled={isBusy}
            onClick={() => onRun(() => studyApi.startEndVote())}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-sm font-black text-rose-600 disabled:opacity-50"
          >
            <Flag className="h-4 w-4" />
            Propose project end
          </button>
          <p className="text-xs leading-6 text-slate-500">The project ends only if more than 75% of joined participants vote yes.</p>
        </div>
      ) : phase === 'ending_vote' ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-rose-600">
            <Vote className="h-4 w-4" /> Project-end vote in progress
          </div>
          <p className="mt-2 text-xs leading-6 text-slate-600">
            {endVoteSummary.yes} yes · {endVoteSummary.no} no · {endVoteSummary.pending} pending · {endVoteSummary.requiredYes} yes required
          </p>
        </div>
      ) : action ? (
        <>
          <button
            disabled={
              isBusy ||
              (phase === 'experience' && roomOccupancy < minimumRoomOccupancy) ||
              (phase === 'investing' && commentCount < 3)
            }
            onClick={() => onRun(action.run)}
            className="primary-action w-full h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 text-white font-black shadow-xl shadow-violet-200 disabled:opacity-50 flex items-center justify-center gap-2 [&_svg]:h-5 [&_svg]:w-5"
          >
            {isBusy ? <RefreshCw className="animate-spin" /> : action.icon}
            {action.label}
          </button>
          <p className="mt-3 text-xs text-slate-500 leading-6">{action.helper}</p>
        </>
      ) : (
        <p className="text-sm leading-6 text-slate-500">
          {phase === 'developing' && currentDraft
            ? 'AI Studio is active below. Continue the conversation until the candidate works, then publish it.'
            : 'No action is needed in this phase.'}
        </p>
      )}

      {(['commenting', 'investing', 'developing', 'previewing', 'ending_vote'] as StudyPhase[]).includes(phase) && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onRun(() => studyApi.rollbackPhase())}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          <Undo2 className="h-4 w-4" />
          Back to previous phase
        </button>
      )}

      {tiedComments.length > 0 && tieRankScores.length === 3 && (
        <div className="notice-dark mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3">
            <p className="text-xs font-black text-amber-700">Tie resolution</p>
            <p className="mt-1 text-[11px] leading-5 text-amber-700/80">
              Creator can only choose between ideas with the same vote total. Higher-voted ideas remain locked.
            </p>
          </div>
          <div className="space-y-3">
            {tieRankScores.map((score, index) => (
              <label key={`${score}-${index}`} className="block">
                <span className="mb-1 block text-[11px] font-black text-slate-500">
                  Rank #{index + 1} · {index === 0 ? 'Core' : 'Supporting'} · {score} votes
                </span>
                <select
                  value={tieChoices[index] || ''}
                  onChange={(event) =>
                    setTieChoices((current) => {
                      const next = [...current];
                      next[index] = Number(event.target.value);
                      return next;
                    })
                  }
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none"
                >
                  <option value="">Choose tied idea</option>
                  {tiedComments
                    .filter((comment) => Number(comment.investor_count || 0) === score)
                    .map((comment) => (
                      <option
                        key={comment.id}
                        value={comment.id}
                        disabled={tieChoices.some((choice, choiceIndex) => choiceIndex !== index && choice === comment.id)}
                      >
                        #{comment.id} · {comment.participant_code} · {comment.content.slice(0, 54)}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={isBusy || tieChoices.length !== 3 || tieChoices.some((choice) => !choice) || new Set(tieChoices).size !== 3}
            onClick={() => onRun(() => studyApi.selectTopIdeas(tieChoices))}
            className="mt-4 h-11 w-full rounded-xl bg-amber-500 text-xs font-black text-white disabled:opacity-40"
          >
            Confirm tied ranking
          </button>
        </div>
      )}

      {selectedIdeas.length === 3 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Automatic top 3</p>
            <span className="text-[11px] font-bold text-slate-400">1 core + 2 supporting</span>
          </div>
          {selectedIdeas.map((idea) => (
            <div
              key={idea.comment_id}
              className={cn(
                'rounded-2xl border p-3',
                idea.selection_role === 'core' ? 'border-violet-200 bg-violet-50' : 'border-blue-100 bg-blue-50/60',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-blue-700">
                  #{idea.selection_rank} · {idea.selection_role === 'core' ? 'Core' : 'Supporting'} · {idea.participant_code}
                </span>
                <span className="text-[11px] font-black text-amber-600">{idea.investor_count} votes</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{idea.content}</p>
            </div>
          ))}
        </div>
      )}

      {fusionPlan && (
        <div className="mt-5 rounded-2xl border border-violet-100 bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-black text-violet-600">
            <Sparkles className="h-4 w-4" />
            Read-only fusion plan
          </div>
          <p className="whitespace-pre-wrap text-xs leading-6 text-slate-600">{fusionPlan.content}</p>
        </div>
      )}
      {confirmingAbort ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-black text-rose-700">Stop the current experiment?</p>
          <p className="mt-1 text-[11px] leading-5 text-rose-600">
            The game will stop immediately. Existing data will remain available in Historical experiments.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setConfirmingAbort(false)}
              className="h-10 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={onAbortExperiment}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 text-xs font-black text-white disabled:opacity-50"
            >
              {isBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Confirm stop
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setConfirmingAbort(true)}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-xs font-black text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
        >
          <Flag className="h-4 w-4" />
          Stop current experiment
        </button>
      )}
    </Card>
  );
}

function CommentPanel({
  role,
  participantCode,
  phase,
  comments,
  marketPrivacyActive,
  onRun,
  isBusy,
  composerOnly = false,
}: {
  role: Role;
  participantCode: string;
  phase: StudyPhase;
  comments: StudyComment[];
  marketPrivacyActive: boolean;
  onRun: (action: () => Promise<StudyState>) => void;
  isBusy: boolean;
  composerOnly?: boolean;
}) {
  const [content, setContent] = React.useState('');
  const canComment = role === 'participant' && phase === 'commenting';
  const myIdea = role === 'participant'
    ? comments.find((comment) => comment.participant_code === participantCode || comment.is_own)
    : undefined;
  const loadedIdeaId = React.useRef<number | null>(null);
  const rankByCommentId = React.useMemo(
    () => new Map(getRankedComments(comments).map((comment, index) => [comment.id, index + 1])),
    [comments],
  );

  React.useEffect(() => {
    if (myIdea && loadedIdeaId.current !== myIdea.id) {
      loadedIdeaId.current = myIdea.id;
      setContent(myIdea.content);
    } else if (!myIdea && loadedIdeaId.current !== null) {
      loadedIdeaId.current = null;
      setContent('');
    }
  }, [myIdea?.id]);

  const submit = () => {
    if (!content.trim()) return;
    onRun(() => studyApi.comment(participantCode, content));
  };

  const remove = () => {
    onRun(async () => {
      const next = await studyApi.deleteComment(participantCode);
      loadedIdeaId.current = null;
      setContent('');
      return next;
    });
  };

  const composer = (
    <div className={composerOnly ? 'unified-comment-composer' : 'mt-4'}>
      {myIdea && canComment && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <div>
            <p className="text-xs font-black text-emerald-700">Your round Idea · 100 Coin awarded</p>
            <p className="mt-1 text-[11px] text-emerald-600">You can edit it until investing begins. Updates do not award more Coin.</p>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={remove}
            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-[11px] font-black text-rose-600 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value.slice(0, COMMENT_CHARACTER_LIMIT))}
        disabled={!canComment || isBusy}
        maxLength={COMMENT_CHARACTER_LIMIT}
        placeholder={canComment ? '写下你希望下一版怎么改...' : '评论阶段开放后才可以提交'}
        rows={5}
        className="comment-composer w-full resize-none overflow-y-auto rounded-2xl border border-blue-100 bg-white/80 p-4 text-sm outline-none focus:border-blue-300 disabled:bg-slate-50 disabled:text-slate-400"
      />
      <div className="comment-composer-count" aria-live="polite">
        <span>{content.trim() ? '已输入' : '评论内容'}</span>
        <strong>{content.length}/{COMMENT_CHARACTER_LIMIT}</strong>
      </div>
      <button
        onClick={submit}
        disabled={!canComment || !content.trim() || isBusy}
        className="primary-action mt-3 w-full h-12 rounded-2xl bg-blue-600 text-white font-black disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center gap-2"
      >
        <Send className="h-4 w-4" />
        {myIdea ? 'Update Idea' : 'Submit Idea · earn 100 Coin'}
      </button>
    </div>
  );

  if (composerOnly) return composer;

  return (
    <Card title="Round comments" icon={<MessageCircle />} badge={`${comments.length} ideas`}>
      <div className="comment-scroll-region min-h-0 space-y-3 overflow-y-auto pr-1 custom-scrollbar-light">
        {comments.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-400">No comments in this round yet.</div>
        ) : (
          comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              rank={rankByCommentId.get(comment.id)}
              hideMarketInfo={marketPrivacyActive}
            />
          ))
        )}
      </div>

      {composer}
    </Card>
  );
}

function DevelopmentChatPanel({
  state,
  role,
  isBusy,
  onRun,
}: {
  state: StudyState;
  role: Role;
  isBusy: boolean;
  onRun: (action: () => Promise<StudyState>) => void;
}) {
  const [message, setMessage] = React.useState('');
  const round = state.experiment?.current_round || 0;
  const drafts = state.developmentDrafts.filter((draft) => draft.round_number === round);
  const messages = state.developmentMessages.filter((item) => item.round_number === round);
  const currentDraft = state.currentDraft;
  const canRollback = Boolean(
    currentDraft && drafts.some((draft) => draft.attempt_number < currentDraft.attempt_number),
  );

  const submit = () => {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;
    onRun(async () => {
      const next = await studyApi.debugDraft(cleanMessage);
      setMessage('');
      return next;
    });
  };

  return (
    <Card
      title="AI Studio development"
      icon={<Code2 />}
      badge={currentDraft ? `Draft ${currentDraft.attempt_number} · live` : 'preparing'}
    >
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-blue-50 p-4">
        <div className="flex items-center gap-2 text-xs font-black text-violet-600">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-50" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
          </span>
          {role === 'creator' ? 'Creator debugging live' : 'Read-only Creator debugging stream'}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          Every AI candidate and public change summary is visible to all participants. Only publishing creates the official round version.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {drafts.map((draft) => (
          <span
            key={draft.id}
            className={cn(
              'rounded-xl px-3 py-1.5 text-[10px] font-black',
              draft.id === currentDraft?.id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400',
            )}
          >
            Draft {draft.attempt_number}
          </span>
        ))}
      </div>

      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1 custom-scrollbar-light">
        {messages.map((item) => {
          const draft = item.draft_id ? drafts.find((candidate) => candidate.id === item.draft_id) : null;
          return (
            <div
              key={item.id}
              className={cn(
                'message-card rounded-2xl border p-3',
                item.role === 'creator'
                  ? 'ml-6 border-blue-100 bg-blue-50'
                  : item.role === 'assistant'
                    ? 'mr-6 border-violet-100 bg-violet-50'
                    : 'border-slate-100 bg-slate-50',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  {item.role === 'creator' ? 'Creator' : item.role === 'assistant' ? 'DeepSeek' : 'System'}
                </p>
                {draft && <span className="text-[10px] font-black text-violet-500">Draft {draft.attempt_number}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-600">{item.content}</p>
            </div>
          );
        })}
      </div>

      {role === 'creator' ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={isBusy}
            rows={4}
            placeholder="Tell DeepSeek what is broken or what still needs to be completed..."
            className="w-full rounded-2xl border border-violet-100 bg-white p-4 text-sm outline-none focus:border-violet-300 disabled:bg-slate-50"
          />
          <button
            type="button"
            disabled={isBusy || !message.trim()}
            onClick={submit}
            className="primary-action flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-600 text-sm font-black text-white disabled:opacity-40"
          >
            {isBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send & generate next draft
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isBusy || !canRollback}
              onClick={() => onRun(() => studyApi.rollbackDraft())}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-500 disabled:opacity-35"
            >
              <Undo2 className="h-4 w-4" /> Previous draft
            </button>
            <button
              type="button"
              disabled={isBusy || !currentDraft}
              onClick={() => onRun(() => studyApi.publishDraft())}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-xs font-black text-white disabled:opacity-40"
            >
              <BadgeCheck className="h-4 w-4" /> Publish current
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">
          You can watch each candidate update live. Commenting and investing reopen only after Creator publishes the working version.
        </p>
      )}
    </Card>
  );
}

function EndVotePanel({
  role,
  participantCode,
  votes,
  summary,
  onRun,
  isBusy,
}: {
  role: Role;
  participantCode: string;
  votes: StudyEndVote[];
  summary: StudyEndVoteSummary;
  onRun: (action: () => Promise<StudyState>) => void;
  isBusy: boolean;
}) {
  const myVote = votes.find((vote) => vote.participant_code === participantCode);
  const percent = summary.eligible > 0 ? Math.round((summary.yes / summary.eligible) * 100) : 0;

  return (
    <Card title="Project-end vote" icon={<Vote />} badge={`${percent}% yes`}>
      <div className="rounded-2xl bg-rose-50 p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-2xl font-black text-rose-600">
              {summary.yes}/{summary.eligible}
            </p>
            <p className="text-[11px] font-bold text-slate-500">Yes votes / eligible participants</p>
          </div>
          <p className="text-right text-xs font-black text-rose-500">More than 75% · need {summary.requiredYes}</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-violet-500" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-3 text-xs text-slate-500">{summary.no} no · {summary.pending} waiting</p>
      </div>

      {role === 'participant' ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            disabled={isBusy}
            onClick={() => onRun(() => studyApi.voteProjectEnd(participantCode, true))}
            className={cn(
              'h-12 rounded-2xl text-sm font-black transition disabled:opacity-50',
              myVote?.vote === 1 ? 'bg-emerald-500 text-white' : 'border border-emerald-200 bg-emerald-50 text-emerald-600',
            )}
          >
            Vote to end
          </button>
          <button
            disabled={isBusy}
            onClick={() => onRun(() => studyApi.voteProjectEnd(participantCode, false))}
            className={cn(
              'h-12 rounded-2xl text-sm font-black transition disabled:opacity-50',
              myVote?.vote === 0 ? 'bg-slate-700 text-white' : 'border border-slate-200 bg-white text-slate-600',
            )}
          >
            Continue project
          </button>
        </div>
      ) : (
        <p className="mt-4 text-xs leading-6 text-slate-500">Creator initiated the proposal but does not vote. The decision belongs to joined participants.</p>
      )}
    </Card>
  );
}

function EndedArchive({
  state,
  role,
  onNewExperiment,
  onBack,
}: {
  state: StudyState;
  role: Role | null;
  onNewExperiment?: () => void;
  onBack?: () => void;
}) {
  const experiment = state.experiment!;
  const isAborted = experiment.phase === 'aborted';
  const [selectedVersionId, setSelectedVersionId] = React.useState(
    experiment.current_version_id || state.versions[state.versions.length - 1]?.id,
  );
  const selectedVersion =
    state.versions.find((version) => version.id === selectedVersionId) || state.versions[state.versions.length - 1];
  const selectedSources = selectedVersion
    ? state.versionSources.filter((source) => source.version_id === selectedVersion.id)
    : [];
  const selectedPlan = selectedSources.length
    ? state.fusionPlans.find((plan) => plan.round_number === selectedVersion?.round_number)
    : null;
  const selectedDrafts = selectedSources.length
    ? state.developmentDrafts.filter((draft) => draft.round_number === selectedVersion?.round_number)
    : [];
  const selectedMessages = selectedSources.length
    ? state.developmentMessages.filter((message) => message.round_number === selectedVersion?.round_number)
    : [];

  return (
    <div className="mx-auto max-w-[1800px] space-y-6">
      <section className="archive-hero overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-slate-950 via-blue-950 to-violet-950 p-8 text-white shadow-2xl shadow-blue-200">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black">
              {isAborted ? <Flag className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />}{' '}
              {onBack ? 'Historical experiment archive' : isAborted ? 'Project stopped' : 'Project completed'}
            </div>
            <h2 className="text-4xl font-black">{experiment.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100">
              {isAborted
                ? 'Creator stopped this experiment. The game is closed, but everyone can still review its saved rounds, ideas, AI conversations, and latest project version.'
                : 'The interactive experiment has ended. Everyone can review each round, its adopted ideas, fusion plan, and the final result.'}
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-11 items-center gap-2 rounded-2xl bg-white/10 px-4 text-xs font-black text-white hover:bg-white/20"
                >
                  <Undo2 className="h-4 w-4" /> Back to start page
                </button>
              )}
              {role === 'creator' && onNewExperiment && (
                <button
                  type="button"
                  onClick={onNewExperiment}
                  className="flex h-11 items-center gap-2 rounded-2xl bg-white px-5 text-xs font-black text-blue-950 shadow-lg"
                >
                  <Play className="h-4 w-4" /> Start new experiment
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <ArchiveStat label="Rounds" value={experiment.current_round} />
              <ArchiveStat label="Versions" value={state.versions.length} />
              <ArchiveStat
                label={isAborted ? 'Status' : 'End votes'}
                value={isAborted ? 'Stopped' : `${state.endVoteSummary.yes}/${state.endVoteSummary.eligible}`}
              />
            </div>
          </div>
        </div>
      </section>

      {!isAborted && <FinalCoinLeaderboard entries={state.leaderboard} />}

      <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <Card title="Round progress" icon={<Clock3 />} badge={`${state.versions.length} snapshots`}>
          <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1 custom-scrollbar-light">
            {state.versions.map((version, index) => {
              const sources = state.versionSources.filter((source) => source.version_id === version.id);
              const isFinal = version.id === experiment.current_version_id;
              return (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setSelectedVersionId(version.id)}
                  className={cn(
                    'w-full rounded-2xl border p-4 text-left transition',
                    selectedVersion?.id === version.id
                      ? 'border-violet-300 bg-violet-50 shadow-lg shadow-violet-100'
                      : 'border-blue-100 bg-white hover:border-blue-200',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-blue-950">{index === 0 ? 'Initial project' : version.title}</p>
                    <span className="rounded-xl bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600">
                      {isFinal ? (isAborted ? 'LATEST' : 'FINAL') : `R${version.round_number}`}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    {sources.length > 0
                      ? sources.map((source) => `${source.participant_code}: ${source.content}`).join(' · ')
                      : 'Creator initial version'}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>

        <section className="archive-preview overflow-hidden rounded-[2rem] border border-white bg-white/80 shadow-xl shadow-blue-100">
          <div className="border-b border-blue-50 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-violet-500">
                  {selectedVersion?.id === experiment.current_version_id
                    ? isAborted
                      ? 'Latest saved project version'
                      : 'Final project result'
                    : 'Historical project version'}
                </p>
                <h3 className="mt-1 text-xl font-black text-blue-950">{selectedVersion?.title}</h3>
              </div>
              <span className="rounded-2xl bg-blue-50 px-4 py-2 text-xs font-black text-blue-600">
                Round {selectedVersion?.round_number}
              </span>
            </div>

            {selectedSources.length > 0 && (
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {selectedSources.map((source) => (
                  <div key={source.comment_id} className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
                    <p className="text-[11px] font-black text-blue-600">
                      #{source.selection_rank} {source.selection_role === 'core' ? 'Core' : 'Supporting'} · {source.participant_code}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{source.content}</p>
                  </div>
                ))}
              </div>
            )}

            {selectedPlan && (
              <details className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                <summary className="cursor-pointer text-xs font-black text-violet-600">View this round's fusion plan</summary>
                <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-600">{selectedPlan.content}</p>
              </details>
            )}

            {selectedDrafts.length > 0 && (
              <details className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <summary className="cursor-pointer text-xs font-black text-blue-600">
                  View transparent AI debugging history · {selectedDrafts.length} candidate drafts
                </summary>
                <div className="mt-3 space-y-2">
                  {selectedMessages.map((message) => (
                    <div key={message.id} className="rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">
                      <span className="font-black text-blue-600">
                        {message.role === 'creator' ? 'Creator' : message.role === 'assistant' ? 'DeepSeek' : 'System'}:
                      </span>{' '}
                      {message.content}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
          <div className="h-[650px] bg-white">
            {selectedVersion ? (
              <CursorSafeIframe title="Archived project version" srcDoc={selectedVersion.code} className="h-full w-full border-0" />
            ) : (
              <div className="grid h-full place-items-center text-slate-400">No archived version.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ExperimentHistoryPanel({
  state,
  onViewArchive,
}: {
  state: StudyState;
  onViewArchive: (experimentId: string) => void;
}) {
  const archives = state.experimentHistory.filter(
    (experiment) => !experiment.is_active || experiment.phase === 'ended' || experiment.phase === 'aborted',
  );
  if (archives.length === 0) return null;

  return (
    <Card title="Historical experiments" icon={<Clock3 />} badge={`${archives.length} records`}>
      <p className="mb-4 text-xs leading-6 text-slate-500">
        Previous experiments remain read-only. Their comments, investments, candidate drafts, AI conversations, votes, and final versions are preserved.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {archives.map((experiment) => (
          <InteractiveSurface key={experiment.id} strength="surface">
          <button
            type="button"
            onClick={() => onViewArchive(experiment.id)}
            className="archive-item w-full rounded-2xl border border-blue-100 bg-white p-4 text-left transition hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-blue-950">{experiment.title}</p>
                <p className="mt-1 text-[11px] text-slate-400">{new Date(experiment.created_at).toLocaleString()}</p>
              </div>
              <span className="rounded-xl bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">
                {experiment.phase}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <ArchiveMiniStat label="Rounds" value={experiment.current_round} />
              <ArchiveMiniStat label="Versions" value={experiment.version_count} />
              <ArchiveMiniStat label="People" value={experiment.participant_count} />
            </div>
            <p className="mt-4 flex items-center justify-end gap-1 text-xs font-black text-violet-600">
              View archive <ArrowRight className="h-3.5 w-3.5" />
            </p>
          </button>
          </InteractiveSurface>
        ))}
      </div>
    </Card>
  );
}

function ArchiveMiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="archive-mini-stat rounded-xl bg-blue-50/70 px-2 py-2">
      <p className="text-sm font-black text-blue-700">{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

function ArchiveStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-24 rounded-2xl bg-white/10 px-4 py-3">
      <p className="text-xl font-black">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-blue-200">{label}</p>
    </div>
  );
}

function FinalCoinLeaderboard({ entries }: { entries: StudyLeaderboardEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card title="Final Coin leaderboard" icon={<Trophy />} badge={`${entries.length} Participants`}>
      <div className="overflow-x-auto">
        <table className="leaderboard-table w-full min-w-[860px] border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              <th className="px-4 py-2">Rank</th>
              <th className="px-4 py-2">Participant</th>
              <th className="px-4 py-2">Final Coin</th>
              <th className="px-4 py-2">Top 3 Ideas</th>
              <th className="px-4 py-2">First place</th>
              <th className="px-4 py-2">Received</th>
              <th className="px-4 py-2">Author earnings</th>
              <th className="px-4 py-2">Investment net</th>
              <th className="px-4 py-2">Top 3 hits</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.participant_code}
                className={cn(
                  'text-sm font-bold text-slate-600',
                  entry.rank === 1 ? 'bg-amber-50' : 'bg-white/80',
                )}
              >
                <td className="rounded-l-2xl px-4 py-4 text-lg font-black text-blue-950">
                  {entry.rank === 1 ? '🏆' : `#${entry.rank}`}
                </td>
                <td className="px-4 py-4 font-black text-blue-700">{entry.participant_code}</td>
                <td className="px-4 py-4 text-lg font-black text-amber-600">{entry.coins}</td>
                <td className="px-4 py-4">{entry.top_three_count}</td>
                <td className="px-4 py-4">{entry.first_place_count}</td>
                <td className="px-4 py-4">{entry.received_investment}</td>
                <td className="px-4 py-4 text-emerald-600">+{entry.author_earnings}</td>
                <td className={cn('px-4 py-4', entry.investment_net >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {entry.investment_net >= 0 ? '+' : ''}{entry.investment_net}
                </td>
                <td className="rounded-r-2xl px-4 py-4">{entry.top_three_hits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">
        Ranking is determined by final Coin. Ties are resolved by investment net, first-place Ideas, then total Top 3 Ideas.
      </p>
    </Card>
  );
}

function VersionTimeline({ state }: { state: StudyState }) {
  return (
    <div className="version-timeline-shell self-start">
      <Card title="Version evolution" icon={<Eye />} badge={`${state.versions.length} versions`}>
        <VersionEvolution state={state} />
      </Card>
    </div>
  );
}

function ExpandableCommentText({ content, className = '' }: { content: string; className?: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const canExpand = content.length > 140;

  return (
    <div className={className}>
      <p className={cn('text-sm leading-6 text-slate-600 break-words', canExpand && !expanded && 'line-clamp-3')}>
        {content}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-[11px] font-black text-blue-600 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  rank,
  hideMarketInfo = false,
}: {
  key?: React.Key;
  comment: StudyComment;
  rank?: number;
  hideMarketInfo?: boolean;
}) {
  return (
    <div className={cn('comment-card rounded-2xl border border-blue-100 bg-white/80 p-4', rank && `comment-rank-${Math.min(rank, 5)}`)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black text-blue-600">
          {hideMarketInfo ? (comment.is_own ? 'Your anonymous Idea' : 'Anonymous Idea') : `#${rank ?? '—'} · ${comment.participant_code}`}
        </p>
        <p className="text-xs font-black text-amber-600">{hideMarketInfo ? 'Voting hidden' : `${comment.investor_count || 0} votes`}</p>
      </div>
      <ExpandableCommentText content={comment.content} />
    </div>
  );
}

function Card({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ui-card rounded-[2rem] bg-white/80 border border-white p-6 shadow-xl shadow-blue-100/70">
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 grid place-items-center [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
          <h3 className="font-black">{title}</h3>
        </div>
        {badge && <span className="rounded-xl bg-slate-100 text-slate-500 px-3 py-1 text-xs font-black">{badge}</span>}
      </header>
      {children}
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="ui-field block">
      <span className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full h-12 rounded-2xl border border-blue-100 bg-white/80 px-4 text-sm font-semibold outline-none focus:border-blue-300"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
}) {
  return (
    <label className="ui-field block">
      <span className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-blue-100 bg-white/80 p-4 text-sm outline-none focus:border-blue-300"
      />
    </label>
  );
}
