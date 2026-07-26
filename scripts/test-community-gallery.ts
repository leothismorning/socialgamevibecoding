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

let earlyCommentId = 0;
for (let index = 1; index <= 12; index += 1) {
  const code = `C${String(index).padStart(2, '0')}`;
  const clientId = `creator-${code}`;
  gallery.joinCommunityGallery(clientId, code);
  gallery.saveInitialDraft({
    clientId,
    title: `App ${code}`,
    brief: `Initial project by ${code}`,
    prompt: `Build App ${code}`,
    code: html(`App ${code}`),
    summary: 'Initial version',
  });
  gallery.publishInitialVersion(clientId);

  // The asynchronous study is allowed to start after a single published App.
  if (index === 1) {
    const setupState = gallery.getCommunityGalleryState(hostClient);
    const firstApp = setupState.apps.find((app: any) => app.creator_code === code);
    const earlyMember = (setupState.participants as any[]).find((person: any) => person.role === 'community');
    assert.ok(firstApp && earlyMember);
    const earlyClient = `early-community-${earlyMember.code}`;
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
  }
}

let hostState = gallery.getCommunityGalleryState(hostClient);
assert.ok(earlyCommentId > 0);
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
assert.ok(experimentalMembers.length >= 3);

const [memberOne, memberTwo, memberThree] = experimentalMembers;
const memberOneClient = `community-${memberOne}`;
const memberTwoClient = `community-${memberTwo}`;
const memberThreeClient = `community-${memberThree}`;
gallery.joinCommunityGallery(memberOneClient, memberOne);
gallery.joinCommunityGallery(memberTwoClient, memberTwo);
gallery.joinCommunityGallery(memberThreeClient, memberThree);

type Seed = {
  app: any;
  rootCommentId: number;
  secondCommentId: number;
  replyId: number;
  firstWinnerId: number;
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

  // Three people choose overlapping source comments. The first candidate wins on
  // distinct-user source popularity: 3 + 2 = 5, versus 3 + 1 = 4.
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
    content: `Build another version of the shared idea and implementation path for App ${suffix}.`,
    sources: [
      { type: 'comment', id: rootComment.id },
      { type: 'comment', id: secondComment.id },
    ],
  });
  if (index === 0) {
    const supportingCandidateId = Number(supportingCandidateState.syntheses.find(
      (synthesis: any) => synthesis.title === `Supporting first-layer direction ${suffix}`,
    )?.id || 0);
    assert.ok(supportingCandidateId > 0);
    const withdrawnState = gallery.withdrawSynthesisForVote(memberThreeClient, supportingCandidateId);
    assert.ok(!withdrawnState.syntheses.some(
      (synthesis: any) => Number(synthesis.id) === supportingCandidateId,
    ));
    assert.equal(
      withdrawnState.syntheses.find((synthesis: any) => Number(synthesis.id) === candidateOneId)?.viewer_vote_available,
      1,
    );
    assert.throws(() => gallery.createSynthesis({
      clientId: memberThreeClient,
      targetAppId: app.id,
      title: 'Cannot recreate after swapping',
      content: 'A withdrawn candidate has already been converted into a vote.',
      sources: [
        { type: 'comment', id: rootComment.id },
        { type: 'comment', id: secondComment.id },
      ],
    }), /赞同票/);
    const votedState = gallery.voteForSynthesis(memberThreeClient, candidateOneId);
    const votedCandidate = votedState.syntheses.find(
      (synthesis: any) => Number(synthesis.id) === candidateOneId,
    );
    assert.equal(votedCandidate?.viewer_voted, 1);
    assert.equal(votedCandidate?.vote_count, 1);
    assert.equal(votedCandidate?.community_score, 5);
  }
  seeds.push({
    app,
    rootCommentId: Number(rootComment.id),
    secondCommentId: Number(secondComment.id),
    replyId: Number(reply.id),
    firstWinnerId: candidateOneId,
  });
}

assert.throws(() => gallery.createSynthesis({
  clientId: memberOneClient,
  targetAppId: seeds[0].app.id,
  title: 'Too many direct sources',
  content: 'A synthesis candidate must remain focused enough to inspect and compare.',
  sources: [
    { type: 'comment', id: seeds[0].rootCommentId },
    { type: 'comment', id: seeds[0].secondCommentId },
    { type: 'comment', id: seeds[0].replyId },
    { type: 'comment', id: seeds[1].rootCommentId },
  ],
}), /最多/);

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
  assert.equal(selection?.synthesis_id, seed.firstWinnerId);
  assert.equal(selection?.score, 5);
}
const firstWinner = hostState.syntheses.find((synthesis: any) => Number(synthesis.id) === seeds[0].firstWinnerId);
assert.equal(firstWinner?.community_score, 5);
assert.equal(firstWinner?.selected_for_iteration, 1);

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

for (const [index, seed] of seeds.entries()) {
  const creatorClient = `creator-${seed.app.creator_code}`;
  const started = gallery.startCommunityGeneration(
    creatorClient,
    seed.app.id,
    seed.firstWinnerId,
    index === 0 ? '' : `Implement the Host-selected first direction for App ${index + 1}.`,
  );
  if (index === 0) {
    assert.throws(
      () => gallery.returnToPreviousCommunityStage(hostClient),
      /已经开始/,
    );
    const generationInput = gallery.getCommunityGenerationInput(started.jobId);
    const selectedPrompt = hostState.syntheses.find(
      (synthesis: any) => Number(synthesis.id) === Number(seed.firstWinnerId),
    )?.content;
    assert.equal(generationInput.job.creator_instruction, selectedPrompt);
    gallery.recordCommunityGenerationProgress(started.jobId, {
      step: 'plan', order: 1, status: 'completed', title: 'Plan ready', detail: 'Use the locked direction.',
    });
  }
  gallery.completeCommunityGeneration(started.jobId, html(`App ${index + 1} Community Version 1`), 'Implemented the first locked direction.');
  gallery.publishCommunityVersion(creatorClient, seed.app.id);
}

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

for (const [index, seed] of seeds.entries()) {
  const layerTwoState = gallery.createSynthesis({
    clientId: memberTwoClient,
    targetAppId: seed.app.id,
    title: `Second-layer V1 extension ${index + 1}`,
    content: `Extend Community Version 1 of App ${index + 1} with the earlier community direction and a concrete comment.`,
    sources: [
      { type: 'synthesis', id: seed.firstWinnerId },
      { type: 'comment', id: index === 0 ? secondRoundComment.id : seed.rootCommentId },
    ],
  });
  const newCandidate = layerTwoState.syntheses.find((synthesis: any) => synthesis.title === `Second-layer V1 extension ${index + 1}`);
  assert.equal(newCandidate?.layer, 2);
}

hostState = gallery.enterCommunityDevelopmentStage(hostClient, 2);
assert.equal(hostState.study.workflow_stage, 'development_2');
assert.equal(hostState.stageSelections.filter((selection: any) => selection.iteration_number === 2).length, 6);

const targetSeed = seeds[0];
const firstSelection = hostState.stageSelections.find((selection: any) => (
  selection.app_id === targetSeed.app.id && selection.iteration_number === 1
));
hostState = gallery.returnToPreviousCommunityStage(hostClient);
assert.equal(hostState.study.workflow_stage, 'development_1');
assert.equal(hostState.stageSelections.filter((selection: any) => selection.iteration_number === 2).length, 0);
assert.equal(
  hostState.apps.find((app: any) => app.id === targetSeed.app.id)?.selected_synthesis_id,
  firstSelection?.synthesis_id,
);

hostState = gallery.enterCommunityDevelopmentStage(hostClient, 2);
const secondSelection = hostState.stageSelections.find((selection: any) => (
  selection.app_id === targetSeed.app.id && selection.iteration_number === 2
));
assert.ok(secondSelection);
const secondStarted = gallery.startCommunityGeneration(
  `creator-${targetSeed.app.creator_code}`,
  targetSeed.app.id,
  Number(secondSelection.synthesis_id),
  'Continue from Community Version 1 with the Host-selected second direction.',
);
assert.throws(
  () => gallery.returnToPreviousCommunityStage(hostClient),
  /已经开始/,
);
gallery.completeCommunityGeneration(secondStarted.jobId, html('Target Community Version 2'), 'Extended the V1 prototype.');
const targetCreatorState = gallery.publishCommunityVersion(`creator-${targetSeed.app.creator_code}`, targetSeed.app.id);
const targetVersions = targetCreatorState.versions
  .filter((version: any) => version.app_id === targetSeed.app.id && version.kind === 'community')
  .sort((left: any, right: any) => left.version_number - right.version_number);
assert.equal(targetVersions.length, 2);
assert.equal(targetVersions[1].base_version_id, targetVersions[0].id);
assert.equal(targetVersions[1].synthesis_id, secondSelection.synthesis_id);

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

const keepFixture = process.env.KEEP_COMMUNITY_GALLERY_TEST_DB === '1';
if (!keepFixture) {
  hostState = gallery.closeAsyncCommunityStudy(hostClient);
  assert.equal(hostState.study.status, 'closed');
  const nextState = gallery.startNewAsyncCommunityStudy(hostClient);
  assert.equal(nextState.study.status, 'setup');
  assert.equal(nextState.apps.length, 0);
}

console.log('Community gallery test passed: asynchronous publishing, reply provenance, basket-based cross-App sources, Host scoring/selection, gated V1/V2 development, and fixed V2 lineage.');
if (keepFixture) console.log(`QA fixture database: ${process.env.STUDY_DB_PATH}`);
db.close();
if (!keepFixture) fs.rmSync(testDir, { recursive: true, force: true });
