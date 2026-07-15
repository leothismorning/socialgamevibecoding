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
  leaveStudy,
  selectTopIdeas,
  setPhase,
} = await import('../server/studyDb.js');

function participantCoins(code: string) {
  const participant = getStudyState().participants.find((item: any) => item.code === code) as any;
  assert(participant, `Missing participant ${code}`);
  return Number(participant.coins);
}

function commentByAuthor(code: string) {
  const comment = getStudyState().comments.find((item: any) => item.participant_code === code) as any;
  assert(comment, `Missing comment from ${code}`);
  return comment;
}

function expectError(run: () => unknown, message: string) {
  assert.throws(run, (error: any) => String(error?.message || '').includes(message));
}

createExperiment({
  title: 'Room and Vote Test',
  brief: 'Temporary integration test',
  creatorName: 'Creator',
  initialCode: '<!doctype html><h1>Test</h1>',
  initialPrompt: 'test',
  maxRounds: 3,
});

const codes = Array.from({ length: 13 }, (_, index) => joinStudy(`vote-client-${index + 1}`).viewerParticipantCode!);
assert.deepEqual(codes, Array.from({ length: 13 }, (_, index) => `P${index + 1}`));
expectError(() => setPhase('commenting'), 'At least 15 people including the Host');

const p14 = joinStudy('vote-client-14').viewerParticipantCode!;
assert.equal(p14, 'P14');
assert.equal(joinStudy('vote-client-1').viewerParticipantCode, 'P1', 'refresh/reconnect must retain the original seat');

leaveStudy('vote-client-14');
assert.equal(joinStudy('replacement-client').viewerParticipantCode, 'P14', 'a released seat should become available again');
for (let index = 15; index <= 19; index += 1) joinStudy(`vote-client-${index}`);
assert.equal(getStudyState().participants.filter((participant: any) => participant.joined_at).length, 19);
expectError(() => joinStudy('overflow-client'), 'room is full');

setPhase('commenting');
addComment('P1', 'Idea from P1');
addComment('P2', 'Idea from P2');
addComment('P3', 'Idea from P3');
for (let index = 4; index <= 19; index += 1) addComment(`P${index}`, `Idea from P${index}`);
setPhase('investing');

const p1Idea = commentByAuthor('P1');
const p2Idea = commentByAuthor('P2');
const p3Idea = commentByAuthor('P3');

investCoins('participant', 'P1', p2Idea.id, 20);
assert.equal(participantCoins('P1'), 80);
assert.equal(commentByAuthor('P2').investor_count, 1);
expectError(() => investCoins('participant', 'P1', p2Idea.id, 20), 'already voted');
assert.equal(participantCoins('P1'), 80, 'a duplicate request must not deduct coins twice');

investCoins('participant', 'P1', p2Idea.id, 0);
assert.equal(participantCoins('P1'), 100);
assert.equal(commentByAuthor('P2').investor_count, 0);
expectError(() => investCoins('participant', 'P1', p2Idea.id, 0), 'changed elsewhere');

for (const voter of ['P1', 'P3', 'P4']) investCoins('participant', voter, p2Idea.id, 20);
for (const voter of ['P2', 'P5']) investCoins('participant', voter, p1Idea.id, 20);
investCoins('participant', 'P6', p3Idea.id, 20);

const ranked = [...getStudyState().comments].sort(
  (a: any, b: any) => Number(b.investor_count) - Number(a.investor_count),
).slice(0, 3);
assert.deepEqual(ranked.map((comment: any) => comment.investor_count), [3, 2, 1]);
assert.deepEqual(ranked.map((comment: any) => comment.participant_code), ['P2', 'P1', 'P3']);

const selected = selectTopIdeas();
assert.deepEqual(
  selected.selectedIdeas.filter((idea: any) => idea.round_number === 1).map((idea: any) => idea.participant_code),
  ['P2', 'P1', 'P3'],
  'selection must use vote count, not invested coin totals',
);

console.log(JSON.stringify({
  status: 'passed',
  roomOccupancy: 20,
  ranks: ranked.map((comment: any) => ({ author: comment.participant_code, votes: comment.investor_count })),
  reconnectSeat: 'P1',
  releasedAndReusedSeat: 'P14',
}));

db.close();
