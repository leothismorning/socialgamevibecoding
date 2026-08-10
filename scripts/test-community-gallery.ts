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
assert.equal(hostState.aiProvider, 'gpt5');
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

state = gallery.saveCommunityComment({
  clientId: client(2),
  appId: testApp.id,
  content: 'A test-only comment.',
});
const firstRoundComment = state.comments.find((comment: any) => comment.content === 'A test-only comment.');
assert.ok(firstRoundComment);
state = gallery.createSynthesis({
  clientId: client(2),
  targetAppId: testApp.id,
  title: 'First round synthesis',
  content: 'A first-round combined direction.',
  sources: [{ type: 'comment', id: firstRoundComment.id }],
});
let currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(Number(currentTestApp.current_round_comment_count), 1);
assert.equal(Number(currentTestApp.current_round_synthesis_count), 1);
let startedDevelopment = gallery.enterCommunityDevelopmentStage(hostClient, 1, true, [testApp.id]);
assert.equal(startedDevelopment.jobIds.length, 1);
state = gallery.toggleCommunityAppLike(client(2), testApp.id, Number(testInitialVersion.id));
likedTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(Number(likedTestApp.like_count), 1);
assert.equal(Number(likedTestApp.viewer_liked), 1);
gallery.failCommunityGeneration(startedDevelopment.jobIds[0], new Error('simulated generation failure'));
let restartedDevelopment = gallery.retryLatestCommunityGenerations(hostClient, [testApp.id]);
assert.equal(restartedDevelopment.jobIds.length, 1);
gallery.failCommunityGeneration(restartedDevelopment.jobIds[0], new Error('simulated retry failure'));
state = gallery.controlCommunityAppFlows(hostClient, [testApp.id], 'rollback');
assert.equal(state.apps.find((app: any) => app.id === testApp.id)?.flow_stage, 'round_1');
startedDevelopment = gallery.enterCommunityDevelopmentStage(hostClient, 1, true, [testApp.id]);
gallery.completeCommunityGeneration(startedDevelopment.jobIds[0], html('Test App One V1'), 'First community version');
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
startedDevelopment = gallery.enterCommunityDevelopmentStage(hostClient, 2, true, [testApp.id]);
gallery.completeCommunityGeneration(startedDevelopment.jobIds[0], html('Test App One V2'), 'Second community version');
state = gallery.publishCommunityVersion(client(1), testApp.id);
currentTestApp = state.apps.find((app: any) => app.id === testApp.id);
assert.equal(currentTestApp.flow_stage, 'completed');
assert.equal(Number(currentTestApp.current_round_comment_count), 0);
assert.equal(Number(currentTestApp.current_round_synthesis_count), 0);
assert.throws(() => gallery.saveCommunityComment({
  clientId: client(4),
  appId: regularApp.id,
  content: 'Formal flow has not started.',
}), /开始该账号空间/);
state = gallery.startAsyncCommunityStudy(hostClient, false);
assert.equal(state.workspaces.test.status, 'active');
assert.equal(state.workspaces.regular.status, 'active');
assert.equal(state.apps.find((app: any) => app.id === regularApp.id)?.flow_stage, 'round_1');
assert.throws(
  () => gallery.deleteOwnInitialApp(client(3), regularApp.id),
  /评论流程开始后/,
);
gallery.saveCommunityComment({
  clientId: client(4),
  appId: regularApp.id,
  content: 'A regular comment that must remain.',
});

state = gallery.getCommunityGalleryState(hostClient);
assert.equal(state.testData.testCreatorCount, 2);
assert.equal(state.testData.testAppCount, 2);
assert.ok(state.testData.versionCount >= 2);
assert.equal(state.testData.commentCount, 2);
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
assert.equal(state.comments.some((comment: any) => comment.content === 'A regular comment that must remain.'), true);
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
