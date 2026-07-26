import type {
  CommunityGalleryState,
  CommunitySourceType,
} from '../communityGalleryTypes';

async function request(path: string, options?: RequestInit): Promise<CommunityGalleryState> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）。`);
  return payload;
}

const body = (value: Record<string, unknown>) => JSON.stringify(value);

export const communityGalleryApi = {
  state: (clientId: string) =>
    request(`/api/community-gallery/state?clientId=${encodeURIComponent(clientId)}`),
  join: (clientId: string, code: string) =>
    request('/api/community-gallery/join', {
      method: 'POST',
      body: body({ clientId, code }),
    }),
  model: (clientId: string, provider: CommunityGalleryState['aiProvider']) =>
    request('/api/community-gallery/model', {
      method: 'POST',
      body: body({ clientId, provider }),
    }),
  generateInitial: (
    clientId: string,
    values: { title: string; brief: string; prompt: string },
  ) => request('/api/community-gallery/apps/generate-initial', {
    method: 'POST',
    body: body({ clientId, ...values }),
  }),
  uploadInitial: (
    clientId: string,
    values: { title: string; brief: string; prompt: string; code: string },
  ) => request('/api/community-gallery/apps/upload-initial', {
    method: 'POST',
    body: body({ clientId, ...values }),
  }),
  refine: (clientId: string, message: string) =>
    request('/api/community-gallery/apps/refine', {
      method: 'POST',
      body: body({ clientId, message }),
    }),
  publishInitial: (clientId: string) =>
    request('/api/community-gallery/apps/publish-initial', {
      method: 'POST',
      body: body({ clientId }),
    }),
  comment: (
    clientId: string,
    values: {
      appId: string;
      content: string;
      parentCommentId?: number;
      targetType?: 'app' | 'synthesis';
      targetId?: string;
    },
  ) => request('/api/community-gallery/comments', {
    method: 'POST',
    body: body({ clientId, ...values }),
  }),
  deleteComment: (clientId: string, commentId: number) =>
    request(`/api/community-gallery/comments/${commentId}`, {
      method: 'DELETE',
      body: body({ clientId }),
    }),
  likeComment: (clientId: string, commentId: number) =>
    request(`/api/community-gallery/comments/${commentId}/like`, {
      method: 'POST',
      body: body({ clientId }),
    }),
  likeApp: (clientId: string, appId: string) =>
    request(`/api/community-gallery/apps/${appId}/like`, {
      method: 'POST',
      body: body({ clientId }),
    }),
  toggleBasket: (clientId: string, sourceType: CommunitySourceType, sourceId: number) =>
    request('/api/community-gallery/basket/toggle', {
      method: 'POST',
      body: body({ clientId, sourceType, sourceId }),
    }),
  createSynthesis: (
    clientId: string,
    values: {
      targetAppId: string;
      title: string;
      content: string;
      sources: Array<{ type: CommunitySourceType; id: number; note?: string }>;
    },
  ) => request('/api/community-gallery/syntheses', {
    method: 'POST',
    body: body({ clientId, ...values }),
  }),
  withdrawSynthesisForVote: (clientId: string, synthesisId: number) =>
    request(`/api/community-gallery/syntheses/${synthesisId}/withdraw-for-vote`, {
      method: 'POST',
      body: body({ clientId }),
    }),
  voteForSynthesis: (clientId: string, synthesisId: number) =>
    request(`/api/community-gallery/syntheses/${synthesisId}/vote`, {
      method: 'POST',
      body: body({ clientId }),
    }),
  generateCommunity: (
    clientId: string,
    appId: string,
    synthesisId: number,
    creatorInstruction: string,
    baseVersionId?: number,
    selectionReason = '',
  ) => request(`/api/community-gallery/apps/${appId}/generate-community`, {
    method: 'POST',
    body: body({ clientId, synthesisId, creatorInstruction, baseVersionId, selectionReason }),
  }),
  uploadCommunity: (
    clientId: string,
    appId: string,
    values: {
      code: string;
      summary: string;
      prompt: string;
      baseVersionId?: number;
      selectionReason?: string;
    },
  ) => request(`/api/community-gallery/apps/${appId}/upload-community`, {
    method: 'POST',
    body: body({ clientId, ...values }),
  }),
  publishCommunity: (clientId: string, appId: string) =>
    request(`/api/community-gallery/apps/${appId}/publish-community`, {
      method: 'POST',
      body: body({ clientId }),
    }),
  readNotifications: (clientId: string) =>
    request('/api/community-gallery/notifications/read', {
      method: 'POST',
      body: body({ clientId }),
    }),
  celebrateNotifications: (clientId: string, notificationIds: number[]) =>
    request('/api/community-gallery/notifications/celebrated', {
      method: 'POST',
      body: body({ clientId, notificationIds }),
    }),
  startStudy: (clientId: string) =>
    request('/api/community-gallery/study/start', {
      method: 'POST',
      body: body({ clientId }),
    }),
  enterDevelopment: (clientId: string, iterationNumber: 1 | 2) =>
    request('/api/community-gallery/study/enter-development', {
      method: 'POST',
      body: body({ clientId, iterationNumber }),
    }),
  returnToPreviousStage: (clientId: string) =>
    request('/api/community-gallery/study/return-to-previous-stage', {
      method: 'POST',
      body: body({ clientId }),
    }),
  closeStudy: (clientId: string) =>
    request('/api/community-gallery/study/close', {
      method: 'POST',
      body: body({ clientId }),
    }),
  newStudy: (clientId: string) =>
    request('/api/community-gallery/study/new', {
      method: 'POST',
      body: body({ clientId }),
    }),
  previewUrl: (
    clientId: string,
    appId: string,
    version: 'initial' | 'community' | 'draft',
    cacheKey = '',
    versionId?: number,
  ) => `/api/community-gallery/apps/${encodeURIComponent(appId)}/preview`
    + `?clientId=${encodeURIComponent(clientId)}&version=${version}&v=${encodeURIComponent(cacheKey)}`
    + (versionId ? `&versionId=${encodeURIComponent(versionId)}` : ''),
  track: (
    clientId: string,
    eventType: string,
    entityType?: string,
    entityId?: string,
    data?: Record<string, unknown>,
  ) => fetch('/api/community-gallery/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body({ clientId, eventType, entityType, entityId, data }),
  }).catch(() => undefined),
};
