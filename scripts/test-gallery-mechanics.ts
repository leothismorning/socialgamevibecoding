import assert from 'node:assert/strict';
import path from 'node:path';

process.env.STUDY_DB_PATH = path.join(process.cwd(), 'data', `gallery-mechanics-test-${Date.now()}.db`);
process.env.GALLERY_ROUND_DURATION_MS = '1000';

const gallery = await import('../server/galleryDb.js');
const { db } = await import('../server/studyDb.js');

const html = (title: string, version = 'initial') => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head>
<body><main><h1>${title}</h1><p>${version}</p></main></body></html>`;

function expectError(task: () => unknown, pattern: RegExp) {
  assert.throws(task, pattern);
}

const creatorClients = ['creator-tab-1', 'creator-tab-2', 'creator-tab-3'];
creatorClients.forEach((clientId, index) => {
  const state = gallery.joinGallery(clientId, 'creator');
  assert.equal(state.viewer?.code, `C0${index + 1}`);
});

expectError(() => gallery.joinGallery('contributor-too-early', 'contributor'), /after all three Creators/i);

creatorClients.forEach((clientId, index) => {
  gallery.saveCreatorDraft({
    clientId,
    title: `Test App ${index + 1}`,
    brief: `Brief ${index + 1}`,
    creatorPrompt: `Build App ${index + 1}`,
    code: html(`Test App ${index + 1}`),
    summary: 'Initial version',
  });
  gallery.publishCreatorApp(clientId);
});

const contributorOne = gallery.joinGallery('contributor-tab-1', 'contributor');
const contributorTwo = gallery.joinGallery('contributor-tab-2', 'contributor');
assert.equal(contributorOne.viewer?.code, 'P01');
assert.equal(contributorTwo.viewer?.code, 'P02');

let state = gallery.startFormalGalleryGame(creatorClients[0]);
assert.equal(state.study.status, 'round_active');
assert.equal(state.study.current_round, 1);
expectError(() => gallery.startNextGalleryRound(creatorClients[1]), /Only Creator 1/i);

function playRound(roundNumber: number) {
  state = gallery.getGalleryState('contributor-tab-1');
  const apps = state.apps.filter((app: any) => app.status === 'published');
  assert.equal(apps.length, 3);

  for (const app of apps) {
    gallery.saveGalleryComment('contributor-tab-1', app.id, `P01 improvement for App ${app.creator_code}, round ${roundNumber}`);
    const afterSecond = gallery.saveGalleryComment(
      'contributor-tab-2',
      app.id,
      `P02 alternative for App ${app.creator_code}, round ${roundNumber}`,
    );
    const p1Comment = afterSecond.comments.find(
      (comment: any) => comment.app_id === app.id
        && comment.round_number === roundNumber
        && comment.author_code === 'P01',
    );
    assert.ok(p1Comment);
    gallery.toggleGalleryCommentLike('contributor-tab-2', p1Comment.id);
    expectError(() => gallery.toggleGalleryCommentLike('contributor-tab-1', p1Comment.id), /own comment/i);
  }

  assert.equal(gallery.lockExpiredGalleryRound(() => 0, true), true);
  let processing = gallery.getGalleryState('contributor-tab-1');
  const lotteries = processing.lotteries.filter((item: any) => item.round_number === roundNumber);
  assert.equal(lotteries.length, 3);
  assert.ok(lotteries.every((item: any) => item.selected_author === 'P01'));
  assert.ok(lotteries.every((item: any) => item.total_weight === 3));

  let job = gallery.nextGalleryGenerationJob();
  let completed = 0;
  while (job) {
    gallery.completeGalleryGenerationJob(
      Number(job.id),
      html(String(job.app_title), `round-${roundNumber}`),
      `Applied selected comment in round ${roundNumber}.`,
    );
    completed += 1;
    job = gallery.nextGalleryGenerationJob();
  }
  assert.equal(completed, 3);
  gallery.finalizeGalleryRoundIfReady();
  processing = gallery.getGalleryState(creatorClients[0]);
  assert.equal(processing.study.status, roundNumber === 3 ? 'final_voting' : 'round_review');
  assert.ok(processing.apps.every((app: any) => Number(app.current_version_number) === roundNumber));
}

playRound(1);
gallery.startNextGalleryRound(creatorClients[0]);
playRound(2);
gallery.startNextGalleryRound(creatorClients[0]);
playRound(3);

state = gallery.getGalleryState('contributor-tab-1');
assert.ok(state.apps.every((app: any) => app.initial_version_id && app.final_version_id));
assert.ok(state.apps.every((app: any) => app.initial_version_id !== app.final_version_id));

for (const app of state.apps) gallery.toggleGalleryAppLike('contributor-tab-1', app.id, 'final');
expectError(
  () => gallery.toggleGalleryAppLike(creatorClients[0], state.apps[0].id, 'final'),
  /own App/i,
);

state = gallery.endGalleryProject(creatorClients[0]);
assert.equal(state.study.status, 'ended');
assert.ok(state.apps.every((app: any) => Number(app.final_like_count) === 1));
expectError(
  () => gallery.saveGalleryComment('contributor-tab-1', state.apps[0].id, 'Too late'),
  /active round/i,
);

console.log('Gallery mechanics test passed: 3 creators, 3 apps, 3 weighted-lottery rounds, AI-version slots, multi-like final vote.');
db.close();
