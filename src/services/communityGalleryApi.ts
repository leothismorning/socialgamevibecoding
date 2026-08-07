import type {
  CommunityGalleryState,
  CommunitySourceType,
  CreatorDevelopmentProgress,
} from '../communityGalleryTypes';

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）。`);
  return payload as T;
}

const request = (path: string, options?: RequestInit) =>
  requestJson<CommunityGalleryState>(path, options);

const body = (value: Record<string, unknown>) => JSON.stringify(value);

export const communityGalleryApi = {
  state: (clientId: string) =>
    request(`/api/community-gallery/state?clientId=${encodeURIComponent(clientId)}`),
  join: (clientId: string, account: string, password: string) =>
    request('/api/community-gallery/join', {
      method: 'POST',
      body: body({ clientId, account, password }),
    }),
  model: (clientId: string, provider: CommunityGalleryState['aiProvider']) =>
    request('/api/community-gallery/model', {
      method: 'POST',
      body: body({ clientId, provider }),
    }),
  generateInitial: (
    clientId: string,
    values: { title: string; brief: string; prompt: string; operationId: string },
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
  refine: (clientId: string, message: string, operationId?: string) =>
    request('/api/community-gallery/apps/refine', {
      method: 'POST',
      body: body({ clientId, message, operationId }),
    }),
  developmentProgress: (clientId: string, operationId: string) =>
    requestJson<CreatorDevelopmentProgress>(
      `/api/community-gallery/development-progress?clientId=${encodeURIComponent(clientId)}&operationId=${encodeURIComponent(operationId)}`,
    ),
  publishInitial: (clientId: string) =>
    request('/api/community-gallery/apps/publish-initial', {
      method: 'POST',
      body: body({ clientId }),
    }),
  deleteInitialApp: (clientId: string, appId: string) =>
    request(`/api/community-gallery/apps/${appId}`, {
      method: 'DELETE',
      body: body({ clientId }),
    }),
  publishProject: (clientId: string) =>
    request('/api/community-gallery/apps/publish-project', {
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
  editComment: (clientId: string, commentId: number, content: string) =>
    request(`/api/community-gallery/comments/${commentId}`, {
      method: 'PATCH',
      body: body({ clientId, content }),
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
  editSynthesis: (clientId: string, synthesisId: number, content: string) =>
    request(`/api/community-gallery/syntheses/${synthesisId}`, {
      method: 'PATCH',
      body: body({ clientId, content }),
    }),
  deleteSynthesis: (clientId: string, synthesisId: number) =>
    request(`/api/community-gallery/syntheses/${synthesisId}`, {
      method: 'DELETE',
      body: body({ clientId }),
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
    sources: Array<{ type: CommunitySourceType; id: number }>,
    creatorInstruction: string,
    baseVersionId?: number,
  ) => request(`/api/community-gallery/apps/${appId}/generate-community`, {
    method: 'POST',
    body: body({ clientId, sources, creatorInstruction, baseVersionId }),
  }),
  useWildcard: (clientId: string, appId: string, commentId: number) =>
    request(`/api/community-gallery/apps/${appId}/wildcard`, {
      method: 'POST',
      body: body({ clientId, commentId }),
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
  startStudy: (clientId: string, isTest: boolean) =>
    request('/api/community-gallery/study/start', {
      method: 'POST',
      body: body({ clientId, isTest }),
    }),
  enterDevelopment: (
    clientId: string,
    iterationNumber: 1 | 2,
    isTest: boolean,
    appIds?: string[],
  ) =>
    request('/api/community-gallery/study/enter-development', {
      method: 'POST',
      body: body({ clientId, iterationNumber, isTest, appIds }),
    }),
  controlAppFlows: (
    clientId: string,
    appIds: string[],
    action: 'rollback',
  ) => request('/api/community-gallery/apps/flow-control', {
    method: 'POST',
    body: body({ clientId, appIds, action }),
  }),
  retryAppDevelopment: (clientId: string, appIds: string[]) =>
    request('/api/community-gallery/apps/retry-development', {
      method: 'POST',
      body: body({ clientId, appIds }),
    }),
  setTestCreators: (
    clientId: string,
    testCreatorCodes: string[],
  ) => request('/api/community-gallery/study/test-creators', {
    method: 'POST',
    body: body({ clientId, testCreatorCodes }),
  }),
  retryDevelopment: (clientId: string, jobId: number) =>
    request(`/api/community-gallery/jobs/${jobId}/retry`, {
      method: 'POST',
      body: body({ clientId }),
    }),
  clearTestData: (clientId: string, confirmation: string) =>
    request('/api/community-gallery/study/clear-test-data', {
      method: 'POST',
      body: body({ clientId, confirmation }),
    }),
  closeStudy: (clientId: string, isTest: boolean) =>
    request('/api/community-gallery/study/close', {
      method: 'POST',
      body: body({ clientId, isTest }),
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
