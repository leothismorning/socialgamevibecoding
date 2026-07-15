import assert from 'node:assert/strict';

assert(
  process.env.STUDY_DB_PATH && /test/i.test(process.env.STUDY_DB_PATH),
  'Set STUDY_DB_PATH to an isolated test database before running this script.',
);

const {
  addComment,
  createExperiment,
  db,
  deleteComment,
  filterStudyStateForViewer,
  getStudyState,
  investCoins,
  joinStudy,
  rollbackPhase,
  selectTopIdeas,
  setPhase,
  startNextRound,
} = await import('../server/studyDb.js');

function comment(code: string) {
  const item = getStudyState().comments.find((row: any) => row.participant_code === code) as any;
  assert(item, `Missing comment from ${code}`);
  return item;
}

createExperiment({
  title: 'Investment Mechanics Test',
  brief: 'Temporary integration test',
  creatorName: 'Creator',
  initialCode: '<!doctype html><h1>Test</h1>',
  initialPrompt: 'test',
  maxRounds: 4,
});

for (let index = 1; index <= 14; index += 1) {
  assert.equal(joinStudy(`mechanics-client-${index}`).viewerParticipantCode, `P${index}`);
}
setPhase('commenting');

addComment('P1', 'Idea from P1');
addComment('P1', 'Updated idea from P1');
assert.equal(comment('P1').content, 'Updated idea from P1');
deleteComment('P1');
assert.equal(getStudyState().comments.some((row: any) => row.participant_code === 'P1'), false);
addComment('P1', 'Restored idea from P1');
for (let index = 2; index <= 6; index += 1) addComment(`P${index}`, `Idea from P${index}`);

setPhase('investing');
const p1Idea = comment('P1');
const p2Idea = comment('P2');
const p3Idea = comment('P3');

for (const voter of ['P1', 'P3', 'P4']) investCoins('participant', voter, p2Idea.id, 20);
for (const voter of ['P2', 'P5']) investCoins('participant', voter, p1Idea.id, 20);
investCoins('participant', 'P6', p3Idea.id, 20);

const viewerState = filterStudyStateForViewer(getStudyState(), { role: 'participant', participantCode: 'P1' });
assert.equal(viewerState.marketPrivacyActive, false);
assert(viewerState.comments.every((row: any) => row.participant_code !== 'ANONYMOUS'));
assert.equal(comment('P2').investor_count, 3);
assert(viewerState.investments.every((row: any) => row.participant_code === 'P1'));

let state = selectTopIdeas();
assert.deepEqual(
  state.selectedIdeas.filter((idea: any) => idea.round_number === 1).map((idea: any) => idea.participant_code),
  ['P2', 'P1', 'P3'],
);
assert(state.coinEvents.some((event: any) => event.reason === 'investment_return'));

state = rollbackPhase();
assert.equal(state.experiment?.phase, 'investing');
assert.equal(state.selectedIdeas.filter((idea: any) => idea.round_number === 1).length, 0);
state = selectTopIdeas();
assert.deepEqual(
  state.selectedIdeas.filter((idea: any) => idea.round_number === 1).map((idea: any) => idea.participant_code),
  ['P2', 'P1', 'P3'],
  're-locking after rollback must preserve vote ranking',
);

setPhase('previewing');
startNextRound();
assert.equal(getStudyState().experiment?.current_round, 2);
setPhase('commenting');
setPhase('ended');
assert.equal(getStudyState().leaderboard.length, 14);

console.log(JSON.stringify({
  status: 'passed',
  roundOneTopThree: ['P2', 'P1', 'P3'],
  publicVoteCount: comment('P2').investor_count,
  revisionFlow: ['create', 'update', 'delete', 'restore'],
}));

db.close();
