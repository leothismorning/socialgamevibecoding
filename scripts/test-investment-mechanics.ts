import assert from 'node:assert/strict';

assert(
  process.env.STUDY_DB_PATH && /test/i.test(process.env.STUDY_DB_PATH),
  'Set STUDY_DB_PATH to an isolated test database before running this script.',
);

const {
  addComment,
  createExperiment,
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

function participant(state: ReturnType<typeof getStudyState>, code: string) {
  const row = state.participants.find((item: any) => item.code === code) as any;
  assert(row, `Missing participant ${code}`);
  return row;
}

function idea(state: ReturnType<typeof getStudyState>, code: string) {
  const row = state.comments.find((item: any) => item.participant_code === code) as any;
  assert(row, `Missing idea from ${code}`);
  return row;
}

function expectError(run: () => unknown, message: string) {
  assert.throws(run, (error: any) => String(error?.message || '').includes(message));
}

createExperiment({
  title: 'Investment Mechanics Test',
  brief: 'Temporary integration test',
  creatorName: 'Creator',
  initialCode: '<!doctype html><h1>Test</h1>',
  initialPrompt: 'test',
  maxRounds: 4,
});
for (const code of ['P01', 'P02', 'P03', 'P04', 'P05']) joinStudy(code);
setPhase('commenting');

let state = addComment('P01', 'Idea from P01');
assert.equal(participant(state, 'P01').coins, 100);
assert.equal(state.comments.filter((item: any) => item.participant_code === 'P01').length, 1);

state = addComment('P01', 'Updated Idea from P01');
assert.equal(participant(state, 'P01').coins, 100);
assert.equal(idea(state, 'P01').content, 'Updated Idea from P01');

state = deleteComment('P01');
assert.equal(state.comments.filter((item: any) => item.participant_code === 'P01').length, 0);
assert.equal(participant(state, 'P01').coins, 100);

state = addComment('P01', 'Restored Idea from P01');
assert.equal(participant(state, 'P01').coins, 100);
for (const code of ['P02', 'P03', 'P04', 'P05']) addComment(code, `Idea from ${code}`);

state = setPhase('investing');
for (const code of ['P01', 'P02', 'P03', 'P04', 'P05']) assert.equal(participant(state, code).coins, 100);
assert.equal(state.experiment?.creator_coins, 200);

const p01Idea = idea(state, 'P01');
const p02Idea = idea(state, 'P02');
const p03Idea = idea(state, 'P03');
const p04Idea = idea(state, 'P04');
const p05Idea = idea(state, 'P05');

const privateState = filterStudyStateForViewer(state, { role: 'participant', participantCode: 'P01' });
assert.equal(privateState.marketPrivacyActive, true);
assert(privateState.comments.every((item: any) => item.invested === 0));
assert(privateState.comments.every((item: any) => ['YOU', 'ANONYMOUS'].includes(item.participant_code)));
assert.equal(privateState.comments.filter((item: any) => item.is_own).length, 1);
const repeatedPrivateState = filterStudyStateForViewer(getStudyState(), { role: 'participant', participantCode: 'P01' });
assert.deepEqual(
  repeatedPrivateState.comments.map((item: any) => item.id),
  privateState.comments.map((item: any) => item.id),
);

expectError(() => investCoins('participant', 'P01', p01Idea.id, 10), 'own comment');
expectError(() => investCoins('participant', 'P01', p02Idea.id, 15), '10, 20, 30, 40, or 50');
expectError(() => investCoins('participant', 'P01', p02Idea.id, 60), '10, 20, 30, 40, or 50');

investCoins('participant', 'P01', p02Idea.id, 50);
investCoins('participant', 'P01', p03Idea.id, 40);
investCoins('participant', 'P01', p04Idea.id, 10);

investCoins('participant', 'P02', p01Idea.id, 50);
investCoins('participant', 'P02', p03Idea.id, 40);

investCoins('participant', 'P03', p01Idea.id, 50);
investCoins('participant', 'P03', p02Idea.id, 40);

investCoins('participant', 'P04', p01Idea.id, 50);
investCoins('participant', 'P04', p02Idea.id, 40);
investCoins('participant', 'P04', p03Idea.id, 10);

investCoins('participant', 'P05', p01Idea.id, 50);
investCoins('participant', 'P05', p02Idea.id, 40);
investCoins('participant', 'P05', p03Idea.id, 10);

const p01AfterInvesting = filterStudyStateForViewer(getStudyState(), { role: 'participant', participantCode: 'P01' });
assert(p01AfterInvesting.investments.every((item: any) => item.participant_code === 'P01'));
assert(p01AfterInvesting.comments.every((item: any) => item.invested === 0));

state = selectTopIdeas();
assert.deepEqual(
  state.selectedIdeas.filter((item: any) => item.round_number === 1).map((item: any) => item.participant_code),
  ['P01', 'P02', 'P03'],
);
assert.equal(participant(state, 'P01').coins, 232);
assert.equal(participant(state, 'P02').coins, 226);
assert.equal(participant(state, 'P03').coins, 210);
assert.equal(participant(state, 'P04').coins, 165);
assert.equal(participant(state, 'P05').coins, 163);
assert(state.coinEvents.some((event: any) => event.reason === 'idea_support_reward'));
assert(state.coinEvents.some((event: any) => event.reason === 'idea_rank_bonus'));
assert(state.coinEvents.some((event: any) => event.reason === 'investment_return'));
assert.equal(state.marketPrivacyActive, false);
assert.equal(idea(state, 'P01').invested, 200);

state = rollbackPhase();
assert.equal(state.experiment?.phase, 'investing');
assert.equal(participant(state, 'P01').coins, 0);
assert.equal(participant(state, 'P02').coins, 10);
assert.equal(participant(state, 'P03').coins, 10);
assert.equal(participant(state, 'P04').coins, 0);
assert.equal(participant(state, 'P05').coins, 0);
assert.equal(state.selectedIdeas.filter((item: any) => item.round_number === 1).length, 0);

state = selectTopIdeas();
assert.equal(participant(state, 'P01').coins, 232);
assert.equal(participant(state, 'P02').coins, 226);

const p01RevisionActions = state.ideaRevisions
  .filter((revision: any) => revision.participant_code === 'P01')
  .map((revision: any) => revision.action);
assert.deepEqual(p01RevisionActions, ['create', 'update', 'delete', 'restore']);

setPhase('previewing');
startNextRound();
setPhase('commenting');
for (const code of ['P01', 'P02', 'P03', 'P04', 'P05']) addComment(code, `Round 2 Idea from ${code}`);
state = setPhase('investing');
assert.equal(participant(state, 'P01').coins, 332);

const roundTwoIdeas = new Map(
  state.comments
    .filter((item: any) => item.round_number === 2)
    .map((item: any) => [item.participant_code, item]),
);
investCoins('participant', 'P01', (roundTwoIdeas.get('P02') as any).id, 50);
investCoins('participant', 'P01', (roundTwoIdeas.get('P03') as any).id, 50);
investCoins('participant', 'P01', (roundTwoIdeas.get('P04') as any).id, 50);
expectError(
  () => investCoins('participant', 'P01', (roundTwoIdeas.get('P05') as any).id, 10),
  'at most 150 coins per round',
);

expectError(() => selectTopIdeas(), 'Tie detected');
state = getStudyState();
assert.equal(
  Number((state.rounds.find((round: any) => round.round_number === 2) as any)?.investment_locked_v3 || 0),
  1,
);
assert.equal(
  filterStudyStateForViewer(state, { role: 'participant', participantCode: 'P02' }).marketPrivacyActive,
  false,
);
expectError(
  () => investCoins('participant', 'P02', (roundTwoIdeas.get('P01') as any).id, 10),
  'market is locked',
);

rollbackPhase();
state = setPhase('ended');
assert(state.leaderboard.length === 5);
assert(state.leaderboard.every((entry: any, index: number, rows: any[]) => index === 0 || rows[index - 1].coins >= entry.coins));
assert.equal(state.leaderboard[0].participant_code, 'P01');

console.log(
  JSON.stringify({
    status: 'passed',
    finalLeader: state.leaderboard[0],
    revisionActions: p01RevisionActions,
    roundOneTopThree: state.selectedIdeas
      .filter((item: any) => item.round_number === 1)
      .map((item: any) => item.participant_code),
  }),
);
