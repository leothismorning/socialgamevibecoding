import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-gallery-async-'));
process.env.STUDY_DB_PATH = path.join(testDir, 'study.db');

const gallery = await import('../server/communityGalleryDb.js');
const { db } = await import('../server/studyDb.js');
const html = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1></main></body></html>`;

const hostClient = 'host-client';
const creatorClient = (code: string) => `creator-${code}`;

gallery.joinCommunityGallery(hostClient, 'H01');
assert.throws(
  () => gallery.joinCommunityGallery('creator-C31', 'C31'),
  /C01|有效/,
);
let state = gallery.setCommunityStudyConditions(
  hostClient,
  Array.from({ length: 18 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`),
);
assert.equal(state.participants.filter((participant: any) => participant.role === 'creator').length, 30);
assert.equal((state.participants.find((participant: any) => participant.code === 'C18') as any)?.condition_name, 'control');
assert.equal((state.participants.find((participant: any) => participant.code === 'C19') as any)?.condition_name, 'experimental');

const publishInitial = (code: string, title: string) => {
  const clientId = creatorClient(code);
  gallery.joinCommunityGallery(clientId, code);
  gallery.saveInitialDraft({
    clientId,
    title,
    brief: `Initial project by ${code}`,
    prompt: `Build ${title}`,
    code: html(title),
    summary: 'Initial version',
    conversation: { creator: `Build ${title}`, assistant: 'Draft ready.' },
  });
  return gallery.publishInitialVersion(clientId);
};

// C01 is in the control condition; C19 is the single published Vibe Gallery App.
publishInitial('C01', 'Control App');
publishInitial('C19', 'Target App');
gallery.joinCommunityGallery(creatorClient('C20'), 'C20');
gallery.joinCommunityGallery(creatorClient('C21'), 'C21');
const setupTargetApp = gallery.getCommunityGalleryState(hostClient).apps.find(
  (app: any) => app.creator_code === 'C19',
);
assert.ok(setupTargetApp);
assert.throws(() => gallery.saveCommunityComment({
  clientId: creatorClient('C20'),
  appId: setupTargetApp.id,
  content: 'Comments must remain closed until the Host starts the study.',
}), /主持人点击开始/);
state = gallery.startAsyncCommunityStudy(hostClient);
assert.equal(state.study.status, 'active');
assert.equal(state.study.workflow_stage, 'synthesis_1');

const hostState = gallery.getCommunityGalleryState(hostClient);
const targetApp = hostState.apps.find((app: any) => app.creator_code === 'C19');
const controlApp = hostState.apps.find((app: any) => app.creator_code === 'C01');
assert.ok(targetApp && controlApp);

// Publishing an initial version does not open a free-form continuation flow.
assert.throws(
  () => gallery.getCreatorDraftContext(creatorClient('C19')),
  /主持人|开发草稿|下一轮/,
);
assert.throws(
  () => gallery.publishProjectDraft(creatorClient('C19')),
  /不能自行|主持人|下一轮/,
);
assert.throws(
  () => gallery.startCreatorDevelopmentOperation(
    creatorClient('C19'),
    'blocked-project-development',
    'refine',
    'project',
  ),
  /不能自行|主持人|下一轮/,
);

const commentOneState = gallery.saveCommunityComment({
  clientId: creatorClient('C20'),
  appId: targetApp.id,
  content: 'Add a clear contribution trail so every community idea can be recognized.',
});
const commentOne = commentOneState.comments.find((comment: any) => (
  comment.app_id === targetApp.id && comment.author_code === 'C20'
));
assert.ok(commentOne);

const commentTwoState = gallery.saveCommunityComment({
  clientId: creatorClient('C21'),
  appId: targetApp.id,
  content: 'Make the interaction lightweight and show the change immediately in the prototype.',
});
const commentTwo = commentTwoState.comments.find((comment: any) => (
  comment.app_id === targetApp.id && comment.author_code === 'C21'
));
assert.ok(commentTwo);

assert.throws(() => gallery.saveCommunityComment({
  clientId: creatorClient('C19'),
  appId: targetApp.id,
  content: 'The creator must not comment on their own app.',
}), /自己的应用/);

const firstSynthesisState = gallery.createSynthesis({
  clientId: creatorClient('C21'),
  targetAppId: targetApp.id,
  title: 'Traceable lightweight interaction',
  content: 'Combine the visible contribution trail with an immediate, lightweight interaction.',
  sources: [
    { type: 'comment', id: Number(commentOne.id) },
    { type: 'comment', id: Number(commentTwo.id) },
  ],
});
const firstSynthesis = firstSynthesisState.syntheses.find((synthesis: any) => (
  synthesis.title === 'Traceable lightweight interaction'
));
assert.ok(firstSynthesis);

// Host can rebalance Creator groups even after the study has started and ideas exist.
state = gallery.setCommunityStudyConditions(hostClient, [
  ...Array.from({ length: 17 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`),
  'C30',
]);
assert.equal((state.participants.find((participant: any) => participant.code === 'C18') as any)?.condition_name, 'experimental');
assert.equal((state.participants.find((participant: any) => participant.code === 'C17') as any)?.condition_name, 'control');
assert.equal((state.participants.find((participant: any) => participant.code === 'C30') as any)?.condition_name, 'control');

// Creators cannot create a synthesis on their own app either.
assert.throws(() => gallery.createSynthesis({
  clientId: creatorClient('C19'),
  targetAppId: targetApp.id,
  title: 'Creator-led contribution view',
  content: 'Preserve the creator-led direction while making the contribution view expressive and easy to read.',
  sources: [{ type: 'comment', id: Number(commentOne.id) }],
}), /自己的应用/);

// A Creator spends their single Wildcard on a comment for their own App.
const wildcardState = gallery.useCommunityWildcard(
  creatorClient('C19'),
  targetApp.id,
  Number(commentOne.id),
);
assert.equal(wildcardState.wildcards.length, 1);
assert.equal(wildcardState.wildcards[0].source_id, Number(commentOne.id));
assert.equal(
  gallery.getCommunityGalleryState(creatorClient('C20')).wildcards[0].source_id,
  Number(commentOne.id),
  'Wildcard provenance should be visible to other participants.',
);
assert.throws(() => gallery.useCommunityWildcard(
  creatorClient('C19'),
  targetApp.id,
  Number(commentTwo.id),
), /一次|只能/);

// Likes become weights for the Host-locked random draw.
gallery.toggleCommunityCommentLike(creatorClient('C20'), Number(commentOne.id));
gallery.voteForSynthesis(creatorClient('C20'), Number(firstSynthesis.id));
assert.equal(gallery.getCommunityGalleryState(hostClient).stageSelections.length, 0);

// Creator-side generation is disabled; Host locks votes, draws, and immediately starts jobs.
assert.throws(() => gallery.startCommunityGeneration(
  creatorClient('C20'),
  targetApp.id,
  [{ type: 'comment', id: Number(commentOne.id) }],
  'Attempt to develop someone else’s app.',
), /主持人|锁定|不能直接/);

const firstStarted = gallery.enterCommunityDevelopmentStage(hostClient, 1);
assert.equal(firstStarted.jobIds.length, 1);
const firstRoundContributors = firstStarted.state.contributors.filter((contributor: any) => (
  contributor.app_id === targetApp.id && Number(contributor.iteration_number) === 1
));
assert.deepEqual(
  firstRoundContributors.map((contributor: any) => contributor.participant_code).sort(),
  ['C20', 'C21'],
);
assert.ok(firstRoundContributors.every((contributor: any) => (
  Number(contributor.first_selected_iteration) === 1
  && Number(contributor.selected_in_current_iteration) === 1
)));
const firstInput = gallery.getCommunityGenerationInput(firstStarted.jobIds[0]);
assert.equal(firstInput.job.selected_source_type, 'synthesis');
assert.ok(firstInput.sources.some((source: any) => Number(source.source_id) === Number(commentOne.id)));
assert.equal(firstInput.sources.length, 2);
assert.ok(firstInput.sources.some((source: any) => (
  source.source_type !== 'comment' || Number(source.source_id) !== Number(commentOne.id)
)));
const firstSelection = db.prepare(`
  SELECT source_popularity_json FROM vg_async_stage_selections
  WHERE study_id = ? AND app_id = ? AND iteration_number = 1
`).get(state.study.id, targetApp.id) as any;
const firstSelectionAudit = JSON.parse(firstSelection.source_popularity_json);
assert.equal(firstSelectionAudit.wildcard_excluded_from_random_pool, true);
assert.ok(!firstSelectionAudit.candidates.some((candidate: any) => (
  candidate.source_type === 'comment' && Number(candidate.source_id) === Number(commentOne.id)
)));
assert.ok(firstInput.synthesis?.is_development_brief);
assert.equal(firstInput.job.base_version_id, targetApp.initial_version_id);
assert.equal(gallery.getCommunityGalleryState(hostClient).study.workflow_stage, 'development_1');
assert.equal(gallery.getCommunityGalleryState(hostClient).stageSelections.length, 0);
assert.throws(
  () => gallery.deleteCommunitySynthesis(creatorClient('C19'), Number(firstInput.synthesis?.id)),
  /只能删除自己的综合评论/,
);

// Host retains the failed-job retry capability, but does not choose a new direction.
gallery.failCommunityGeneration(firstStarted.jobIds[0], new Error('Synthetic generation failure.'));
assert.throws(
  () => gallery.retryCommunityGeneration(creatorClient('C19'), firstStarted.jobIds[0]),
  /主持人/,
);
const retried = gallery.retryCommunityGeneration(hostClient, firstStarted.jobIds[0]);
const retriedInput = gallery.getCommunityGenerationInput(retried.jobId);
assert.equal(retriedInput.job.selected_source_id, firstInput.job.selected_source_id);
gallery.completeCommunityGeneration(
  retried.jobId,
  html('Target App Community V1'),
  'Implemented the selected multi-source direction.',
);

let targetCreatorState = gallery.getCommunityGalleryState(creatorClient('C19'));
assert.equal(targetCreatorState.versions.some((version: any) => (
  version.app_id === targetApp.id && version.kind === 'community'
)), false);
assert.equal(targetCreatorState.apps.find((app: any) => app.id === targetApp.id)?.draft_kind, 'community');
assert.equal(targetCreatorState.notifications.length, 0);

gallery.saveRefinedDraft(
  creatorClient('C19'),
  html('Target App Community V1 Refined'),
  'Refined the draft before publication.',
  'Add an at-a-glance contribution summary to the new interface.',
  'Added the requested contribution summary.',
);
const communityRefineEvent = db.prepare(`
  SELECT data_json FROM vg_async_events
  WHERE study_id = ? AND participant_code = 'C19' AND event_type = 'refine_draft'
  ORDER BY id DESC LIMIT 1
`).get(state.study.id) as { data_json: string };
const communityRefineData = JSON.parse(communityRefineEvent.data_json);
assert.equal(communityRefineData.developmentTrigger, 'host_locked_draw_followup');
assert.equal(communityRefineData.iterationNumber, 1);
assert.equal(communityRefineData.selectedSourceType, firstInput.job.selected_source_type);
assert.equal(Number(communityRefineData.selectedSourceId), Number(firstInput.job.selected_source_id));

targetCreatorState = gallery.publishCommunityVersion(creatorClient('C19'), targetApp.id);
const firstVersion = targetCreatorState.versions.find((version: any) => (
  version.app_id === targetApp.id && version.kind === 'community' && version.version_number === 2
));
assert.ok(firstVersion);
const publishedDevelopmentBrief = targetCreatorState.syntheses.find((synthesis: any) => (
  Number(synthesis.id) === Number(firstInput.synthesis?.id)
));
assert.match(publishedDevelopmentBrief?.content || '', /第 2 轮提示词：Add an at-a-glance contribution summary/);
const contributorState = gallery.getCommunityGalleryState(creatorClient('C20'));
assert.ok(contributorState.notifications.some((notification: any) => (
  notification.app_id === targetApp.id && notification.version_number === 1
)));

// The control creator can independently enter the external-development flow too.
gallery.uploadControlCommunityDraft(
  creatorClient('C01'),
  controlApp.id,
  html('Control App Community V1'),
  'Built externally without Host stage control.',
  'Use social feedback.',
);
const controlState = gallery.publishCommunityVersion(creatorClient('C01'), controlApp.id);
assert.ok(controlState.versions.some((version: any) => (
  version.app_id === controlApp.id && version.version_number === 2
)));

// Round two only accepts sources attached to Community V1 / layer two.
const roundTwoCommentState = gallery.saveCommunityComment({
  clientId: creatorClient('C20'),
  appId: targetApp.id,
  content: 'For V2, refine the contribution trail into a compact summary panel.',
});
const roundTwoComment = roundTwoCommentState.comments.find((comment: any) => (
  comment.app_id === targetApp.id && comment.author_code === 'C20'
  && comment.content.startsWith('For V2')
));
assert.equal(Number(roundTwoComment?.version_id), Number(firstVersion.id));

const secondSynthesisState = gallery.createSynthesis({
  clientId: creatorClient('C21'),
  targetAppId: targetApp.id,
  title: 'Compact V2 summary panel',
  content: 'Turn the V1 contribution trail into a compact summary panel.',
  sources: [
    { type: 'comment', id: Number(roundTwoComment.id) },
    { type: 'synthesis', id: Number(firstSynthesis.id) },
  ],
});
const secondSynthesis = secondSynthesisState.syntheses.find((synthesis: any) => (
  synthesis.title === 'Compact V2 summary panel'
));
assert.equal(secondSynthesis?.layer, 2);

assert.throws(() => gallery.startCommunityGeneration(
  creatorClient('C19'),
  targetApp.id,
  [{ type: 'comment', id: Number(commentOne.id) }],
  'Incorrectly reuse an Initial Version comment in round two.',
), /主持人|锁定|不能直接/);

const secondStarted = gallery.enterCommunityDevelopmentStage(hostClient, 2);
assert.equal(secondStarted.jobIds.length, 1);
const secondRoundContributors = secondStarted.state.contributors.filter((contributor: any) => (
  contributor.app_id === targetApp.id && Number(contributor.iteration_number) === 2
));
assert.deepEqual(
  secondRoundContributors.map((contributor: any) => contributor.participant_code).sort(),
  ['C20', 'C21'],
);
assert.ok(secondRoundContributors.every((contributor: any) => (
  Number(contributor.first_selected_iteration) === 1
)));
const secondInput = gallery.getCommunityGenerationInput(secondStarted.jobIds[0]);
assert.ok(secondInput.sources.some((source: any) => (
  Number(source.source_id) === Number(roundTwoComment.id)
  || Number(source.source_id) === Number(secondSynthesis.id)
)));
gallery.completeCommunityGeneration(
  secondStarted.jobIds[0],
  html('Target App Community V2'),
  'Built a compact V2 summary panel.',
);
targetCreatorState = gallery.getCommunityGalleryState(creatorClient('C19'));
assert.equal(targetCreatorState.versions.filter((version: any) => (
  version.app_id === targetApp.id && version.kind === 'community'
)).length, 1);
targetCreatorState = gallery.publishCommunityVersion(creatorClient('C19'), targetApp.id);
const targetVersions = targetCreatorState.versions
  .filter((version: any) => version.app_id === targetApp.id && version.kind === 'community')
  .sort((left: any, right: any) => left.version_number - right.version_number);
assert.equal(targetVersions.length, 2);
assert.equal(targetVersions[1].base_version_id, targetVersions[0].id);
assert.equal(targetVersions[1].selected_source_type, 'synthesis');

// Before the real study, the Host can snapshot and remove all test interactions
// while keeping every Creator's initial App and condition assignment.
const preResetState = gallery.getCommunityGalleryState(hostClient);
const resetStudyId = preResetState.study.id;
assert.equal(preResetState.testReset.initialAppCount, 2);
assert.equal(preResetState.testReset.initialVersionCount, 2);
assert.equal(preResetState.testReset.communityVersionCount, 3);
assert.ok(preResetState.testReset.commentCount >= 3);
assert.ok(preResetState.testReset.hasResettableData);
assert.throws(
  () => gallery.resetCommunityTestData(creatorClient('C19'), '清理测试数据'),
  /主持人/,
);
assert.throws(
  () => gallery.resetCommunityTestData(hostClient, '确认'),
  /清理测试数据/,
);

const resetState = gallery.resetCommunityTestData(hostClient, '清理测试数据');
assert.equal(resetState.study.id, resetStudyId);
assert.equal(resetState.study.status, 'setup');
assert.equal(resetState.study.workflow_stage, 'synthesis_1');
assert.equal(resetState.apps.length, 2);
assert.ok(resetState.apps.every((app: any) => (
  app.status === 'published'
  && app.initial_version_id
  && !app.community_version_id
  && !app.selected_source_id
  && !app.selected_source_type
)));
assert.equal(resetState.versions.length, 2);
assert.ok(resetState.versions.every((version: any) => version.kind === 'initial'));
assert.ok(resetState.developmentMessages.every((message: any) => message.phase === 'initial'));
assert.equal(resetState.comments.length, 0);
assert.equal(resetState.syntheses.length, 0);
assert.equal(resetState.wildcards.length, 0);
assert.equal(resetState.contributors.length, 0);
assert.equal(resetState.assignments.length, 0);
assert.equal(resetState.generationJobs.length, 0);
assert.equal(resetState.generationEvents.length, 0);
assert.equal(resetState.stageSelections.length, 0);
assert.equal(resetState.notifications.length, 0);
assert.equal(resetState.testReset.snapshotCount, 1);
assert.equal(resetState.testReset.hasResettableData, false);

const resetSnapshot = db.prepare(`
  SELECT counts_json, snapshot_json FROM vg_async_reset_snapshots
  WHERE study_id = ? ORDER BY id DESC LIMIT 1
`).get(resetStudyId) as { counts_json: string; snapshot_json: string };
const resetSnapshotCounts = JSON.parse(resetSnapshot.counts_json);
const resetSnapshotPayload = JSON.parse(resetSnapshot.snapshot_json);
assert.equal(resetSnapshotCounts.communityVersionCount, 3);
assert.ok(resetSnapshotPayload.comments.length >= 3);
assert.equal(resetSnapshotPayload.versions.filter((version: any) => version.kind === 'community').length, 3);
assert.equal(resetSnapshotPayload.wildcards.length, 1);
const resetExport = gallery.exportCommunityStudy(hostClient) as any;
assert.equal(resetExport.reset_snapshots.length, 1);

// The same preserved study can be opened for the real session afterwards.
state = gallery.startAsyncCommunityStudy(hostClient);
assert.equal(state.study.id, resetStudyId);
assert.equal(state.study.status, 'active');
assert.equal(state.assignments.length, 0, 'No stale task assignments should survive the reset.');

const archivedId = gallery.getCommunityGalleryState(hostClient).study.id;
state = gallery.closeAsyncCommunityStudy(hostClient);
assert.equal(state.study.status, 'closed');
const nextStudy = gallery.startNewAsyncCommunityStudy(hostClient);
assert.equal(nextStudy.study.status, 'setup');
assert.equal(nextStudy.apps.length, 0);
assert.equal(Number((db.prepare(`SELECT COUNT(*) AS count FROM vg_async_apps WHERE study_id = ?`).get(archivedId) as any).count), 2);

console.log('Community gallery test passed: weighted draws, Wildcards, provenance, V2 eligibility, and Host test-data reset snapshots.');
db.close();
fs.rmSync(testDir, { recursive: true, force: true });
