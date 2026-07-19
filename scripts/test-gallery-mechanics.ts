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
const hostClient = 'host-tab';
const hostState = gallery.joinGallery(hostClient, 'host');
assert.equal(hostState.viewer?.code, 'H01');
assert.equal(hostState.viewer?.role, 'host');
expectError(() => gallery.joinGallery('second-host-tab', 'host'), /Host seat is already occupied/i);
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
const firstPublishedApp = (contributorOne.apps as any[]).find((app: any) => app.creator_code === 'C01');
let state = gallery.toggleGalleryAppLike('contributor-tab-1', firstPublishedApp.id, 'showcase');
assert.equal((state.apps as any[]).find((app: any) => app.id === firstPublishedApp.id)?.viewer_showcase_liked, 1);
expectError(
  () => gallery.toggleGalleryAppLike(creatorClients[0], firstPublishedApp.id, 'showcase'),
  /own App/i,
);
expectError(
  () => gallery.toggleGalleryAppLike(hostClient, firstPublishedApp.id, 'showcase'),
  /Host only controls/i,
);

expectError(() => gallery.startFormalGalleryGame(creatorClients[0]), /requires the host role/i);
state = gallery.startFormalGalleryGame(hostClient);
assert.equal(state.study.status, 'round_active');
assert.equal(state.study.current_round, 1);
expectError(() => gallery.startNextGalleryRound(creatorClients[1]), /requires the host role/i);
expectError(
  () => gallery.saveGalleryComment(hostClient, firstPublishedApp.id, 'Host should not participate'),
  /Host only controls/i,
);

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

  if (roundNumber === 1) {
    expectError(
      () => gallery.endGalleryRoundEarly(creatorClients[1], () => 0),
      /requires the host role/i,
    );
    const endedEarly = gallery.endGalleryRoundEarly(hostClient, () => 0);
    assert.equal(endedEarly.study.status, 'round_processing');
  } else {
    assert.equal(gallery.lockExpiredGalleryRound(() => 0, true), true);
  }
  let processing = gallery.getGalleryState('contributor-tab-1');
  const lotteries = processing.lotteries.filter((item: any) => item.round_number === roundNumber);
  assert.equal(lotteries.length, 3);
  assert.ok(lotteries.every((item: any) => item.selected_author === 'P01'));
  assert.ok(lotteries.every((item: any) => item.total_weight === 3));

  if (roundNumber === 1) {
    const cancellableJob = db.prepare(`
      SELECT id FROM gallery_generation_jobs
      WHERE round_number = ? AND status = 'pending'
      ORDER BY id
      LIMIT 1
    `).get(roundNumber) as { id: number };
    expectError(
      () => gallery.cancelGalleryGenerationJob('contributor-tab-1', cancellableJob.id),
      /requires the host role/i,
    );
    expectError(
      () => gallery.cancelGalleryGenerationJob(creatorClients[1], cancellableJob.id),
      /requires the host role/i,
    );
    const afterCancel = gallery.cancelGalleryGenerationJob(hostClient, cancellableJob.id);
    const cancelledJob = (afterCancel.generationJobs as any[])
      .find((item: any) => Number(item.id) === Number(cancellableJob.id));
    assert.equal(
      cancelledJob?.status,
      'cancelled',
    );
    db.prepare(`
      UPDATE gallery_generation_jobs
      SET status = 'pending', error = NULL, completed_at = NULL
      WHERE id = ?
    `).run(cancellableJob.id);
  }

  let job = gallery.nextGalleryGenerationJob();
  if (roundNumber === 1 && job) {
    const retryJobId = Number(job.id);
    gallery.failGalleryGenerationJob(retryJobId, new Error('Simulated first-attempt network failure.'));
    job = gallery.nextGalleryGenerationJob(retryJobId);
    assert.equal(Number(job.id), retryJobId);
    assert.equal(Number(job.attempts), 2);
  }
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
const roundOneJob = db.prepare(`
  SELECT id FROM gallery_generation_jobs
  WHERE round_number = 1 AND selected_comment_id IS NOT NULL
  ORDER BY id
  LIMIT 1
`).get() as { id: number };
expectError(
  () => gallery.redevelopGalleryGenerationJob(creatorClients[1], roundOneJob.id),
  /requires the host role/i,
);
state = gallery.redevelopGalleryGenerationJob(hostClient, roundOneJob.id);
assert.equal(state.study.status, 'round_processing');
const redevelopJob = gallery.nextGalleryGenerationJob();
assert.equal(Number(redevelopJob.id), Number(roundOneJob.id));
assert.match(String(redevelopJob.current_code), /initial/);
assert.doesNotMatch(String(redevelopJob.current_code), /round-1/);
db.prepare(`
  UPDATE gallery_generation_jobs
  SET status = 'completed', completed_at = CURRENT_TIMESTAMP
  WHERE id = ?
`).run(roundOneJob.id);
assert.equal(gallery.finalizeGalleryRoundIfReady(), true);
assert.equal(gallery.getGalleryState(hostClient).study.status, 'round_review');

gallery.startNextGalleryRound(hostClient);
playRound(2);
gallery.startNextGalleryRound(hostClient);
playRound(3);

state = gallery.getGalleryState('contributor-tab-1');
assert.ok(state.apps.every((app: any) => app.initial_version_id && app.final_version_id));
assert.ok(state.apps.every((app: any) => app.initial_version_id !== app.final_version_id));

for (const app of state.apps) gallery.toggleGalleryAppLike('contributor-tab-1', app.id, 'final');
expectError(
  () => gallery.toggleGalleryAppLike(creatorClients[0], state.apps[0].id, 'final'),
  /own App/i,
);

state = gallery.endGalleryProject(hostClient);
assert.equal(state.study.status, 'ended');
assert.ok(state.apps.every((app: any) => Number(app.final_like_count) === 1));
const endedStudyId = String(state.study.id);
expectError(
  () => gallery.saveGalleryComment('contributor-tab-1', state.apps[0].id, 'Too late'),
  /active round/i,
);

const archivedAppCount = Number(
  (db.prepare(`SELECT COUNT(*) AS count FROM gallery_apps WHERE study_id = ?`).get(endedStudyId) as any).count,
);
const nextExperiment = gallery.startNewGalleryExperiment(hostClient);
assert.notEqual(nextExperiment.study.id, endedStudyId);
assert.equal(nextExperiment.study.status, 'preparing');
assert.equal(nextExperiment.study.current_round, 0);
assert.equal(nextExperiment.viewer?.role, 'host');
assert.equal(nextExperiment.viewer?.code, 'H01');
assert.equal(nextExperiment.apps.length, 0);
assert.equal(nextExperiment.sessions.length, 1);
assert.equal(gallery.getGalleryState('contributor-tab-1').viewer, null);
assert.equal(
  (db.prepare(`SELECT status FROM gallery_studies WHERE id = ?`).get(endedStudyId) as any).status,
  'ended',
);
assert.equal(
  Number((db.prepare(`SELECT COUNT(*) AS count FROM gallery_apps WHERE study_id = ?`).get(endedStudyId) as any).count),
  archivedAppCount,
);
assert.equal(
  (db.prepare(`SELECT value FROM gallery_settings WHERE key = 'active_study_id'`).get() as any).value,
  nextExperiment.study.id,
);
const nextCreator = gallery.joinGallery('next-creator-tab', 'creator');
assert.equal(nextCreator.viewer?.code, 'C01');

console.log('Gallery mechanics test passed: independent Host role, archived experiment rollover, direct gallery likes, early round end, independent per-App retries, stop/redevelop controls, 3 weighted-lottery rounds, AI-version slots, multi-like final vote.');
db.close();
