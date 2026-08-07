import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-gallery-async-'));
process.env.STUDY_DB_PATH = path.join(testDir, 'study.db');

const gallery = await import('../server/communityGalleryDb.js');
const { db } = await import('../server/studyDb.js');
const html = (title: string) => `<!doctype html><html><body><main><h1>${title}</h1></main></body></html>`;
const client = (account: number) => `client-${account}`;

assert.throws(() => gallery.joinCommunityGallery('bad-password', '1', '2'), /账号或密码错误/);
assert.throws(() => gallery.joinCommunityGallery('bad-account', '31', '31'), /账号或密码错误/);
assert.throws(() => gallery.joinCommunityGallery('padded-account', '01', '01'), /账号或密码错误/);

const hostClient = client(0);
let state = gallery.joinCommunityGallery(hostClient, '0', '0');
assert.equal(state.viewer?.role, 'host');
assert.equal(state.viewer?.code, 'H01');

state = gallery.setCommunityTestCreators(hostClient, ['C01', 'C02']);
assert.equal(state.study.test_roles_configured, true);
assert.equal((state.participants as any[]).find((participant) => participant.code === 'C01')?.is_test, 1);
assert.equal((state.participants as any[]).find((participant) => participant.code === 'C03')?.is_test, 0);

assert.throws(
  () => gallery.setCommunityTestCreators('not-host', ['C01']),
  /先选择|身份/,
);

for (const account of [1, 2, 3, 4]) {
  const creatorState = gallery.joinCommunityGallery(client(account), String(account), String(account));
  assert.equal(creatorState.viewer?.code, `C${String(account).padStart(2, '0')}`);
  assert.equal(Number(creatorState.viewer?.isTest), account <= 2 ? 1 : 0);
}

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

const hostState = gallery.getCommunityGalleryState(hostClient);
const testApp = hostState.apps.find((app: any) => app.creator_code === 'C01');
const regularApp = hostState.apps.find((app: any) => app.creator_code === 'C03');
assert.ok(testApp);
assert.ok(regularApp);
assert.equal(Number(testApp.is_test), 1);
assert.equal(Number(regularApp.is_test), 0);

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

state = gallery.startAsyncCommunityStudy(hostClient);
assert.equal(state.study.status, 'active');
assert.throws(
  () => gallery.setCommunityTestCreators(hostClient, ['C01']),
  /开始前/,
);

gallery.saveCommunityComment({
  clientId: client(2),
  appId: testApp.id,
  content: 'A test-only comment.',
});
gallery.saveCommunityComment({
  clientId: client(4),
  appId: regularApp.id,
  content: 'A regular comment that must remain.',
});

state = gallery.getCommunityGalleryState(hostClient);
assert.equal(state.testData.testCreatorCount, 2);
assert.equal(state.testData.testAppCount, 2);
assert.ok(state.testData.versionCount >= 2);
assert.equal(state.testData.commentCount, 1);
assert.equal(state.testData.hasTestData, true);

assert.throws(
  () => gallery.clearCommunityTestData(client(2), '清除测试角色数据'),
  /主持人|身份/,
);
assert.throws(
  () => gallery.clearCommunityTestData(hostClient, '确认'),
  /清除测试角色数据/,
);

state = gallery.clearCommunityTestData(hostClient, '清除测试角色数据');
assert.equal(state.study.status, 'setup');
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

console.log('community gallery auth, isolation, and test-data purge tests passed');
