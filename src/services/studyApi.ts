import { StudyPhase, StudyState } from '../types';
import { addClientDebug } from './debugClient';

async function requestStudy(path: string, body?: unknown): Promise<StudyState> {
  const url = `/api/study/${path}`;
  const method = body ? 'POST' : 'GET';
  const startedAt = performance.now();

  addClientDebug({
    phase: 'request',
    title: `${method} ${url}`,
    detail: {
      bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
      bodySize: body ? JSON.stringify(body).length : 0,
    },
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error: any) {
    addClientDebug({
      source: 'error',
      phase: 'error',
      title: `${method} ${url} network failed`,
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        message: error?.message,
        name: error?.name,
      },
    });
    throw error;
  }

  const data = await response.json().catch(() => null);
  addClientDebug({
    source: response.ok ? 'client' : 'error',
    phase: response.ok ? 'response' : 'error',
    title: `${method} ${url} -> ${response.status}`,
    durationMs: Math.round(performance.now() - startedAt),
    detail: {
      status: response.status,
      ok: response.ok,
      error: data?.error,
      tiedComments: data?.tiedComments?.length,
      rankScores: data?.rankScores,
      experimentPhase: data?.experiment?.phase,
      currentRound: data?.experiment?.current_round,
    },
  });

  if (!response.ok) {
    const error = new Error(data?.error || `Study API failed: ${response.status}`);
    (error as any).tiedComments = data?.tiedComments;
    (error as any).rankScores = data?.rankScores;
    throw error;
  }
  return data;
}

export const studyApi = {
  state: (viewerRole?: 'creator' | 'participant' | null, participantCode?: string) => {
    const params = new URLSearchParams();
    if (viewerRole) params.set('viewerRole', viewerRole);
    if (participantCode) params.set('participantCode', participantCode);
    const query = params.toString();
    return requestStudy(`state${query ? `?${query}` : ''}`);
  },
  archive: (experimentId: string) => requestStudy(`archive/${encodeURIComponent(experimentId)}`),
  createExperiment: (input: {
    title: string;
    brief: string;
    creatorName: string;
    initialPrompt: string;
    initialCode: string;
    maxRounds: number;
  }) => requestStudy('experiment', input),
  join: (clientId: string) => requestStudy('join', { clientId }),
  leave: (clientId: string) => requestStudy('leave', { clientId }),
  setPhase: (phase: StudyPhase) => requestStudy('phase', { phase }),
  rollbackPhase: () => requestStudy('rollback-phase', {}),
  abortExperiment: () => requestStudy('abort-experiment', {}),
  comment: (participantCode: string, content: string) => requestStudy('comments', { participantCode, content }),
  deleteComment: (participantCode: string) => requestStudy('comments/delete', { participantCode }),
  invest: (actorType: 'participant' | 'creator', participantCode: string, commentId: number, amount: number) =>
    requestStudy('investments', { actorType, participantCode, commentId, amount }),
  selectTopIdeas: (commentIds?: number[]) => requestStudy('select-top-ideas', commentIds ? { commentIds } : {}),
  generateFusionPlan: () => requestStudy('generate-fusion-plan', {}),
  createInitialDraft: () => requestStudy('development/initial', {}),
  debugDraft: (message: string) => requestStudy('development/debug', { message }),
  rollbackDraft: () => requestStudy('development/rollback', {}),
  publishDraft: () => requestStudy('development/publish', {}),
  nextRound: () => requestStudy('next-round', {}),
  startEndVote: () => requestStudy('start-end-vote', {}),
  voteProjectEnd: (participantCode: string, vote: boolean) => requestStudy('end-vote', { participantCode, vote }),
};
