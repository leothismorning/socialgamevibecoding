import type { GalleryRole, GalleryState } from '../galleryTypes';

async function request(path: string, options?: RequestInit): Promise<GalleryState> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

const body = (value: Record<string, unknown>) => JSON.stringify(value);

export const galleryApi = {
  state: (clientId: string) => request(`/api/gallery/state?clientId=${encodeURIComponent(clientId)}`),
  join: (clientId: string, role: GalleryRole, code: string) => request('/api/gallery/join', {
    method: 'POST', body: body({ clientId, role, code }),
  }),
  model: (clientId: string, provider: GalleryState['aiProvider']) => request('/api/gallery/ai-provider', {
    method: 'POST', body: body({ clientId, provider }),
  }),
  generate: (clientId: string, values: { title: string; brief: string; prompt: string }) =>
    request('/api/gallery/apps/generate', { method: 'POST', body: body({ clientId, ...values }) }),
  upload: (clientId: string, values: { title: string; brief: string; prompt: string; code: string }) =>
    request('/api/gallery/apps/upload', { method: 'POST', body: body({ clientId, ...values }) }),
  refine: (clientId: string, message: string) => request('/api/gallery/apps/refine', {
    method: 'POST', body: body({ clientId, message }),
  }),
  publish: (clientId: string) => request('/api/gallery/apps/publish', {
    method: 'POST', body: body({ clientId }),
  }),
  start: (clientId: string) => request('/api/gallery/start', { method: 'POST', body: body({ clientId }) }),
  endRound: (clientId: string) => request('/api/gallery/end-round', { method: 'POST', body: body({ clientId }) }),
  nextRound: (clientId: string) => request('/api/gallery/next-round', { method: 'POST', body: body({ clientId }) }),
  end: (clientId: string) => request('/api/gallery/end', { method: 'POST', body: body({ clientId }) }),
  newExperiment: (clientId: string) => request('/api/gallery/new-experiment', {
    method: 'POST', body: body({ clientId }),
  }),
  comment: (clientId: string, appId: string, content: string) => request('/api/gallery/comments', {
    method: 'POST', body: body({ clientId, appId, content }),
  }),
  deleteComment: (clientId: string, appId: string) => request('/api/gallery/comments', {
    method: 'DELETE', body: body({ clientId, appId }),
  }),
  likeComment: (clientId: string, commentId: number) => request(`/api/gallery/comments/${commentId}/like`, {
    method: 'POST', body: body({ clientId }),
  }),
  likeApp: (clientId: string, appId: string, stage: 'showcase' | 'final') =>
    request(`/api/gallery/apps/${appId}/like`, { method: 'POST', body: body({ clientId, stage }) }),
  retryJob: (clientId: string, jobId: number) => request(`/api/gallery/jobs/${jobId}/retry`, {
    method: 'POST', body: body({ clientId }),
  }),
  cancelJob: (clientId: string, jobId: number) => request(`/api/gallery/jobs/${jobId}/cancel`, {
    method: 'POST', body: body({ clientId }),
  }),
  redevelopJob: (clientId: string, jobId: number) => request(`/api/gallery/jobs/${jobId}/redevelop`, {
    method: 'POST', body: body({ clientId }),
  }),
};
