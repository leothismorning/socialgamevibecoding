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
  INSERT INTO gallery_sessions (study_id, client_id, role, code, joined_at, last_seen_at)
  VALUES ('gallery_v2_main', 'legacy-contributor-tab', 'contributor', 'P01', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

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

  CREATE TABLE app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT INTO app_meta (key, value) VALUES ('ai_provider', 'deepseek');
`);
legacyDb.close();

const gallery = await import('../server/galleryDb.js');
const {
  inspectAgentArtifacts,
  inspectAgentInteractionStyles,
  repairAgentInteractionClassNames,
  removePlatformOwnedAgentToast,
} = await import('../server/developmentAgent.js');
const { db, getAIProvider } = await import('../server/studyDb.js');

assert.equal(getAIProvider(), 'gpt5', 'the former DeepSeek default should migrate to GPT-5.5');
assert.equal(
  (db.prepare(`SELECT value FROM app_meta WHERE key = 'ai_provider_default_gpt55_v1'`).get() as { value: string }).value,
  '1',
  'the GPT-5.5 default migration should only run once',
);

assert.deepEqual(
  inspectAgentArtifacts('<main class="content-section"></main>', '.content-section { display: block; }').utilityClasses,
  [],
  'semantic content-* class names must not be mistaken for Tailwind utilities',
);
assert.deepEqual(
  inspectAgentArtifacts('<main class="content-none hover:bg-blue-500"></main>', '').utilityClasses,
  ['content-none', 'hover:bg-blue-500'],
  'actual Tailwind content and variant utilities should still be detected',
);
assert.deepEqual(
  inspectAgentArtifacts(
    '<main class="left-wall right-wall object-core object-glow relative-stage flex-layout"></main>',
    '',
  ).utilityClasses,
  [],
  'ordinary semantic class names must not be rejected because of broad utility prefixes',
);
assert.deepEqual(
  inspectAgentArtifacts('<main class="p-4 md:grid w-1/2 left-[10px]"></main>', '').utilityClasses,
  ['p-4', 'md:grid', 'w-1/2', 'left-[10px]'],
  'high-confidence utility syntax should still trigger the self-contained CSS repair',
);
const mismatchedInteractionJs = `
  card.classList.add('is-selected');
  card.classList.toggle("is-correct", true);
  card.classList.add('is-wrong');
`;
const unprefixedInteractionCss = `
  .card.selected { outline: 3px solid blue; }
  .card.correct { background: green; }
  .card.wrong { background: red; }
`;
assert.deepEqual(
  inspectAgentInteractionStyles(mismatchedInteractionJs, unprefixedInteractionCss).missingStateClasses,
  ['is-selected', 'is-correct', 'is-wrong'],
  'runtime classes that do not exactly match CSS selectors must be detected before the integration gate',
);
const repairedInteraction = repairAgentInteractionClassNames(
  mismatchedInteractionJs,
  unprefixedInteractionCss,
);
assert.deepEqual(
  repairedInteraction.replacements,
  [
    { from: 'is-selected', to: 'selected' },
    { from: 'is-correct', to: 'correct' },
    { from: 'is-wrong', to: 'wrong' },
  ],
);
assert.deepEqual(repairedInteraction.inspection.missingStateClasses, []);
assert.match(repairedInteraction.js, /classList\.add\('selected'\)/);
assert.match(repairedInteraction.js, /classList\.toggle\(\"correct\", true\)/);
assert.equal(
  removePlatformOwnedAgentToast(`
    <main id="prototype"><button>开始</button></main>
    <div id="agentToast" class="agent-toast" aria-live="polite"><span>旧提示</span></div>
  `),
  '<main id="prototype"><button>开始</button></main>',
  'the platform-owned agent toast must be removed before the final document appends its single canonical toast',
);

const migratedSessionsSchema = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'gallery_sessions'
`).get() as { sql: string };
assert.doesNotMatch(migratedSessionsSchema.sql, /UNIQUE\s*\(\s*study_id\s*,\s*code\s*\)/i);
const migratedLegacyContributor = gallery.getGalleryState('legacy-contributor-tab');
assert.equal(migratedLegacyContributor.viewer?.role, 'creator');
assert.equal(migratedLegacyContributor.viewer?.code, 'C04');
assert.equal(
  (db.prepare(`SELECT value FROM gallery_settings WHERE key = 'unified_creator_roles_v1'`).get() as { value: string }).value,
  '1',
);
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
assert.equal(hostState.creatorCount, 23);
const secondHostState = gallery.joinGallery('second-host-tab', 'host', 'H01');
assert.equal(secondHostState.viewer?.code, 'H01');
assert.equal(secondHostState.sessions.filter((session: any) => session.code === 'H01').length, 2);
expectError(() => gallery.joinGallery('invalid-creator-tab', 'creator', 'C24'), /valid creator identity/i);
[2, 0, 1].forEach((index) => {
  const clientId = creatorClients[index];
  const state = gallery.joinGallery(clientId, 'creator', `C0${index + 1}`);
  assert.equal(state.viewer?.code, `C0${index + 1}`);
});

const creatorFour = gallery.joinGallery('creator-tab-4', 'creator', 'C04');
const creatorFive = gallery.joinGallery('creator-tab-5', 'creator', 'C05');
const duplicateCreator = gallery.joinGallery('duplicate-creator-tab', 'creator', 'C05');
const legacyApiCreator = gallery.joinGallery('legacy-api-tab', 'contributor', 'P03');
assert.equal(creatorFour.viewer?.code, 'C04');
assert.equal(creatorFive.viewer?.code, 'C05');
assert.equal(duplicateCreator.viewer?.code, 'C05');
assert.equal(duplicateCreator.sessions.filter((session: any) => session.code === 'C05').length, 2);
assert.equal(legacyApiCreator.viewer?.role, 'creator');
assert.equal(legacyApiCreator.viewer?.code, 'C06');

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

const firstPublishedApp = (gallery.getGalleryState('creator-tab-4').apps as any[])
  .find((app: any) => app.creator_code === 'C01');
let state = gallery.toggleGalleryAppLike('creator-tab-4', firstPublishedApp.id, 'showcase');
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
  state = gallery.getGalleryState('creator-tab-4');
  const apps = state.apps.filter((app: any) => app.status === 'published');
  assert.equal(apps.length, 3);

  for (const app of apps) {
    gallery.saveGalleryComment('creator-tab-4', app.id, `C04 improvement for App ${app.creator_code}, round ${roundNumber}`);
    const afterSecond = gallery.saveGalleryComment(
      'creator-tab-5',
      app.id,
      `C05 alternative for App ${app.creator_code}, round ${roundNumber}`,
    );
    const p1Comment = afterSecond.comments.find(
      (comment: any) => comment.app_id === app.id
        && comment.round_number === roundNumber
        && comment.author_code === 'C04',
    );
    assert.ok(p1Comment);
    gallery.toggleGalleryCommentLike('creator-tab-5', p1Comment.id);
    expectError(() => gallery.toggleGalleryCommentLike('creator-tab-4', p1Comment.id), /own comment/i);
    const afterReply = gallery.saveGalleryComment(
      'creator-tab-5',
      app.id,
      `C05 expansion of C04 for App ${app.creator_code}, round ${roundNumber}`,
      p1Comment.id,
    );
    const reply = afterReply.comments.find(
      (candidate: any) => Number(candidate.parent_comment_id) === Number(p1Comment.id)
        && candidate.author_code === 'C05',
    );
    assert.ok(reply);
    gallery.toggleGalleryCommentLike('creator-tab-4', reply.id);
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
  let processing = gallery.getGalleryState('creator-tab-4');
  const lotteries = processing.lotteries.filter((item: any) => item.round_number === roundNumber);
  assert.equal(lotteries.length, 3);
  assert.ok(lotteries.every((item: any) => item.selected_author === 'C05'));
  assert.ok(lotteries.every((item: any) => item.selected_parent_author === 'C04'));
  assert.ok(lotteries.every((item: any) => /C04 improvement/.test(item.selected_parent_comment)));
  assert.ok(lotteries.every((item: any) => item.total_weight === 5));

  if (roundNumber === 1) {
    const cancellableJob = db.prepare(`
      SELECT id FROM gallery_generation_jobs
      WHERE round_number = ? AND status = 'pending'
      ORDER BY id
      LIMIT 1
    `).get(roundNumber) as { id: number };
    expectError(
      () => gallery.cancelGalleryGenerationJob('creator-tab-4', cancellableJob.id),
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
  assert.match(String(job?.selected_parent_comment || ''), /C04 improvement/);
  assert.match(String(job?.selected_comment || ''), /C05 expansion/);
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
    const liveEvent = gallery.getGalleryState('creator-tab-4').generationEvents.find(
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
    'creator-tab-4',
    firstApp.id,
    `C04 early comment for round ${nextRound}`,
  );
  assert.ok(earlyState.comments.some(
    (comment: any) => comment.app_id === firstApp.id && comment.round_number === nextRound,
  ));
  expectError(
    () => gallery.saveGalleryComment('creator-tab-4', secondApp.id, 'This App is still locked'),
    /not open/i,
  );
  expectError(() => gallery.startNextGalleryRound(hostClient), /every published App/i);
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

state = gallery.getGalleryState('creator-tab-4');
assert.ok(state.apps.every((app: any) => app.initial_version_id && app.final_version_id));
assert.ok(state.apps.every((app: any) => app.initial_version_id !== app.final_version_id));

for (const app of state.apps) gallery.toggleGalleryAppLike('creator-tab-4', app.id, 'final');
expectError(
  () => gallery.toggleGalleryAppLike(creatorClients[0], state.apps[0].id, 'final'),
  /own App/i,
);

state = gallery.endGalleryProject(hostClient);
assert.equal(state.study.status, 'ended');
assert.ok(state.apps.every((app: any) => Number(app.final_like_count) === 1));
const endedStudyId = String(state.study.id);
expectError(
  () => gallery.saveGalleryComment('creator-tab-4', state.apps[0].id, 'Too late'),
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
assert.equal(gallery.getGalleryState('creator-tab-4').viewer, null);
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
expectError(() => gallery.startFormalGalleryGame(hostClient), /at least one Creator/i);
gallery.saveCreatorDraft({
  clientId: 'next-creator-tab',
  title: 'Single App Experiment',
  brief: 'One published App is enough to begin.',
  creatorPrompt: 'Build a single App.',
  code: html('Single App Experiment'),
  summary: 'Initial version',
});
gallery.publishCreatorApp('next-creator-tab');
const singleAppRound = gallery.startFormalGalleryGame(hostClient);
assert.equal(singleAppRound.study.status, 'round_active');
assert.equal(singleAppRound.apps.filter((app: any) => app.status === 'published').length, 1);

console.log('Gallery mechanics test passed: unified Creator identities, legacy Contributor migration, one-App start, persistent public AI progress, one-level expansion comments, parent+reply lottery prompts, per-App early comment openings, 15/10-minute rounds, archived experiments, Host controls, weighted lotteries, AI versions, and final votes.');
db.close();
