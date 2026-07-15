import assert from 'node:assert/strict';

assert(
  process.env.STUDY_DB_PATH && /test/i.test(process.env.STUDY_DB_PATH),
  'Set STUDY_DB_PATH to an isolated test database before running this script.',
);

const {
  addComment,
  createExperiment,
  db,
  getStudyState,
  investCoins,
  joinStudy,
  setPhase,
} = await import('../server/studyDb.js');

function participantCoins(code: string) {
  const participant = getStudyState().participants.find((item: any) => item.code === code) as any;
  assert(participant, `Missing participant ${code}`);
  return Number(participant.coins);
}

function investmentAmount(code: string, commentId: number) {
  const investment = getStudyState().investments.find(
    (item: any) => item.participant_code === code && item.comment_id === commentId,
  ) as any;
  return Number(investment?.amount || 0);
}

function expectError(run: () => unknown, message: string) {
  assert.throws(run, (error: any) => String(error?.message || '').includes(message));
}

createExperiment({
  title: 'Coin Reaction Test',
  brief: 'Temporary integration test',
  creatorName: 'Creator',
  initialCode: '<!doctype html><h1>Test</h1>',
  initialPrompt: 'test',
  maxRounds: 3,
});

const p1 = joinStudy('reaction-client-1').viewerParticipantCode!;
const p2 = joinStudy('reaction-client-2').viewerParticipantCode!;
const p3 = joinStudy('reaction-client-3').viewerParticipantCode!;
assert.deepEqual([p1, p2, p3], ['P1', 'P2', 'P3']);

setPhase('commenting');
addComment(p1, 'Idea from P1');
const p2State = addComment(p2, 'Idea from P2');
addComment(p3, 'Idea from P3');
const p2Idea = p2State.comments.find((comment: any) => comment.participant_code === p2) as any;
const p3Idea = getStudyState().comments.find((comment: any) => comment.participant_code === p3) as any;
assert(p2Idea && p3Idea);
setPhase('investing');

for (const amount of [20, 40, 60, 80, 100]) {
  investCoins('participant', p1, p2Idea.id, amount);
  assert.equal(investmentAmount(p1, p2Idea.id), amount);
  assert.equal(participantCoins(p1), 100 - amount);
}

investCoins('participant', p1, p2Idea.id, 0);
assert.equal(investmentAmount(p1, p2Idea.id), 0);
assert.equal(participantCoins(p1), 100);

const reconnect = joinStudy('reaction-client-1');
assert.equal(reconnect.viewerParticipantCode, p1);
assert.equal(participantCoins(p1), 100);

investCoins('participant', p1, p2Idea.id, 20);
expectError(() => investCoins('participant', p1, p2Idea.id, 20), 'next valid reaction is 40');
assert.equal(investmentAmount(p1, p2Idea.id), 20);
assert.equal(participantCoins(p1), 80);

for (const amount of [40, 60, 80, 100]) investCoins('participant', p1, p2Idea.id, amount);
assert.equal(participantCoins(p1), 0);
expectError(() => investCoins('participant', p1, p3Idea.id, 20), 'Not enough coins');
assert.equal(investmentAmount(p1, p3Idea.id), 0);

investCoins('participant', p1, p2Idea.id, 0);
assert.equal(participantCoins(p1), 100);
assert.equal(investmentAmount(p1, p2Idea.id), 0);

console.log(JSON.stringify({
  status: 'passed',
  levels: [20, 40, 60, 80, 100, 0],
  reconnectedAs: reconnect.viewerParticipantCode,
  finalCoins: participantCoins(p1),
}));

db.close();
