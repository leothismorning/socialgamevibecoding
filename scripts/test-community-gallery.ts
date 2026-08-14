import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-gallery-async-'));
process.env.STUDY_DB_PATH = path.join(testDir, 'study.db');

const gallery = await import('../server/communityGalleryDb.js');
const { buildCommunityWorkspaceArchive } = await import('../server/communityGalleryArchive.js');
const { db } = await import('../server/studyDb.js');
const html = (title: string) => `<!doctype html><html><body><main><h1>${title}</h1></main></body></html>`;
const client = (account: number) => `client-${account}`;

assert.throws(() => gallery.joinCommunityGallery('bad-password', '1', '2'), /账号或密码错误/);
assert.throws(() => gallery.joinCommunityGallery('bad-account', '51', '51'), /账号或密码错误/);
assert.throws(() => gallery.joinCommunityGallery('padded-account', '01', '01'), /账号或密码错误/);

const hostClient = client(0);
let state = gallery.joinCommunityGallery(hostClient, '0', '0');
assert.equal(state.viewer?.role, 'host');
assert.equal(state.viewer?.code, 'H01');

state = gallery.setCommunityTestCreators(hostClient, ['C01', 'C02']);
assert.equal(state.study.test_roles_configured, true);
assert.equal((state.participants as any[]).find((participant) => participant.code === 'C01')?.is_test, 1);
assert.equal((state.participants as any[]).find((participant) => participant.code === 'C03')?.is_test, 0);

// Existing studies are expanded additively: missing new accounts are restored
// without changing any existing participant number or role assignment.
db.prepare(`DELETE FROM vg_async_participants WHERE study_id = ? AND code = 'C50'`).run(state.study.id);
state = gallery.getCommunityGalleryState(hostClient);
assert.equal((state.participants as any[]).find((participant) => participant.code === 'C01')?.is_test, 1);
assert.equal((state.participants as any[]).find((participant) => participant.code === 'C30')?.code, 'C30');
assert.equal((state.participants as any[]).find((participant) => participant.code === 'C50')?.code, 'C50');

for (const account of [31, 50]) {
  const creatorState = gallery.joinCommunityGallery(client(account), String(account), String(account));
  assert.equal(creatorState.viewer?.code, `C${account}`);
  assert.equal(Number(creatorState.viewer?.isTest), 0);
}

assert.throws(
  () => gallery.setCommunityTestCreators('not-host', ['C01']),
  /先选择|身份/,
);

for (const account of [1, 2, 3, 4, 5, 6]) {
  const creatorState = gallery.joinCommunityGallery(client(account), String(account), String(account));
  assert.equal(creatorState.viewer?.code, `C${String(account).padStart(2, '0')}`);
  assert.equal(Number(creatorState.viewer?.isTest), account <= 2 ? 1 : 0);
}

assert.equal(gallery.getCommunityGalleryState(hostClient).study.home_feed_order, 'number_asc');
assert.throws(
  () => gallery.setCommunityHomeFeedOrder(hostClient, 'newest' as any),
  /排序方式无效/,
);
state = gallery.setCommunityHomeFeedOrder(client(1), 'number_desc');
assert.equal(state.study.home_feed_order, 'number_desc');
assert.equal(gallery.getCommunityGalleryState(client(2)).study.home_feed_order, 'number_asc');
assert.equal(gallery.getCommunityGalleryState(hostClient).study.home_feed_order, 'number_asc');
state = gallery.setCommunityHomeFeedOrder(client(1), 'time_asc');
assert.equal(state.study.home_feed_order, 'time_asc');
state = gallery.setCommunityHomeFeedOrder(client(1), 'time_desc');
assert.equal(state.study.home_feed_order, 'time_desc');
assert.throws(
  () => gallery.setCommunityHomeFeedOrder(client(1), 'random'),
  /只能选择按编号或发布时间排序/,
);
state = gallery.setCommunityHomeFeedOrder(hostClient, 'time_desc');
assert.equal(state.study.home_feed_order, 'time_desc');
assert.equal(gallery.getCommunityGalleryState(client(1)).study.home_feed_order, 'time_desc');
state = gallery.setCommunityHomeFeedOrder(client(1), 'number_asc');
assert.equal(state.study.home_feed_order, 'number_asc');
assert.equal(gallery.getCommunityGalleryState(client(2)).study.home_feed_order, 'time_desc');
state = gallery.setCommunityHomeFeedOrder(hostClient, 'random');
const firstShuffleSeed = state.study.home_feed_shuffle_seed;
assert.equal(state.study.home_feed_order, 'random');
assert.equal(gallery.getCommunityGalleryState(client(1)).study.home_feed_order, 'random');
assert.ok(firstShuffleSeed);
assert.equal(gallery.getCommunityGalleryState(client(1)).study.home_feed_shuffle_seed, firstShuffleSeed);
state = gallery.setCommunityHomeFeedOrder(hostClient, 'random');
assert.equal(state.study.home_feed_order, 'random');
assert.notEqual(state.study.home_feed_shuffle_seed, firstShuffleSeed);
state = gallery.setCommunityHomeFeedOrder(hostClient, 'number_asc');
assert.equal(state.study.home_feed_order, 'number_asc');
assert.equal(gallery.getCommunityGalleryState(client(2)).study.home_feed_order, 'number_asc');

const failedOperationId = 'creator-operation-failure-test';
gallery.startCreatorDevelopmentOperation(client(5), failedOperationId, 'generate');
gallery.recordCreatorDevelopmentProgress(failedOperationId, {
  step: 'logic',
  order: 5,
  status: 'running',
  title: 'AI 正在实现交互逻辑',
  detail: '测试中的开发步骤。',
});
gallery.failCreatorDevelopmentOperation(failedOperationId, new Error('upstream disconnected'));
const failedCreatorState = gallery.getCommunityGalleryState(client(5));
assert.equal(failedCreatorState.creatorDevelopment?.status, 'failed');
assert.match(failedCreatorState.creatorDevelopment?.error || '', /失败，请重试/);
assert.equal(failedCreatorState.creatorDevelopment?.events[0]?.status, 'failed');
assert.match(failedCreatorState.creatorDevelopment?.events[0]?.title || '', /失败，请重试/);

const reloggedCreatorClient = 'client-5-relogin';
const reloggedCreatorState = gallery.joinCommunityGallery(reloggedCreatorClient, '5', '5');
assert.equal(reloggedCreatorState.creatorDevelopment?.id, failedOperationId);
const retryOperationId = 'creator-operation-retry-test';
gallery.startCreatorDevelopmentOperation(reloggedCreatorClient, retryOperationId, 'generate');
gallery.failCreatorDevelopmentOperation(retryOperationId, new Error('test cleanup'));

const publishInitial = (account: number, title: string) => {
  const clientId = client(account);
  gallery.saveInitialDraft({
    clientId,
    title,
    brief: `Project by ${account}`,
    prompt: `Build ${title}`,
    code: html(title),
    summary: 'Initial version',
  });
  return gallery.publishInitialVersion(clientId);
};

publishInitial(1, 'Test App One');
publishInitial(2, 'Test App Two');
publishInitial(3, 'Regular App Three');
publishInitial(4, 'Regular App Four');
publishInitial(5, 'Temporary App Five');

state = gallery.saveInitialDraft({
  clientId: client(6),
  title: 'Disposable Draft Six',
  brief: 'Unpublished draft deletion test',
  prompt: 'Build a disposable draft',
  code: html('Disposable Draft Six'),
  summary: 'Draft only',
});
const disposableDraft = state.apps.find((app: any) => app.creator_code === 'C06');
assert.ok(disposableDraft);
assert.equal(disposableDraft.initial_version_id, null);
assert.equal(disposableDraft.flow_stage, 'waiting_round_1');
assert.equal(Number((db.prepare(`SELECT COUNT(*) AS count FROM vg_async_drafts WHERE app_id = ?`).get(disposableDraft.id) as { count: number }).count), 1);
state = gallery.deleteOwnInitialApp(client(6), disposableDraft.id);
assert.equal(state.apps.some((app: any) => app.id === disposableDraft.id), false);
assert.equal(Number((db.prepare(`SELECT COUNT(*) AS count FROM vg_async_drafts WHERE app_id = ?`).get(disposableDraft.id) as { count: number }).count), 0);

db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('ai_provider', 'deepseek')`).run();
const hostState = gallery.getCommunityGalleryState(hostClient);
assert.equal(hostState.aiProvider, 'deepseek-pro');
const testApp = hostState.apps.find((app: any) => app.creator_code === 'C01');
const secondTestApp = hostState.apps.find((app: any) => app.creator_code === 'C02');
const regularApp = hostState.apps.find((app: any) => app.creator_code === 'C03');
const secondRegularApp = hostState.apps.find((app: any) => app.creator_code === 'C04');
const temporaryApp = hostState.apps.find((app: any) => app.creator_code === 'C05');
assert.ok(testApp);
assert.ok(secondTestApp);
assert.ok(regularApp);
assert.ok(secondRegularApp);
assert.ok(temporaryApp);
assert.equal(Number(testApp.is_test), 1);
assert.equal(Number(regularApp.is_test), 0);
assert.equal(testApp.flow_stage, 'round_1');
assert.equal(regularApp.flow_stage, 'round_1');

const publishedVersionsBeforeLike = db.prepare(`
  SELECT id, app_id, version_number, kind, code
  FROM vg_async_versions WHERE study_id = ? ORDER BY id
`).all(hostState.study.id);
const testInitialVersion = hostState.versions.find(
  (version: any) => version.app_id === testApp.id && version.kind === 'initial',
);
assert.ok(testInitialVersion);
state = gallery.toggleCommunityAppLike(client(2), testApp.id, Number(testInitialVersion.id));
let likedTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(Number(likedTestApp.like_count), 1);
assert.equal(Number(likedTestApp.viewer_liked), 1);
let likedTestVersion = state.versions.find((version: any) => version.id === testInitialVersion.id);
assert.equal(Number(likedTestVersion.like_count), 1);
assert.equal(Number(likedTestVersion.viewer_liked), 1);
state = gallery.toggleCommunityAppLike(client(2), testApp.id, Number(testInitialVersion.id));
likedTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(Number(likedTestApp.like_count), 0);
assert.equal(Number(likedTestApp.viewer_liked), 0);
assert.throws(
  () => gallery.toggleCommunityAppLike(client(1), testApp.id, Number(testInitialVersion.id)),
  /不能点赞自己的应用/,
);
assert.deepEqual(
  db.prepare(`
    SELECT id, app_id, version_number, kind, code
    FROM vg_async_versions WHERE study_id = ? ORDER BY id
  `).all(hostState.study.id),
  publishedVersionsBeforeLike,
  'liking and unliking an App must never modify or remove a published version or its HTML',
);

const regularInitialVersion = hostState.versions.find(
  (version: any) => version.app_id === regularApp.id && version.kind === 'initial',
);
assert.ok(regularInitialVersion);
const hostDownload = gallery.getPublishedCommunityVersionDownload(
  hostClient,
  regularApp.id,
  Number(regularInitialVersion.id),
);
assert.equal(hostDownload.code, html('Regular App Three'));
assert.equal(hostDownload.creator_code, 'C03');
assert.throws(
  () => gallery.getPublishedCommunityVersionDownload(
    client(4),
    regularApp.id,
    Number(regularInitialVersion.id),
  ),
  /主持人身份/,
);

assert.throws(
  () => gallery.deleteOwnInitialApp(client(4), temporaryApp.id),
  /只有该应用的创作者/,
);
state = gallery.deleteOwnInitialApp(client(5), temporaryApp.id);
assert.equal(state.apps.some((app: any) => app.id === temporaryApp.id), false);
assert.equal(Number((db.prepare(`SELECT COUNT(*) AS count FROM vg_async_versions WHERE app_id = ?`).get(temporaryApp.id) as { count: number }).count), 0);

const testViewerState = gallery.getCommunityGalleryState(client(2));
assert.deepEqual(
  [...new Set(testViewerState.apps.map((app: any) => Number(app.is_test)))],
  [1],
);
assert.equal(testViewerState.apps.some((app: any) => app.id === regularApp.id), false);

const regularViewerState = gallery.getCommunityGalleryState(client(4));
assert.deepEqual(
  [...new Set(regularViewerState.apps.map((app: any) => Number(app.is_test)))],
  [0],
);
assert.equal(regularViewerState.apps.some((app: any) => app.id === testApp.id), false);

assert.throws(
  () => gallery.getCommunityPreview(client(4), testApp.id, 'initial'),
  /无权查看|不存在/,
);
assert.throws(
  () => gallery.getCommunityPreview(client(2), regularApp.id, 'initial'),
  /无权查看|不存在/,
);
assert.match(gallery.getCommunityPreview(hostClient, testApp.id, 'initial'), /Test App One/);

assert.throws(() => gallery.saveCommunityComment({
  clientId: client(2),
  appId: testApp.id,
  content: 'Workspace has not started.',
}), /开始该账号空间/);

state = gallery.startAsyncCommunityStudy(hostClient, true);
assert.equal(state.workspaces.test.status, 'active');
assert.equal(state.workspaces.regular.status, 'setup');
assert.throws(
  () => gallery.setCommunityTestCreators(hostClient, ['C01']),
  /开始前/,
);

// After the Host locks the first-round draw, the App owner may replace the AI
// task with a complete local HTML file. Uploading is also the V1 publish action.
state = gallery.saveCommunityComment({
  clientId: client(1),
  appId: secondTestApp.id,
  content: 'Use this idea for the uploaded first community version.',
});
const uploadSourceComment = state.comments.find(
  (comment: any) => comment.content === 'Use this idea for the uploaded first community version.',
);
assert.ok(uploadSourceComment);
const uploadDevelopment = gallery.enterCommunityDevelopmentStage(
  hostClient,
  1,
  true,
  [secondTestApp.id],
);
assert.equal(uploadDevelopment.jobIds.length, 1);
const selectedIdeaNotification = gallery.getCommunityGalleryState(client(1)).notifications.find(
  (notification: any) => notification.app_id === secondTestApp.id,
);
assert.ok(selectedIdeaNotification);
gallery.markCommunityNotificationsRead(client(1));
gallery.markCommunityNotificationsCelebrated(client(1), [selectedIdeaNotification.id]);
let replayedNotification = db.prepare(`
  SELECT read_at, celebrated_at FROM vg_async_notifications WHERE id = ?
`).get(selectedIdeaNotification.id) as { read_at?: string; celebrated_at?: string };
assert.ok(replayedNotification.read_at);
assert.ok(replayedNotification.celebrated_at);
assert.throws(
  () => gallery.replayCelebratedContributionNotifications(client(1)),
  /主持人|身份/,
);
gallery.replayCelebratedContributionNotifications(hostClient);
replayedNotification = db.prepare(`
  SELECT read_at, celebrated_at FROM vg_async_notifications WHERE id = ?
`).get(selectedIdeaNotification.id) as { read_at?: string; celebrated_at?: string };
assert.ok(replayedNotification.read_at, 'replaying a popup must not turn the message back into unread');
assert.equal(replayedNotification.celebrated_at, null);
assert.throws(
  () => gallery.uploadAndPublishFirstCommunityVersion(
    client(1),
    secondTestApp.id,
    html('Unauthorized Uploaded V1'),
    'unauthorized.html',
  ),
  /只有该应用的创作者/,
);
const uploadedV1Code = html('Test App Two Uploaded V1');
state = gallery.uploadAndPublishFirstCommunityVersion(
  client(2),
  secondTestApp.id,
  uploadedV1Code,
  'test-app-two-v1.html',
);
const uploadedV1App = state.apps.find((app: any) => app.id === secondTestApp.id);
const uploadedV1 = state.versions.find((version: any) => (
  version.app_id === secondTestApp.id
  && version.kind === 'community'
  && Number(version.version_number) === 2
));
assert.ok(uploadedV1);
assert.equal(uploadedV1App.flow_stage, 'round_2');
assert.equal(Number(uploadedV1App.community_version_count), 1);
assert.equal(uploadedV1.selection_reason, 'creator_html_upload');
assert.equal(gallery.getCommunityPreview(client(2), secondTestApp.id, 'community'), uploadedV1Code);
assert.equal(state.generationJobs.find(
  (job: any) => Number(job.id) === Number(uploadDevelopment.jobIds[0]),
)?.status, 'cancelled');
assert.equal(Number((db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_drafts WHERE app_id = ?
`).get(secondTestApp.id) as { count: number }).count), 0);
gallery.completeCommunityGeneration(
  uploadDevelopment.jobIds[0],
  html('Late AI result must be ignored'),
  'Late AI result',
);
gallery.failCommunityGeneration(uploadDevelopment.jobIds[0], new Error('late AI failure'));
assert.equal(
  gallery.getCommunityPreview(client(2), secondTestApp.id, 'community'),
  uploadedV1Code,
  'a late AI result must never overwrite an uploaded and published V1',
);

// The same upload path is available after the second-round draw. It must use
// V1 as its base, publish V2, cancel the round-two AI task, and complete the App.
state = gallery.saveCommunityComment({
  clientId: client(1),
  appId: secondTestApp.id,
  content: 'Use this idea for the uploaded second community version.',
});
const uploadV2SourceComment = state.comments.find(
  (comment: any) => comment.content === 'Use this idea for the uploaded second community version.',
);
assert.ok(uploadV2SourceComment);
const uploadV2Development = gallery.enterCommunityDevelopmentStage(
  hostClient,
  2,
  true,
  [secondTestApp.id],
);
assert.equal(uploadV2Development.jobIds.length, 1);
assert.throws(
  () => gallery.uploadAndPublishCommunityVersion(
    client(1),
    secondTestApp.id,
    html('Unauthorized Uploaded V2'),
    'unauthorized-v2.html',
  ),
  /只有该应用的创作者/,
);
const uploadedV2Code = html('Test App Two Uploaded V2');
state = gallery.uploadAndPublishCommunityVersion(
  client(2),
  secondTestApp.id,
  uploadedV2Code,
  'test-app-two-v2.html',
);
const uploadedV2App = state.apps.find((app: any) => app.id === secondTestApp.id);
const uploadedV2 = state.versions.find((version: any) => (
  version.app_id === secondTestApp.id
  && version.kind === 'community'
  && Number(version.version_number) === 3
));
assert.ok(uploadedV2);
assert.equal(uploadedV2App.flow_stage, 'completed');
assert.equal(Number(uploadedV2App.community_version_count), 2);
assert.equal(uploadedV2.selection_reason, 'creator_html_upload');
assert.equal(Number(uploadedV2.base_version_id), Number(uploadedV1.id));
assert.equal(gallery.getCommunityPreview(client(2), secondTestApp.id, 'community'), uploadedV2Code);
assert.equal(state.generationJobs.find(
  (job: any) => Number(job.id) === Number(uploadV2Development.jobIds[0]),
)?.status, 'cancelled');
assert.throws(
  () => gallery.replacePublishedCommunityVersionHtml(
    client(1),
    secondTestApp.id,
    uploadedV2.id,
    html('Unauthorized Replacement V2'),
    'unauthorized-replacement-v2.html',
  ),
  /只有该应用的创作者/,
);
const correctedUploadedV2Code = html('Test App Two Corrected Uploaded V2');
state = gallery.replacePublishedCommunityVersionHtml(
  client(2),
  secondTestApp.id,
  uploadedV2.id,
  correctedUploadedV2Code,
  'test-app-two-v2-corrected.html',
);
const correctedUploadedV2App = state.apps.find((app: any) => app.id === secondTestApp.id);
const correctedUploadedV2 = state.versions.find((version: any) => (
  version.app_id === secondTestApp.id
  && version.kind === 'community'
  && Number(version.version_number) === 3
));
assert.equal(Number(correctedUploadedV2.id), Number(uploadedV2.id));
assert.equal(correctedUploadedV2.selection_reason, 'creator_html_upload');
assert.equal(Number(correctedUploadedV2App.community_version_count), 2);
assert.equal(correctedUploadedV2App.flow_stage, 'completed');
assert.equal(
  gallery.getCommunityPreview(client(2), secondTestApp.id, 'community'),
  correctedUploadedV2Code,
);
assert.throws(
  () => gallery.replacePublishedCommunityVersionHtml(
    client(2),
    secondTestApp.id,
    uploadedV1.id,
    html('Replacing An Old Version Must Fail'),
    'old-v1.html',
  ),
  /当前最新/,
);

state = gallery.saveCommunityComment({
  clientId: client(2),
  appId: testApp.id,
  content: 'A test-only comment.',
});
const firstRoundComment = state.comments.find((comment: any) => comment.content === 'A test-only comment.');
assert.ok(firstRoundComment);
state = gallery.saveCommunityComment({
  clientId: client(2),
  appId: testApp.id,
  content: 'An alternate first-round wildcard direction.',
});
const alternateFirstRoundComment = state.comments.find(
  (comment: any) => comment.content === 'An alternate first-round wildcard direction.',
);
assert.ok(alternateFirstRoundComment);
state = gallery.useCommunityWildcard(client(1), testApp.id, firstRoundComment.id);
let selectedWildcard = state.wildcards.find((wildcard: any) => wildcard.app_id === testApp.id);
assert.ok(selectedWildcard);
assert.equal(Number(selectedWildcard.iteration_number), 1);
assert.equal(Number(selectedWildcard.source_id), Number(firstRoundComment.id));
assert.throws(
  () => gallery.cancelCommunityWildcard(client(2), testApp.id),
  /只有该应用的创作者/,
);
state = gallery.cancelCommunityWildcard(client(1), testApp.id);
assert.equal(state.wildcards.some((wildcard: any) => wildcard.app_id === testApp.id), false);
assert.throws(
  () => gallery.cancelCommunityWildcard(client(1), testApp.id),
  /没有已选择的万能卡评论/,
);
state = gallery.createSynthesis({
  clientId: client(2),
  targetAppId: testApp.id,
  title: 'First round synthesis',
  content: 'A first-round combined direction.',
  sources: [{ type: 'comment', id: firstRoundComment.id }],
});
let currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(Number(currentTestApp.current_round_comment_count), 2);
assert.equal(Number(currentTestApp.current_round_synthesis_count), 1);
let startedDevelopment = gallery.enterCommunityDevelopmentStage(hostClient, 1, true, [testApp.id]);
assert.equal(startedDevelopment.jobIds.length, 1);
assert.ok(startedDevelopment.codexTaskId);
state = gallery.toggleCommunityAppLike(client(2), testApp.id, Number(testInitialVersion.id));
likedTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(Number(likedTestApp.like_count), 1);
assert.equal(Number(likedTestApp.viewer_liked), 1);
state = gallery.useCommunityWildcard(client(1), testApp.id, firstRoundComment.id);
state = gallery.cancelCommunityWildcard(client(1), testApp.id);
state = gallery.useCommunityWildcard(client(1), testApp.id, alternateFirstRoundComment.id);
const firstRelockedDevelopment = gallery.enterCommunityDevelopmentStage(
  hostClient,
  1,
  true,
  [testApp.id],
);
assert.equal(firstRelockedDevelopment.jobIds.length, 1);
assert.notEqual(firstRelockedDevelopment.codexTaskId, startedDevelopment.codexTaskId);
let supersededTask = gallery.getCodexCommunityDevelopmentTask(startedDevelopment.codexTaskId!);
assert.equal(supersededTask.items[0].status, 'cancelled');
let relockedTask = gallery.getCodexCommunityDevelopmentTask(firstRelockedDevelopment.codexTaskId!);
assert.ok(relockedTask.items[0].selectedIdeas.some(
  (idea: any) => idea.sourceType === 'comment'
    && Number(idea.sourceId) === Number(alternateFirstRoundComment.id),
));
gallery.failCommunityGeneration(firstRelockedDevelopment.jobIds[0], new Error('simulated generation failure'));
state = gallery.cancelCommunityWildcard(client(1), testApp.id);
state = gallery.useCommunityWildcard(client(1), testApp.id, firstRoundComment.id);
startedDevelopment = gallery.enterCommunityDevelopmentStage(hostClient, 1, true, [testApp.id]);
relockedTask = gallery.getCodexCommunityDevelopmentTask(startedDevelopment.codexTaskId!);
assert.ok(relockedTask.items[0].selectedIdeas.some(
  (idea: any) => idea.sourceType === 'comment'
    && Number(idea.sourceId) === Number(firstRoundComment.id),
));
gallery.completeCommunityGeneration(startedDevelopment.jobIds[0], html('Test App One V1'), 'First community version');
state = gallery.getCommunityGalleryState(client(1));
assert.equal(state.syntheses.filter((synthesis: any) => (
  synthesis.target_app_id === testApp.id && synthesis.is_development_brief
)).length, 1, 'only the latest relocked development brief should remain visible');
assert.throws(
  () => gallery.discardCommunityDevelopment(client(2), testApp.id),
  /只有该应用的创作者|只能操作|自己的应用/,
);
state = gallery.discardCommunityDevelopment(client(1), testApp.id);
currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(currentTestApp.flow_stage, 'round_1');
assert.equal(currentTestApp.draft_kind, null);
assert.equal(state.wildcards.some((wildcard: any) => wildcard.app_id === testApp.id), false);
assert.equal(state.syntheses.some((synthesis: any) => (
  synthesis.target_app_id === testApp.id && synthesis.is_development_brief
)), false);
assert.equal(state.generationJobs.find(
  (job: any) => Number(job.id) === Number(startedDevelopment.jobIds[0]),
)?.status, 'cancelled');
assert.equal(Number((db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_stage_selections
  WHERE app_id = ? AND iteration_number = 1
`).get(testApp.id) as { count: number }).count), 0);
assert.equal(Number((db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_notifications
  WHERE app_id = ? AND type = 'contribution_selected' AND version_number = 1
`).get(testApp.id) as { count: number }).count), 0);
assert.ok(state.comments.some((comment: any) => comment.id === firstRoundComment.id));
state = gallery.useCommunityWildcard(client(1), testApp.id, alternateFirstRoundComment.id);
startedDevelopment = gallery.enterCommunityDevelopmentStage(hostClient, 1, true, [testApp.id]);
relockedTask = gallery.getCodexCommunityDevelopmentTask(startedDevelopment.codexTaskId!);
assert.ok(relockedTask.items[0].selectedIdeas.some(
  (idea: any) => idea.sourceType === 'comment'
    && Number(idea.sourceId) === Number(alternateFirstRoundComment.id),
), 'a discarded wildcard must be selectable again for the replacement task');
gallery.completeCommunityGeneration(startedDevelopment.jobIds[0], html('Test App One V1'), 'Replacement first community version');
state = gallery.publishCommunityVersion(client(1), testApp.id);
currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(currentTestApp.flow_stage, 'round_2');
assert.equal(Number(currentTestApp.current_round_comment_count), 0);
assert.equal(Number(currentTestApp.current_round_synthesis_count), 0);
likedTestVersion = state.versions.find((version: any) => version.id === testInitialVersion.id);
const firstCommunityVersion = state.versions.find(
  (version: any) => version.app_id === testApp.id && version.kind === 'community',
);
assert.ok(firstCommunityVersion);
assert.equal(Number(likedTestVersion.like_count), 1);
assert.equal(Number(firstCommunityVersion.like_count), 0);
state = gallery.toggleCommunityAppLike(client(2), testApp.id, Number(firstCommunityVersion.id));
likedTestVersion = state.versions.find((version: any) => version.id === testInitialVersion.id);
const likedFirstCommunityVersion = state.versions.find(
  (version: any) => version.id === firstCommunityVersion.id,
);
assert.equal(Number(likedTestVersion.like_count), 1);
assert.equal(Number(likedFirstCommunityVersion.like_count), 1);
assert.equal(Number(likedFirstCommunityVersion.viewer_liked), 1);
state = gallery.saveCommunityComment({
  clientId: client(2),
  appId: testApp.id,
  content: 'A second-round comment.',
});
const secondRoundComment = state.comments.find((comment: any) => comment.content === 'A second-round comment.');
assert.ok(secondRoundComment);
state = gallery.createSynthesis({
  clientId: client(2),
  targetAppId: testApp.id,
  title: 'Second round synthesis',
  content: 'A second-round combined direction.',
  sources: [{ type: 'comment', id: secondRoundComment.id }],
});
currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(Number(currentTestApp.current_round_comment_count), 1);
assert.equal(Number(currentTestApp.current_round_synthesis_count), 1);
const secondRoundSynthesis = state.syntheses.find(
  (synthesis: any) => synthesis.title === 'Second round synthesis',
);
assert.ok(secondRoundSynthesis);
state = gallery.toggleCommunityCommentLike(client(1), secondRoundComment.id);
state = gallery.voteForSynthesis(client(1), secondRoundSynthesis.id);
state = gallery.toggleCreativeBasket(client(1), 'comment', secondRoundComment.id);
assert.throws(
  () => gallery.rollbackFirstCommunityVersion(client(2), testApp.id),
  /只有主持人/,
  'a non-owner Creator may not roll back the published first community version',
);
assert.throws(
  () => gallery.rollbackFirstCommunityVersion(client(1), testApp.id),
  /只有主持人/,
  'the App Creator no longer owns the published-version rollback control',
);
state = gallery.rollbackFirstCommunityVersion(hostClient, testApp.id);
currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(currentTestApp.flow_stage, 'development_1');
assert.equal(currentTestApp.community_version_id, null);
assert.equal(Number(currentTestApp.community_version_count), 0);
assert.equal(currentTestApp.draft_kind, 'community');
assert.equal(Number(currentTestApp.draft_iteration_number), 1);
assert.match(String(currentTestApp.draft_code), /Test App One V1/);
assert.equal(state.versions.some((version: any) => version.id === firstCommunityVersion.id), false);
assert.equal(state.comments.some((comment: any) => comment.id === secondRoundComment.id), false);
assert.equal(state.syntheses.some((synthesis: any) => synthesis.id === secondRoundSynthesis.id), false);
assert.ok(state.comments.some((comment: any) => comment.id === firstRoundComment.id));
assert.ok(state.syntheses.some((synthesis: any) => synthesis.title === 'First round synthesis'));
assert.equal(state.basket.some((item: any) => (
  item.source_type === 'comment' && Number(item.source_id) === Number(secondRoundComment.id)
)), false);
assert.equal(Number((db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_comment_likes WHERE comment_id = ?
`).get(secondRoundComment.id) as { count: number }).count), 0);
assert.equal(Number((db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_synthesis_likes WHERE synthesis_id = ?
`).get(secondRoundSynthesis.id) as { count: number }).count), 0);

state = gallery.publishCommunityVersion(client(1), testApp.id);
currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(currentTestApp.flow_stage, 'round_2');
assert.equal(Number(currentTestApp.community_version_count), 1);
state = gallery.saveCommunityComment({
  clientId: client(2),
  appId: testApp.id,
  content: 'A recreated second-round comment.',
});
const recreatedSecondRoundComment = state.comments.find(
  (comment: any) => comment.content === 'A recreated second-round comment.',
);
assert.ok(recreatedSecondRoundComment);
state = gallery.createSynthesis({
  clientId: client(2),
  targetAppId: testApp.id,
  title: 'Recreated second round synthesis',
  content: 'A recreated second-round combined direction.',
  sources: [{ type: 'comment', id: recreatedSecondRoundComment.id }],
});
startedDevelopment = gallery.enterCommunityDevelopmentStage(
  hostClient,
  2,
  true,
  [testApp.id],
);
assert.ok(startedDevelopment.codexTaskId);
let codexTask = gallery.getCodexCommunityDevelopmentTask(startedDevelopment.codexTaskId);
assert.equal(codexTask.status, 'waiting');
assert.equal(codexTask.itemCount, 1);
assert.equal(codexTask.items[0].status, 'waiting_codex');
assert.match(codexTask.fixedPrompt, /保留原文件/);
assert.match(codexTask.items[0].baseCode, /Test App One V1/);
assert.ok(codexTask.items[0].selectedIdeas.length >= 1);
const supersededSecondRoundTaskId = startedDevelopment.codexTaskId!;
startedDevelopment = gallery.enterCommunityDevelopmentStage(hostClient, 2, true, [testApp.id]);
supersededTask = gallery.getCodexCommunityDevelopmentTask(supersededSecondRoundTaskId);
assert.equal(supersededTask.items[0].status, 'cancelled');
codexTask = gallery.getCodexCommunityDevelopmentTask(startedDevelopment.codexTaskId!);
assert.ok(codexTask.items[0].selectedIdeas.length >= 1);
codexTask = gallery.claimCodexCommunityDevelopmentTask(startedDevelopment.codexTaskId);
assert.equal(codexTask.status, 'processing');
assert.equal(codexTask.items[0].status, 'codex_processing');
assert.throws(
  () => gallery.submitCodexCommunityDevelopmentResult(
    startedDevelopment.codexTaskId,
    startedDevelopment.jobIds[0],
    '<main>not a complete document</main>',
  ),
  /完整 html/,
);
codexTask = gallery.submitCodexCommunityDevelopmentResult(
  startedDevelopment.codexTaskId,
  startedDevelopment.jobIds[0],
  html('Test App One V2'),
  'Second community version from Codex',
);
assert.equal(codexTask.status, 'completed');
state = gallery.getCommunityGalleryState(hostClient);
assert.equal(state.codexTasks[0].completed_count, 1);
state = gallery.publishCommunityVersion(client(1), testApp.id);
currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(currentTestApp.flow_stage, 'completed');
assert.equal(Number(currentTestApp.current_round_comment_count), 0);
assert.equal(Number(currentTestApp.current_round_synthesis_count), 0);
assert.throws(
  () => gallery.rollbackFirstCommunityVersion(hostClient, testApp.id),
  /尚未发布社区版本 2|只有已经发布社区版本 1/,
  'the destructive rollback is unavailable after V2 has already been published',
);
assert.throws(() => gallery.saveCommunityComment({
  clientId: client(4),
  appId: regularApp.id,
  content: 'Formal flow has not started.',
}), /开始该账号空间/);
state = gallery.startAsyncCommunityStudy(hostClient, false);
assert.equal(state.workspaces.test.status, 'active');
assert.equal(state.workspaces.regular.status, 'active');
assert.equal(state.apps.find((app: any) => app.id === regularApp.id)?.flow_stage, 'round_1');

// A Creator may discard and recreate an unpublished draft after comments open.
state = gallery.saveInitialDraft({
  clientId: client(6),
  title: 'Late Unpublished Draft Six',
  brief: 'Created after the formal comment stage opened',
  prompt: 'Build a late unpublished draft',
  code: html('Late Unpublished Draft Six'),
  summary: 'Late draft only',
});
const lateUnpublishedDraft = state.apps.find((app: any) => app.creator_code === 'C06');
assert.ok(lateUnpublishedDraft);
assert.equal(lateUnpublishedDraft.initial_version_id, null);
state = gallery.deleteOwnInitialApp(client(6), lateUnpublishedDraft.id);
assert.equal(state.apps.some((app: any) => app.id === lateUnpublishedDraft.id), false);
state = gallery.saveInitialDraft({
  clientId: client(6),
  title: 'Recreated Draft Six',
  brief: 'Recreated while comments are open',
  prompt: 'Rebuild the draft from scratch',
  code: html('Recreated Draft Six'),
  summary: 'Recreated draft only',
});
const recreatedDraft = state.apps.find((app: any) => app.creator_code === 'C06');
assert.ok(recreatedDraft);
assert.notEqual(recreatedDraft.id, lateUnpublishedDraft.id);
assert.equal(recreatedDraft.initial_version_id, null);

// A published App with no comments can also be deleted after the workspace has
// started. The deletion is scoped to that App ID: its versions, likes and draft
// disappear, while another Creator's App and the workspace flow stay intact.
const secondRegularInitialVersion = state.versions.find(
  (version: any) => version.app_id === secondRegularApp.id && version.kind === 'initial',
);
assert.ok(secondRegularInitialVersion);
state = gallery.toggleCommunityAppLike(
  client(3),
  secondRegularApp.id,
  Number(secondRegularInitialVersion.id),
);
db.prepare(`
  INSERT OR REPLACE INTO vg_async_drafts
    (study_id, app_id, kind, code, summary, prompt, updated_at)
  VALUES (?, ?, 'project', ?, 'Disposable project draft', 'Delete only this App', ?)
`).run(state.study.id, secondRegularApp.id, html('Disposable C04 draft'), new Date().toISOString());
const regularVersionCountBeforeDelete = Number((db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_versions WHERE study_id = ? AND app_id = ?
`).get(state.study.id, regularApp.id) as { count: number }).count);
state = gallery.deleteOwnInitialApp(client(4), secondRegularApp.id);
assert.equal(state.apps.some((app: any) => app.id === secondRegularApp.id), false);
assert.equal(state.apps.some((app: any) => app.id === regularApp.id), true);
assert.equal(state.workspaces.regular.status, 'active');
assert.equal(state.apps.find((app: any) => app.id === regularApp.id)?.flow_stage, 'round_1');
assert.equal(Number((db.prepare(`SELECT COUNT(*) AS count FROM vg_async_versions WHERE app_id = ?`).get(secondRegularApp.id) as { count: number }).count), 0);
assert.equal(Number((db.prepare(`SELECT COUNT(*) AS count FROM vg_async_version_likes WHERE app_id = ?`).get(secondRegularApp.id) as { count: number }).count), 0);
assert.equal(Number((db.prepare(`SELECT COUNT(*) AS count FROM vg_async_drafts WHERE app_id = ?`).get(secondRegularApp.id) as { count: number }).count), 0);
assert.equal(Number((db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_versions WHERE study_id = ? AND app_id = ?
`).get(state.study.id, regularApp.id) as { count: number }).count), regularVersionCountBeforeDelete);

state = gallery.saveInitialDraft({
  clientId: client(4),
  title: 'Recreated Regular App Four',
  brief: 'Only C04 was reset after deleting its unreviewed App',
  prompt: 'Recreate C04 without changing other Creators',
  code: html('Recreated Regular App Four'),
  summary: 'Replacement draft',
});
const recreatedRegularDraft = state.apps.find((app: any) => app.creator_code === 'C04');
assert.ok(recreatedRegularDraft);
assert.notEqual(recreatedRegularDraft.id, secondRegularApp.id);
assert.equal(recreatedRegularDraft.initial_version_id, null);

// Ordinary comments, replies and syntheses each contribute to a permanent
// deletion guard. Even after their authors delete them, the App cannot be
// removed because community activity has already occurred.
state = gallery.saveCommunityComment({
  clientId: client(4),
  appId: regularApp.id,
  content: 'A regular comment that must preserve the App.',
});
const guardedComment = state.comments.find(
  (comment: any) => comment.content === 'A regular comment that must preserve the App.',
);
assert.ok(guardedComment);
state = gallery.saveCommunityComment({
  clientId: client(5),
  appId: regularApp.id,
  parentCommentId: guardedComment.id,
  content: 'A reply that also blocks App deletion.',
});
const guardedReply = state.comments.find(
  (comment: any) => comment.content === 'A reply that also blocks App deletion.',
);
assert.ok(guardedReply);
state = gallery.createSynthesis({
  clientId: client(5),
  targetAppId: regularApp.id,
  title: 'Deletion guard synthesis',
  content: 'A synthesis that also blocks App deletion.',
  sources: [{ type: 'comment', id: guardedComment.id }],
});
const guardedSynthesis = state.syntheses.find(
  (synthesis: any) => synthesis.title === 'Deletion guard synthesis',
);
assert.ok(guardedSynthesis);
let guardedRegularApp = state.apps.find((app: any) => app.id === regularApp.id);
assert.equal(Number(guardedRegularApp.feedback_comment_count), 1);
assert.equal(Number(guardedRegularApp.feedback_reply_count), 1);
assert.equal(Number(guardedRegularApp.feedback_synthesis_count), 1);
assert.throws(
  () => gallery.deleteOwnInitialApp(client(3), regularApp.id),
  /作品已有评论，不能删除/,
);
gallery.deleteCommunitySynthesis(client(5), guardedSynthesis.id);
gallery.deleteCommunityComment(client(5), guardedReply.id);
state = gallery.deleteCommunityComment(client(4), guardedComment.id);
guardedRegularApp = state.apps.find((app: any) => app.id === regularApp.id);
assert.equal(Number(guardedRegularApp.comment_count), 0);
assert.equal(Number(guardedRegularApp.synthesis_count), 0);
assert.equal(Number(guardedRegularApp.feedback_comment_count), 1);
assert.equal(Number(guardedRegularApp.feedback_reply_count), 1);
assert.equal(Number(guardedRegularApp.feedback_synthesis_count), 1);
assert.throws(
  () => gallery.deleteOwnInitialApp(client(3), regularApp.id),
  /作品已有评论，不能删除/,
);

state = gallery.getCommunityGalleryState(hostClient);
assert.equal(state.testData.testCreatorCount, 2);
assert.equal(state.testData.testAppCount, 2);
assert.ok(state.testData.versionCount >= 2);
assert.equal(state.testData.commentCount, 5);
assert.equal(state.testData.hasTestData, true);

state = gallery.closeAsyncCommunityStudy(hostClient, true);
assert.equal(state.workspaces.test.status, 'closed');
assert.equal(state.workspaces.regular.status, 'active');

const testArchivePayload = gallery.exportCommunityWorkspace(hostClient, true);
assert.equal(testArchivePayload.scope, 'test');
assert.ok(testArchivePayload.apps.some((app: any) => app.id === testApp.id));
assert.equal(testArchivePayload.apps.some((app: any) => app.id === regularApp.id), false);
assert.ok(testArchivePayload.versions.some((version: any) => (
  version.app_id === testApp.id && version.kind === 'initial'
)));
const testArchive = await buildCommunityWorkspaceArchive(
  testArchivePayload,
  '2026-08-08_12-30-45',
);
const testZip = await JSZip.loadAsync(testArchive.buffer);
assert.ok(testZip.file('2026-08-08_12-30-45/research-data.json'));
assert.ok(testZip.file('2026-08-08_12-30-45/apps/C01-Test App One/V0.html'));
assert.ok(testZip.file('2026-08-08_12-30-45/apps/C01-Test App One/V1.html'));
assert.ok(testZip.file('2026-08-08_12-30-45/apps/C01-Test App One/V2.html'));

assert.throws(
  () => gallery.clearCommunityTestData(client(2), '清除测试角色数据'),
  /主持人|身份/,
);
assert.throws(
  () => gallery.clearCommunityTestData(hostClient, '确认'),
  /清除测试角色数据/,
);

state = gallery.clearCommunityTestData(hostClient, '清除测试角色数据');
assert.equal(state.workspaces.test.status, 'setup');
assert.equal(state.workspaces.regular.status, 'active');
assert.equal(state.apps.some((app: any) => app.id === testApp.id), false);
assert.equal(state.apps.some((app: any) => app.id === regularApp.id), true);
assert.equal(state.comments.some((comment: any) => comment.content === 'A test-only comment.'), false);
assert.equal(Number((db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_comments WHERE study_id = ? AND app_id = ?
`).get(state.study.id, regularApp.id) as { count: number }).count), 2);
assert.equal(Number(state.apps.find((app: any) => app.id === regularApp.id)?.feedback_comment_count), 1);
assert.equal(Number(state.apps.find((app: any) => app.id === regularApp.id)?.feedback_reply_count), 1);
assert.equal(state.testData.testAppCount, 0);
assert.equal(state.testData.testSessionCount, 0);

const databaseTestApps = db.prepare(`
  SELECT COUNT(*) AS count FROM vg_async_apps WHERE is_test = 1
`).get() as { count: number };
assert.equal(Number(databaseTestApps.count), 0);

const reloggedTestCreator = gallery.joinCommunityGallery(client(1), '1', '1');
assert.equal(reloggedTestCreator.viewer?.code, 'C01');
assert.equal(Number(reloggedTestCreator.viewer?.isTest), 1);
assert.equal(reloggedTestCreator.apps.length, 0);

state = gallery.closeAsyncCommunityStudy(hostClient, false);
assert.equal(state.workspaces.regular.status, 'closed');
assert.equal(state.workspaces.test.status, 'setup');
const regularArchivePayload = gallery.exportCommunityWorkspace(hostClient, false);
assert.ok(regularArchivePayload.apps.some((app: any) => app.id === regularApp.id));
assert.equal(regularArchivePayload.apps.some((app: any) => app.id === testApp.id), false);
state = gallery.startNewAsyncCommunityWorkspace(hostClient, false);
assert.equal(state.workspaces.regular.status, 'setup');
assert.equal(state.workspaces.test.status, 'setup');
assert.equal(state.apps.some((app: any) => app.id === regularApp.id), false);
assert.equal(state.apps.some((app: any) => app.id === testApp.id), false);
assert.equal(state.comments.some((comment: any) => comment.content === 'A regular comment that must remain.'), false);
assert.equal(state.participants.filter((participant: any) => participant.role === 'creator').length, 50);

console.log('community gallery auth, isolation, archive, independent reset, flow control, retry, and purge tests passed');
