import assert from 'node:assert/strict';
import path from 'node:path';
import Database from 'better-sqlite3';

const testDbPath = path.join(process.cwd(), 'data', `gallery-mechanics-test-${Date.now()}.db`);
process.env.STUDY_DB_PATH = testDbPath;
process.env.GALLERY_ROUND_DURATION_MS = '1000';

const legacyDb = new Database(testDbPath);
legacyDb.exec(`
  CREATE TABLE gallery_sessions (
    study_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    role TEXT NOT NULL,
    code TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (study_id, client_id),
    UNIQUE (study_id, code)
  );
  INSERT INTO gallery_sessions (study_id, client_id, role, code, joined_at, last_seen_at)
  VALUES ('gallery_v2_main', 'legacy-creator-tab', 'creator', 'C01', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

  CREATE TABLE gallery_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    author_code TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE (study_id, app_id, round_number, author_code)
  );
`);
legacyDb.close();

const gallery = await import('../server/galleryDb.js');
const { db } = await import('../server/studyDb.js');

const migratedSessionsSchema = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'gallery_sessions'
`).get() as { sql: string };
assert.doesNotMatch(migratedSessionsSchema.sql, /UNIQUE\s*\(\s*study_id\s*,\s*code\s*\)/i);
const migratedCommentColumns = db.prepare(`PRAGMA table_info(gallery_comments)`).all() as Array<{ name: string }>;
assert.ok(migratedCommentColumns.some((column) => column.name === 'parent_comment_id'));
const testDurationOverride = process.env.GALLERY_ROUND_DURATION_MS;
delete process.env.GALLERY_ROUND_DURATION_MS;
assert.equal(gallery.galleryRoundDurationSeconds(1), 15 * 60);
assert.equal(gallery.galleryRoundDurationSeconds(2), 10 * 60);
assert.equal(gallery.galleryRoundDurationSeconds(3), 10 * 60);
process.env.GALLERY_ROUND_DURATION_MS = testDurationOverride;

const html = (title: string, version = 'initial') => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head>
<body><main><h1>${title}</h1><p>${version}</p></main></body></html>`;

function expectError(task: () => unknown, pattern: RegExp) {
  assert.throws(task, pattern);
}

const creatorClients = ['creator-tab-1', 'creator-tab-2', 'creator-tab-3'];
const hostClient = 'host-tab';
const hostState = gallery.joinGallery(hostClient, 'host', 'H01');
assert.equal(hostState.viewer?.code, 'H01');
assert.equal(hostState.viewer?.role, 'host');
const secondHostState = gallery.joinGallery('second-host-tab', 'host', 'H01');
assert.equal(secondHostState.viewer?.code, 'H01');
assert.equal(secondHostState.sessions.filter((session: any) => session.code === 'H01').length, 2);
expectError(() => gallery.joinGallery('invalid-creator-tab', 'creator', 'P01'), /valid creator identity/i);
[2, 0, 1].forEach((index) => {
  const clientId = creatorClients[index];
  const state = gallery.joinGallery(clientId, 'creator', `C0${index + 1}`);
  assert.equal(state.viewer?.code, `C0${index + 1}`);
});

expectError(() => gallery.joinGallery('contributor-too-early', 'contributor', 'P01'), /after all three Creators/i);

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

const contributorOne = gallery.joinGallery('contributor-tab-1', 'contributor', 'P01');
const contributorTwo = gallery.joinGallery('contributor-tab-2', 'contributor', 'P02');
const duplicateContributor = gallery.joinGallery('duplicate-contributor-tab', 'contributor', 'P02');
assert.equal(contributorOne.viewer?.code, 'P01');
assert.equal(contributorTwo.viewer?.code, 'P02');
assert.equal(duplicateContributor.viewer?.code, 'P02');
assert.equal(duplicateContributor.sessions.filter((session: any) => session.code === 'P02').length, 2);
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
    const afterReply = gallery.saveGalleryComment(
      'contributor-tab-2',
      app.id,
      `P02 expansion of P01 for App ${app.creator_code}, round ${roundNumber}`,
      p1Comment.id,
    );
    const reply = afterReply.comments.find(
      (candidate: any) => Number(candidate.parent_comment_id) === Number(p1Comment.id)
        && candidate.author_code === 'P02',
    );
    assert.ok(reply);
    gallery.toggleGalleryCommentLike('contributor-tab-1', reply.id);
  }

  if (roundNumber === 1) {
    expectError(
      () => gallery.endGalleryRoundEarly(creatorClients[1], () => 0),
      /requires the host role/i,
    );
    const endedEarly = gallery.endGalleryRoundEarly(hostClient, (max: number) => max - 1);
    assert.equal(endedEarly.study.status, 'round_processing');
  } else {
    assert.equal(gallery.lockExpiredGalleryRound((max: number) => max - 1, true), true);
  }
  let processing = gallery.getGalleryState('contributor-tab-1');
  const lotteries = processing.lotteries.filter((item: any) => item.round_number === roundNumber);
  assert.equal(lotteries.length, 3);
  assert.ok(lotteries.every((item: any) => item.selected_author === 'P02'));
  assert.ok(lotteries.every((item: any) => item.selected_parent_author === 'P01'));
  assert.ok(lotteries.every((item: any) => /P01 improvement/.test(item.selected_parent_comment)));
  assert.ok(lotteries.every((item: any) => item.total_weight === 5));

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
  assert.match(String(job?.selected_parent_comment || ''), /P01 improvement/);
  assert.match(String(job?.selected_comment || ''), /P02 expansion/);
  if (job) {
    gallery.recordGalleryGenerationProgress(Number(job.id), {
      step: 'plan',
      order: 1,
      status: 'running',
      title: 'GPT 正在制定修改计划',
      detail: 'Public progress test.',
    });
    gallery.recordGalleryGenerationProgress(Number(job.id), {
      step: 'plan',
      order: 1,
      status: 'completed',
      title: '修改计划已经完成',
      detail: 'Preserve the existing App and implement the selected comments.',
    });
    const liveEvent = gallery.getGalleryState('contributor-tab-1').generationEvents.find(
      (event: any) => Number(event.job_id) === Number(job.id) && event.step_key === 'plan',
    ) as any;
    assert.equal(liveEvent?.status, 'completed');
    assert.match(String(liveEvent?.detail), /Preserve the existing App/);
  }
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
  assert.ok(processing.generationEvents.some(
    (event: any) => event.round_number === roundNumber && event.step_key === 'complete',
  ));
}

function openAllAppsForNextRound(nextRound: number) {
  const hostState = gallery.getGalleryState(hostClient);
  const apps = hostState.apps.filter((app: any) => app.status === 'published');
  const firstApp = apps[0];
  const secondApp = apps[1];
  gallery.openNextRoundComments(hostClient, firstApp.id);
  const earlyState = gallery.saveGalleryComment(
    'contributor-tab-1',
    firstApp.id,
    `P01 early comment for round ${nextRound}`,
  );
  assert.ok(earlyState.comments.some(
    (comment: any) => comment.app_id === firstApp.id && comment.round_number === nextRound,
  ));
  expectError(
    () => gallery.saveGalleryComment('contributor-tab-1', secondApp.id, 'This App is still locked'),
    /not open/i,
  );
  expectError(() => gallery.startNextGalleryRound(hostClient), /all three Apps/i);
  apps.slice(1).forEach((app: any) => gallery.openNextRoundComments(hostClient, app.id));
  const opened = gallery.getGalleryState(hostClient).roundOpenings.filter(
    (opening: any) => Number(opening.round_number) === nextRound,
  );
  assert.equal(opened.length, 3);
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

openAllAppsForNextRound(2);
gallery.startNextGalleryRound(hostClient);
playRound(2);
openAllAppsForNextRound(3);
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
  /not open/i,
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
const nextCreator = gallery.joinGallery('next-creator-tab', 'creator', 'C01');
assert.equal(nextCreator.viewer?.code, 'C01');

console.log('Gallery mechanics test passed: persistent public AI progress, one-level expansion comments, parent+reply lottery prompts, per-App early comment openings, 15/10-minute rounds, archived experiments, Host controls, weighted lotteries, AI versions, and final votes.');
db.close();
