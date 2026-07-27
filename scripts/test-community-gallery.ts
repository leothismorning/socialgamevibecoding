import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-gallery-async-'));
process.env.STUDY_DB_PATH = path.join(testDir, 'study.db');

const gallery = await import('../server/communityGalleryDb.js');
const { db } = await import('../server/studyDb.js');

const html = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1><button>Try</button></main></body></html>`;
const hostClient = 'host-client';
gallery.joinCommunityGallery(hostClient, 'H01');
assert.throws(() => gallery.setCommunityStudyConditions(
  hostClient,
  ['C01'],
  ['P01'],
), /恰好 6 名 Creator/);
let configuredState = gallery.setCommunityStudyConditions(
  hostClient,
  Array.from({ length: 6 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`),
  Array.from({ length: 12 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`),
);
assert.equal(configuredState.study.conditions_configured, true);
assert.deepEqual(
  configuredState.participants
    .filter((participant: any) => participant.role === 'creator' && participant.condition_name === 'control')
    .map((participant: any) => participant.code),
  ['C01', 'C02', 'C03', 'C04', 'C05', 'C06'],
);

let earlyCommentId = 0;
let earlyCommentClient = '';
for (let index = 1; index <= 12; index += 1) {
  const code = `C${String(index).padStart(2, '0')}`;
  const clientId = `creator-${code}`;
  gallery.joinCommunityGallery(clientId, code);
  const creatorOperationId = `creator-operation-${index}`;
  if (index === 1) {
    gallery.startCreatorDevelopmentOperation(clientId, creatorOperationId, 'generate');
    gallery.recordCreatorDevelopmentProgress(creatorOperationId, {
      step: 'plan',
      order: 1,
      status: 'running',
      title: 'AI 正在理解你的创作需求',
      detail: 'Testing visible creator progress.',
    });
  }
  const draftState = gallery.saveInitialDraft({
    clientId,
    title: `App ${code}`,
    brief: `Initial project by ${code}`,
    prompt: `Build App ${code}`,
    code: html(`App ${code}`),
    summary: 'Initial version',
    conversation: {
      creator: `Build App ${code}`,
      assistant: 'The first runnable draft is ready.',
    },
  });
  if (index === 1) {
    const draftApp = draftState.apps.find((app: any) => app.creator_code === code);
    assert.ok(draftApp);
    gallery.completeCreatorDevelopmentOperation(creatorOperationId, draftApp.id);
    const operation = gallery.getCreatorDevelopmentProgress(clientId, creatorOperationId);
    assert.equal(operation.status, 'completed');
    assert.equal(operation.events.length, 1);
    const refinedState = gallery.saveRefinedDraft(
      clientId,
      html(`App ${code} refined`),
      'Refined initial version',
      'Add a clearer primary action.',
      'The primary action has been added while preserving the rest of the draft.',
    );
    assert.equal(refinedState.developmentMessages.length, 4);
  }
  gallery.publishInitialVersion(clientId);

  // The asynchronous study is allowed to start after a single published App.
  if (index === 1) {
    const setupState = gallery.getCommunityGalleryState(hostClient);
    const firstApp = setupState.apps.find((app: any) => app.creator_code === code);
    const earlyMember = (setupState.participants as any[]).find((person: any) => person.role === 'community');
    assert.ok(firstApp && earlyMember);
    const earlyClient = `early-community-${earlyMember.code}`;
    earlyCommentClient = earlyClient;
    gallery.joinCommunityGallery(earlyClient, earlyMember.code);
    const commentedDuringSetup = gallery.saveCommunityComment({
      clientId: earlyClient,
      appId: firstApp.id,
      content: 'A published App can receive community feedback immediately.',
    });
    earlyCommentId = Number(commentedDuringSetup.comments.find(
      (comment: any) => comment.author_code === earlyMember.code && comment.app_id === firstApp.id,
    )?.id || 0);
    const started = gallery.startAsyncCommunityStudy(hostClient);
    assert.equal(started.study.status, 'active');
    assert.equal(started.study.workflow_stage, 'synthesis_1');
    assert.throws(() => gallery.setCommunityStudyConditions(
      hostClient,
      ['C01', 'C02', 'C03', 'C04', 'C05', 'C06'],
      Array.from({ length: 12 }, (_, memberIndex) => `P${String(memberIndex + 1).padStart(2, '0')}`),
    ), /研究开始后不能修改/);
  }
}

let hostState = gallery.getCommunityGalleryState(hostClient);
assert.ok(earlyCommentId > 0);
assert.ok(earlyCommentClient);
assert.throws(
  () => gallery.updateCommunityComment('creator-C01', earlyCommentId, 'Trying to edit another participant comment.'),
  /只能编辑自己的评论/,
);
let editedCommentState = gallery.updateCommunityComment(
  earlyCommentClient,
  earlyCommentId,
  'The author can revise published feedback before the study is closed.',
);
assert.equal(
  editedCommentState.comments.find((comment: any) => Number(comment.id) === earlyCommentId)?.content,
  'The author can revise published feedback before the study is closed.',
);
assert.notEqual(
  editedCommentState.comments.find((comment: any) => Number(comment.id) === earlyCommentId)?.updated_at,
  editedCommentState.comments.find((comment: any) => Number(comment.id) === earlyCommentId)?.created_at,
);
editedCommentState = gallery.deleteCommunityComment(earlyCommentClient, earlyCommentId);
assert.equal(
  editedCommentState.comments.some((comment: any) => Number(comment.id) === earlyCommentId),
  false,
);
assert.equal(hostState.counts.controlApps, 6);
assert.equal(hostState.counts.experimentalApps, 6);

const experimentalApps = hostState.apps.filter((app: any) => app.condition_name === 'experimental');
const controlApp = hostState.apps.find((app: any) => app.condition_name === 'control');
const experimentalCreators = hostState.participants
  .filter((person: any) => person.role === 'creator' && person.condition_name === 'experimental')
  .map((person: any) => person.code);
const experimentalMembers = hostState.participants
  .filter((person: any) => person.role === 'community' && person.condition_name === 'experimental')
  .map((person: any) => person.code);
assert.equal(experimentalApps.length, 6);
assert.ok(controlApp);
assert.ok(experimentalCreators.length >= 6);
assert.ok(experimentalMembers.length >= 4);

const [memberOne, memberTwo, memberThree, memberFour] = experimentalMembers;
const memberOneClient = `community-${memberOne}`;
const memberTwoClient = `community-${memberTwo}`;
const memberThreeClient = `community-${memberThree}`;
const memberFourClient = `community-${memberFour}`;
gallery.joinCommunityGallery(memberOneClient, memberOne);
gallery.joinCommunityGallery(memberTwoClient, memberTwo);
gallery.joinCommunityGallery(memberThreeClient, memberThree);
gallery.joinCommunityGallery(memberFourClient, memberFour);

type Seed = {
  app: any;
  rootCommentId: number;
  secondCommentId: number;
  replyId: number;
  firstSynthesisId: number;
  firstWinnerType: 'comment' | 'synthesis';
  firstWinnerId: number;
  firstWinnerScore: number;
  firstWinnerSourceCount: number;
};
const seeds: Seed[] = [];

for (const [index, app] of experimentalApps.entries()) {
  const suffix = `${index + 1}`;
  const firstState = gallery.saveCommunityComment({
    clientId: memberOneClient,
    appId: app.id,
    content: `Shared idea ${suffix}: give people a lightweight way to contribute before decisions are made.`,
  });
  const rootComment = firstState.comments.find((comment: any) => (
    comment.app_id === app.id && comment.author_code === memberOne && comment.content.includes(`Shared idea ${suffix}`)
  ));
  assert.ok(rootComment);

  const secondState = gallery.saveCommunityComment({
    clientId: memberTwoClient,
    appId: app.id,
    content: `Implementation idea ${suffix}: make the shared contributions visible in a live interaction.`,
  });
  const secondComment = secondState.comments.find((comment: any) => (
    comment.app_id === app.id && comment.author_code === memberTwo && comment.content.includes(`Implementation idea ${suffix}`)
  ));
  assert.ok(secondComment);

  const replyState = gallery.saveCommunityComment({
    clientId: memberThreeClient,
    appId: app.id,
    parentCommentId: rootComment.id,
    content: `Reply ${suffix}: keep an explicit trace from each suggestion to the resulting prototype.`,
  });
  const reply = replyState.comments.find((comment: any) => (
    comment.app_id === app.id && comment.author_code === memberThree && comment.parent_comment_id === rootComment.id
  ));
  assert.ok(reply);

  // Every person may submit one synthesis per App and layer. Development selection
  // ranks direct likes first and then the synthesis source count.
  const candidateOne = gallery.createSynthesis({
    clientId: memberOneClient,
    targetAppId: app.id,
    title: `First-layer shared direction ${suffix}`,
    content: `Build a collaborative feature that combines the shared idea and implementation path for App ${suffix}.`,
    sources: [
      { type: 'comment', id: rootComment.id },
      { type: 'comment', id: secondComment.id },
    ],
  });
  const candidateOneId = Number(candidateOne.syntheses.find((synthesis: any) => synthesis.title === `First-layer shared direction ${suffix}`)?.id || 0);
  assert.ok(candidateOneId > 0);

  gallery.createSynthesis({
    clientId: memberTwoClient,
    targetAppId: app.id,
    title: `Alternative first-layer direction ${suffix}`,
    content: `Build a traceable alternative that foregrounds the reply for App ${suffix}.`,
    sources: [
      { type: 'comment', id: rootComment.id },
      { type: 'comment', id: reply.id },
    ],
  });
  const supportingCandidateState = gallery.createSynthesis({
    clientId: memberThreeClient,
    targetAppId: app.id,
    title: `Supporting first-layer direction ${suffix}`,
    content: `Build a focused version from one selected idea for App ${suffix}.`,
    sources: [
      { type: 'comment', id: rootComment.id },
    ],
  });
  const supportingCandidateId = Number(supportingCandidateState.syntheses.find(
    (synthesis: any) => synthesis.title === `Supporting first-layer direction ${suffix}`,
  )?.id || 0);
  assert.ok(supportingCandidateId > 0);
  assert.equal(
    supportingCandidateState.syntheses.find(
      (synthesis: any) => Number(synthesis.id) === supportingCandidateId,
    )?.source_count,
    1,
  );

  assert.throws(() => gallery.createSynthesis({
    clientId: memberOneClient,
    targetAppId: app.id,
    title: 'Cannot submit twice in one App layer',
    content: 'A participant already submitted this round.',
    sources: [{ type: 'comment', id: rootComment.id }],
  }), /只能创建一条/);

  if (index === 0) {
    assert.throws(
      () => gallery.updateCommunitySynthesis(
        memberTwoClient,
        supportingCandidateId,
        'Trying to edit another participant synthesis.',
      ),
      /只能编辑自己的综合评论/,
    );
    let editedSynthesisState = gallery.updateCommunitySynthesis(
      memberThreeClient,
      supportingCandidateId,
      'Edited supporting direction: keep the selected idea focused and traceable.',
    );
    assert.equal(
      editedSynthesisState.syntheses.find(
        (synthesis: any) => Number(synthesis.id) === supportingCandidateId,
      )?.content,
      'Edited supporting direction: keep the selected idea focused and traceable.',
    );
    editedSynthesisState = gallery.deleteCommunitySynthesis(
      memberThreeClient,
      supportingCandidateId,
    );
    const deletedOwnSynthesis = editedSynthesisState.syntheses.find(
      (synthesis: any) => Number(synthesis.id) === supportingCandidateId,
    );
    assert.ok(deletedOwnSynthesis?.deleted_at);
    assert.equal(deletedOwnSynthesis.content, '该综合评论已由作者删除。');
    assert.equal(
      gallery.getCommunityGalleryState(hostClient).syntheses.some(
        (synthesis: any) => Number(synthesis.id) === supportingCandidateId,
      ),
      false,
    );
    assert.throws(() => gallery.createSynthesis({
      clientId: memberThreeClient,
      targetAppId: app.id,
      title: 'Deleting does not reset the one-synthesis quota',
      content: 'A deleted synthesis still counts as the participant submission for this App and layer.',
      sources: [{ type: 'comment', id: rootComment.id }],
    }), /只能创建一条/);

    let selfLikeState = gallery.voteForSynthesis(memberOneClient, candidateOneId);
    assert.equal(
      selfLikeState.syntheses.find(
        (synthesis: any) => Number(synthesis.id) === candidateOneId,
      )?.viewer_voted,
      1,
    );
    selfLikeState = gallery.voteForSynthesis(memberOneClient, candidateOneId);
    assert.equal(
      selfLikeState.syntheses.find(
        (synthesis: any) => Number(synthesis.id) === candidateOneId,
      )?.viewer_voted,
      0,
    );
    let selfCommentLikeState = gallery.toggleCommunityCommentLike(
      memberOneClient,
      Number(rootComment.id),
    );
    assert.equal(
      selfCommentLikeState.comments.find(
        (comment: any) => Number(comment.id) === Number(rootComment.id),
      )?.viewer_liked,
      1,
    );
    selfCommentLikeState = gallery.toggleCommunityCommentLike(
      memberOneClient,
      Number(rootComment.id),
    );
    assert.equal(
      selfCommentLikeState.comments.find(
        (comment: any) => Number(comment.id) === Number(rootComment.id),
      )?.viewer_liked,
      0,
    );
  }

  let likedState = gallery.voteForSynthesis(memberThreeClient, candidateOneId);
  assert.equal(
    likedState.syntheses.find((synthesis: any) => Number(synthesis.id) === candidateOneId)?.vote_count,
    1,
  );
  if (index === 0) {
    likedState = gallery.voteForSynthesis(memberThreeClient, candidateOneId);
    assert.equal(
      likedState.syntheses.find((synthesis: any) => Number(synthesis.id) === candidateOneId)?.vote_count,
      0,
    );
    likedState = gallery.voteForSynthesis(memberThreeClient, candidateOneId);
  }
  likedState = gallery.voteForSynthesis(memberTwoClient, candidateOneId);
  likedState = gallery.voteForSynthesis(memberFourClient, candidateOneId);
  if (index === 0) {
    const alternativeCandidateId = Number(likedState.syntheses.find(
      (synthesis: any) => synthesis.title === `Alternative first-layer direction ${suffix}`,
    )?.id || 0);
    gallery.voteForSynthesis(memberOneClient, alternativeCandidateId);
    let commentLikeState = gallery.toggleCommunityCommentLike(memberTwoClient, Number(rootComment.id));
    assert.equal(
      commentLikeState.comments.find((comment: any) => Number(comment.id) === Number(rootComment.id))?.viewer_liked,
      1,
    );
    commentLikeState = gallery.toggleCommunityCommentLike(memberTwoClient, Number(rootComment.id));
    assert.equal(
      commentLikeState.comments.find((comment: any) => Number(comment.id) === Number(rootComment.id))?.viewer_liked,
      0,
    );
    gallery.toggleCommunityCommentLike(memberTwoClient, Number(rootComment.id));
    gallery.toggleCommunityCommentLike(memberThreeClient, Number(rootComment.id));
    gallery.toggleCommunityCommentLike(memberFourClient, Number(rootComment.id));
  }
  if (index === 1) {
    gallery.toggleCommunityCommentLike(memberOneClient, Number(rootComment.id));
    gallery.toggleCommunityCommentLike(memberTwoClient, Number(rootComment.id));
    gallery.toggleCommunityCommentLike(memberThreeClient, Number(rootComment.id));
    gallery.toggleCommunityCommentLike(memberFourClient, Number(rootComment.id));
  }
  const likedCandidate = likedState.syntheses.find(
    (synthesis: any) => Number(synthesis.id) === candidateOneId,
  );
  assert.equal(likedCandidate?.vote_count, 3);
  assert.equal(likedCandidate?.community_score, 3);
  seeds.push({
    app,
    rootCommentId: Number(rootComment.id),
    secondCommentId: Number(secondComment.id),
    replyId: Number(reply.id),
    firstSynthesisId: candidateOneId,
    firstWinnerType: index === 1 ? 'comment' : 'synthesis',
    firstWinnerId: index === 1 ? Number(rootComment.id) : candidateOneId,
    firstWinnerScore: index === 1 ? 4 : 3,
    firstWinnerSourceCount: index === 1 ? 0 : 2,
  });
}

const manySourceState = gallery.createSynthesis({
  clientId: memberFourClient,
  targetAppId: seeds[0].app.id,
  title: 'Many-source synthesis is allowed',
  content: 'A synthesis may understand and combine any number of selected ideas.',
  sources: [
    { type: 'comment', id: seeds[0].rootCommentId },
    { type: 'comment', id: seeds[0].secondCommentId },
    { type: 'comment', id: seeds[0].replyId },
    { type: 'comment', id: seeds[1].rootCommentId },
  ],
});
assert.equal(
  manySourceState.syntheses.find(
    (synthesis: any) => synthesis.title === 'Many-source synthesis is allowed',
  )?.source_count,
  4,
);

// A basket item from another App remains available to use on a target App canvas.
const crossBasketState = gallery.toggleCreativeBasket(memberOneClient, 'comment', seeds[1].rootCommentId);
assert.ok(crossBasketState.basket.some((item: any) => Number(item.source_id) === seeds[1].rootCommentId));

if (process.env.PAUSE_COMMUNITY_GALLERY_TEST_AT_SYNTHESIS === '1') {
  console.log(`QA synthesis fixture: ${process.env.STUDY_DB_PATH}`);
  console.log(`QA participant: ${memberThree}`);
  console.log(`QA target App: ${seeds[1].app.title}`);
  db.close();
  process.exit(0);
}

hostState = gallery.enterCommunityDevelopmentStage(hostClient, 1);
assert.equal(hostState.study.workflow_stage, 'development_1');
assert.equal(hostState.stageSelections.filter((selection: any) => selection.iteration_number === 1).length, 6);
for (const seed of seeds) {
  const selection = hostState.stageSelections.find((item: any) => item.app_id === seed.app.id && item.iteration_number === 1);
  assert.equal(selection?.source_type, seed.firstWinnerType);
  assert.equal(selection?.source_id, seed.firstWinnerId);
  assert.equal(selection?.score, seed.firstWinnerScore);
  assert.equal(
    JSON.parse(selection?.source_popularity_json || '{}').source_count,
    seed.firstWinnerSourceCount,
  );
}
const firstWinner = hostState.syntheses.find((synthesis: any) => Number(synthesis.id) === seeds[0].firstWinnerId);
assert.equal(firstWinner?.vote_count, 3);
assert.equal(firstWinner?.source_count, 2);
assert.equal(firstWinner?.selected_for_iteration, 1);
const directCommentWinner = hostState.comments.find(
  (comment: any) => Number(comment.id) === seeds[1].firstWinnerId,
);
assert.equal(directCommentWinner?.like_count, 4);
assert.equal(directCommentWinner?.selected_for_iteration, 1);

const notifiedState = gallery.getCommunityGalleryState(memberOneClient);
assert.ok(notifiedState.notifications.some((notification: any) => (
  notification.app_id === seeds[0].app.id && notification.version_number === 1
)));

hostState = gallery.returnToPreviousCommunityStage(hostClient);
assert.equal(hostState.study.workflow_stage, 'synthesis_1');
assert.equal(hostState.stageSelections.filter((selection: any) => selection.iteration_number === 1).length, 0);
assert.ok(hostState.apps
  .filter((app: any) => app.condition_name === 'experimental')
  .every((app: any) => !app.selected_synthesis_id));
assert.ok(!gallery.getCommunityGalleryState(memberOneClient).notifications.some((notification: any) => (
  notification.version_number === 1
)));

hostState = gallery.enterCommunityDevelopmentStage(hostClient, 1);
assert.equal(hostState.study.workflow_stage, 'development_1');

// Stage 2 is not available before an App has published V1.
assert.throws(() => gallery.createSynthesis({
  clientId: memberOneClient,
  targetAppId: seeds[0].app.id,
  title: 'Too early second layer',
  content: 'This must not be created before Community Version 1 exists.',
  sources: [
    { type: 'comment', id: seeds[0].rootCommentId },
    { type: 'comment', id: seeds[0].secondCommentId },
  ],
}));

const automaticFirstJobs = new Map<string, { jobId: number }>();
for (const [index, seed] of seeds.entries()) {
  const started = gallery.startAutomaticCommunityGeneration(hostClient, seed.app.id, 1);
  assert.equal(started.existing, false);
  automaticFirstJobs.set(seed.app.id, started);
  if (index === 0) {
    const resumed = gallery.startAutomaticCommunityGeneration(hostClient, seed.app.id, 1);
    assert.equal(resumed.existing, true);
    assert.equal(resumed.jobId, started.jobId);
    assert.throws(
      () => gallery.retryCommunityGeneration(hostClient, started.jobId),
      /只有失败/,
    );
    gallery.failCommunityGeneration(started.jobId, new Error('Synthetic failure before Host retry.'));
    assert.throws(
      () => gallery.retryCommunityGeneration(memberOneClient, started.jobId),
      /Host|host/,
    );
    const retried = gallery.retryCommunityGeneration(hostClient, started.jobId);
    assert.notEqual(retried.jobId, started.jobId);
    assert.equal(
      retried.state.generationJobs.find((job: any) => Number(job.id) === Number(retried.jobId))?.status,
      'running',
    );
    assert.equal(
      retried.state.generationJobs.find((job: any) => Number(job.id) === Number(started.jobId))?.status,
      'failed',
    );
    assert.throws(
      () => gallery.retryCommunityGeneration(hostClient, started.jobId),
      /更新的开发任务/,
    );
    automaticFirstJobs.set(seed.app.id, retried);
    assert.throws(
      () => gallery.returnToPreviousCommunityStage(hostClient),
      /已经开始/,
    );
  }
}

for (const [index, seed] of seeds.entries()) {
  const creatorClient = `creator-${seed.app.creator_code}`;
  const started = automaticFirstJobs.get(seed.app.id);
  assert.ok(started);
  const generationInput = gallery.getCommunityGenerationInput(started.jobId);
  const selection = hostState.stageSelections.find((item: any) => (
    item.app_id === seed.app.id && item.iteration_number === 1
  ));
  assert.equal(generationInput.job.creator_instruction, selection?.source_content);
  if (index === 0) {
    assert.throws(
      () => gallery.returnToPreviousCommunityStage(hostClient),
      /已经开始/,
    );
    const selectedPrompt = seed.firstWinnerType === 'synthesis'
      ? hostState.syntheses.find(
          (synthesis: any) => Number(synthesis.id) === Number(seed.firstWinnerId),
        )?.content
      : hostState.comments.find(
          (comment: any) => Number(comment.id) === Number(seed.firstWinnerId),
        )?.content;
    assert.equal(generationInput.job.creator_instruction, selectedPrompt);
    gallery.recordCommunityGenerationProgress(started.jobId, {
      step: 'plan', order: 1, status: 'completed', title: 'Plan ready', detail: 'Use the locked direction.',
    });
  }
  gallery.completeCommunityGeneration(started.jobId, html(`App ${index + 1} Community Version 1`), 'Implemented the first locked direction.');
  const automaticallyPublished = gallery.getCommunityGalleryState(creatorClient);
  assert.equal(
    automaticallyPublished.versions.filter(
      (version: any) => version.app_id === seed.app.id && version.kind === 'community',
    ).length,
    1,
  );
  assert.ok(!automaticallyPublished.apps.find((app: any) => app.id === seed.app.id)?.draft_code);
}

const continuingCreatorClient = `creator-${seeds[0].app.creator_code}`;
const publishedProjectContext = gallery.getCreatorDraftContext(continuingCreatorClient);
assert.equal(publishedProjectContext.draft.kind, 'project');
assert.equal(publishedProjectContext.draft.version_number, 2);
const continuingOperationId = 'creator-continue-operation-1';
gallery.startCreatorDevelopmentOperation(
  continuingCreatorClient,
  continuingOperationId,
  'refine',
  'project',
);
gallery.recordCreatorDevelopmentProgress(continuingOperationId, {
  step: 'plan',
  order: 1,
  status: 'completed',
  title: 'Published project plan ready',
  detail: 'Continue from the latest published version.',
});
const continuedProjectState = gallery.saveRefinedDraft(
  continuingCreatorClient,
  html('App 1 creator-refined published project'),
  'Creator refined the already-published project.',
  'Continue developing the latest published project.',
  'The project draft is ready to preview.',
);
gallery.completeCreatorDevelopmentOperation(continuingOperationId, seeds[0].app.id);
assert.equal(
  continuedProjectState.developmentMessages.filter(
    (message: any) => message.app_id === seeds[0].app.id && message.phase === 'project',
  ).length,
  2,
);
const continuedProjectApp = continuedProjectState.apps.find(
  (app: any) => app.id === seeds[0].app.id,
);
assert.equal(continuedProjectApp?.draft_kind, 'project');
assert.ok(continuedProjectApp?.draft_code.includes('creator-refined published project'));
assert.equal(
  (db.prepare(`
    SELECT COUNT(*) AS count FROM vg_async_creator_revisions
    WHERE study_id = ? AND app_id = ?
  `).get(hostState.study.id, seeds[0].app.id) as any).count,
  0,
);
const publishedBeforeConfirmation = db.prepare(`
  SELECT code FROM vg_async_versions
  WHERE study_id = ? AND app_id = ? AND id = ?
`).get(
  hostState.study.id,
  seeds[0].app.id,
  publishedProjectContext.draft.id,
) as any;
assert.ok(!publishedBeforeConfirmation.code.includes('creator-refined published project'));
const publishedProjectState = gallery.publishProjectDraft(continuingCreatorClient);
assert.ok(!publishedProjectState.apps.find((app: any) => app.id === seeds[0].app.id)?.draft_code);
assert.equal(
  (db.prepare(`
    SELECT COUNT(*) AS count FROM vg_async_creator_revisions
    WHERE study_id = ? AND app_id = ?
  `).get(hostState.study.id, seeds[0].app.id) as any).count,
  1,
);
const publishedAfterConfirmation = db.prepare(`
  SELECT code FROM vg_async_versions
  WHERE study_id = ? AND app_id = ? AND id = ?
`).get(
  hostState.study.id,
  seeds[0].app.id,
  publishedProjectContext.draft.id,
) as any;
assert.ok(publishedAfterConfirmation.code.includes('creator-refined published project'));

const secondRoundCommentState = gallery.saveCommunityComment({
  clientId: memberOneClient,
  appId: seeds[0].app.id,
  content: 'Second-round feedback: revise the Community V1 interaction after trying the prototype.',
});
const secondRoundComment = secondRoundCommentState.comments.find((comment: any) => (
  comment.app_id === seeds[0].app.id
  && comment.content.startsWith('Second-round feedback:')
));
const firstCommunityVersion = secondRoundCommentState.versions.find((version: any) => (
  version.app_id === seeds[0].app.id
  && version.kind === 'community'
  && version.version_number === 2
));
assert.ok(secondRoundComment && firstCommunityVersion);
assert.equal(secondRoundComment.version_id, firstCommunityVersion.id);
gallery.toggleCommunityCommentLike(memberOneClient, Number(secondRoundComment.id));
gallery.toggleCommunityCommentLike(memberTwoClient, Number(secondRoundComment.id));
gallery.toggleCommunityCommentLike(memberThreeClient, Number(secondRoundComment.id));
gallery.toggleCommunityCommentLike(memberFourClient, Number(secondRoundComment.id));

// The control condition may upload a V1 during the same Host-controlled development stage.
gallery.uploadControlCommunityDraft(
  `creator-${controlApp!.creator_code}`,
  controlApp!.id,
  html('Control Community Version 1'),
  'Built with the external vibe-coding tool.',
  'Used ordinary social comments.',
);
let controlCreatorState = gallery.publishCommunityVersion(`creator-${controlApp!.creator_code}`, controlApp!.id);
const controlV1 = controlCreatorState.versions.find((version: any) => (
  version.app_id === controlApp!.id && version.kind === 'community' && version.version_number === 2
));
assert.ok(controlV1);

const secondLayerSynthesisIds = new Map<string, number>();
for (const [index, seed] of seeds.entries()) {
  const layerTwoState = gallery.createSynthesis({
    clientId: memberTwoClient,
    targetAppId: seed.app.id,
    title: `Second-layer V1 extension ${index + 1}`,
    content: `Extend Community Version 1 of App ${index + 1} with the earlier community direction and a concrete comment.`,
    sources: [
      { type: 'synthesis', id: seed.firstSynthesisId },
      { type: 'comment', id: index === 0 ? secondRoundComment.id : seed.rootCommentId },
    ],
  });
  const newCandidate = layerTwoState.syntheses.find((synthesis: any) => synthesis.title === `Second-layer V1 extension ${index + 1}`);
  assert.equal(newCandidate?.layer, 2);
  secondLayerSynthesisIds.set(seed.app.id, Number(newCandidate?.id));
}

hostState = gallery.enterCommunityDevelopmentStage(hostClient, 2);
assert.equal(hostState.study.workflow_stage, 'development_2');
assert.equal(hostState.stageSelections.filter((selection: any) => selection.iteration_number === 2).length, 6);
assert.ok(hostState.stageSelections.every((selection: any) => selection.source_content));
const secondRoundOrdinaryWinner = hostState.stageSelections.find((selection: any) => (
  selection.app_id === seeds[0].app.id && selection.iteration_number === 2
));
assert.equal(secondRoundOrdinaryWinner?.source_type, 'comment');
assert.equal(Number(secondRoundOrdinaryWinner?.source_id), Number(secondRoundComment.id));
const oldHighLikeCommentExcluded = hostState.stageSelections.find((selection: any) => (
  selection.app_id === seeds[1].app.id && selection.iteration_number === 2
));
assert.equal(oldHighLikeCommentExcluded?.source_type, 'synthesis');
assert.equal(
  Number(oldHighLikeCommentExcluded?.source_id),
  Number(secondLayerSynthesisIds.get(seeds[1].app.id)),
);
assert.notEqual(Number(oldHighLikeCommentExcluded?.source_id), Number(seeds[1].rootCommentId));

const targetSeed = seeds[0];
const firstSelection = hostState.stageSelections.find((selection: any) => (
  selection.app_id === targetSeed.app.id && selection.iteration_number === 1
));
hostState = gallery.returnToPreviousCommunityStage(hostClient);
assert.equal(hostState.study.workflow_stage, 'development_1');
assert.equal(hostState.stageSelections.filter((selection: any) => selection.iteration_number === 2).length, 0);
assert.equal(
  hostState.apps.find((app: any) => app.id === targetSeed.app.id)?.selected_source_type,
  firstSelection?.source_type,
);
assert.equal(
  hostState.apps.find((app: any) => app.id === targetSeed.app.id)?.selected_source_id,
  firstSelection?.source_id,
);

hostState = gallery.enterCommunityDevelopmentStage(hostClient, 2);
const secondSelection = hostState.stageSelections.find((selection: any) => (
  selection.app_id === targetSeed.app.id && selection.iteration_number === 2
));
assert.ok(secondSelection);
const secondStarted = gallery.startCommunityGeneration(
  `creator-${targetSeed.app.creator_code}`,
  targetSeed.app.id,
  secondSelection.source_type,
  Number(secondSelection.source_id),
  'Continue from Community Version 1 with the Host-selected second direction.',
);
assert.throws(
  () => gallery.returnToPreviousCommunityStage(hostClient),
  /已经开始/,
);
gallery.completeCommunityGeneration(secondStarted.jobId, html('Target Community Version 2'), 'Extended the V1 prototype.');
const targetCreatorState = gallery.getCommunityGalleryState(`creator-${targetSeed.app.creator_code}`);
const targetVersions = targetCreatorState.versions
  .filter((version: any) => version.app_id === targetSeed.app.id && version.kind === 'community')
  .sort((left: any, right: any) => left.version_number - right.version_number);
assert.equal(targetVersions.length, 2);
assert.equal(targetVersions[1].base_version_id, targetVersions[0].id);
assert.equal(targetVersions[1].selected_source_type, secondSelection.source_type);
assert.equal(targetVersions[1].selected_source_id, secondSelection.source_id);

// V2 in the control condition is also fixed to that App's V1.
gallery.uploadControlCommunityDraft(
  `creator-${controlApp!.creator_code}`,
  controlApp!.id,
  html('Control Community Version 2'),
  'Second external development pass.',
  'Continue from the first external community version.',
  controlV1.id,
);
controlCreatorState = gallery.publishCommunityVersion(`creator-${controlApp!.creator_code}`, controlApp!.id);
assert.equal(
  controlCreatorState.versions.find((version: any) => version.app_id === controlApp!.id && version.version_number === 3)?.base_version_id,
  controlV1.id,
);

const assignmentCounts = db.prepare(`
  SELECT app_id, COUNT(*) AS count
  FROM vg_async_assignments
  WHERE study_id = ?
  GROUP BY app_id
`).all(hostState.study.id) as Array<{ app_id: string; count: number }>;
assert.equal(assignmentCounts.length, 12);
assert.ok(assignmentCounts.every((row) => Number(row.count) === 9));

assert.throws(
  () => gallery.deleteCommunityComment(memberTwoClient, targetSeed.rootCommentId),
  /只能删除自己的评论/,
);
const tombstoneState = gallery.deleteCommunityComment(memberOneClient, targetSeed.rootCommentId);
const deletedSourceComment = tombstoneState.comments.find(
  (comment: any) => Number(comment.id) === targetSeed.rootCommentId,
);
assert.ok(deletedSourceComment?.deleted_at);
assert.equal(deletedSourceComment.content, '该评论已由作者删除。');
assert.equal(deletedSourceComment.like_count, 0);
assert.equal(
  tombstoneState.synthesisSources.find(
    (source: any) => source.source_type === 'comment'
      && Number(source.source_id) === targetSeed.rootCommentId,
  )?.content,
  '该评论已由作者删除。',
);
const synthesisTombstoneState = gallery.deleteCommunitySynthesis(
  memberOneClient,
  targetSeed.firstSynthesisId,
);
const deletedReferencedSynthesis = synthesisTombstoneState.syntheses.find(
  (synthesis: any) => Number(synthesis.id) === targetSeed.firstSynthesisId,
);
assert.ok(deletedReferencedSynthesis?.deleted_at);
assert.equal(deletedReferencedSynthesis.content, '该综合评论已由作者删除。');
assert.equal(
  synthesisTombstoneState.synthesisSources.find(
    (source: any) => source.source_type === 'synthesis'
      && Number(source.source_id) === targetSeed.firstSynthesisId,
  )?.content,
  '该综合评论已由作者删除。',
);

const keepFixture = process.env.KEEP_COMMUNITY_GALLERY_TEST_DB === '1';
if (!keepFixture) {
  const archivedStudyId = hostState.study.id;
  const archivedAppCount = Number((db.prepare(`
    SELECT COUNT(*) AS count FROM vg_async_apps WHERE study_id = ?
  `).get(archivedStudyId) as { count: number }).count);
  hostState = gallery.closeAsyncCommunityStudy(hostClient);
  assert.equal(hostState.study.status, 'closed');
  const nextState = gallery.startNewAsyncCommunityStudy(hostClient);
  assert.equal(nextState.study.status, 'setup');
  assert.equal(nextState.study.conditions_configured, false);
  assert.equal(nextState.apps.length, 0);
  assert.equal(
    nextState.participants.filter(
      (participant: any) => participant.role !== 'host' && participant.condition_name === 'control',
    ).length,
    0,
  );
  assert.equal(archivedAppCount, 12);
  assert.equal(Number((db.prepare(`
    SELECT COUNT(*) AS count FROM vg_async_apps WHERE study_id = ?
  `).get(archivedStudyId) as { count: number }).count), 12);
}

console.log('Community gallery test passed: creator progress and multi-turn drafts, asynchronous publishing, Host-only failed-job redevelopment with retained history, second-round-only V2 candidate eligibility, author-only ordinary and synthesis editing/deletion with provenance tombstones, locked development prompt snapshots, reply provenance, unlimited basket-based synthesis sources, one synthesis per person/App/layer, ordinary and synthesis like toggles, cross-type highest-like Host selection, direct ordinary-comment development, archived-study preservation, gated V1/V2 development, and fixed V2 lineage.');
if (keepFixture) console.log(`QA fixture database: ${process.env.STUDY_DB_PATH}`);
db.close();
if (!keepFixture) fs.rmSync(testDir, { recursive: true, force: true });
