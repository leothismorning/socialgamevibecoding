import assert from 'node:assert/strict';
import {
  addComment,
  createExperiment,
  db,
  joinStudy,
  selectParticipantNumber,
  setPhase,
} from '../server/studyDb.js';

createExperiment({
  title: 'Participant number selection test',
  brief: '',
  creatorName: 'Creator',
  initialCode: '<!doctype html><html><body>test</body></html>',
  initialPrompt: '',
  maxRounds: 3,
});

assert.equal(joinStudy('browser-a').viewerParticipantCode, 'P01');
assert.equal(joinStudy('browser-b').viewerParticipantCode, 'P02');

let state = selectParticipantNumber('browser-a', 'P03');
assert.equal(state.viewerParticipantCode, 'P03');
assert.equal(state.participants.find((participant) => participant.code === 'P01')?.joined_at, null);
assert.ok(state.participants.find((participant) => participant.code === 'P03')?.joined_at);
assert.equal(joinStudy('browser-a').viewerParticipantCode, 'P03');

assert.throws(
  () => selectParticipantNumber('browser-a', 'P02'),
  /P02 is already in use/i,
);

assert.equal(joinStudy('browser-c').viewerParticipantCode, 'P01');

setPhase('commenting');
addComment('P03', 'This activity locks the participant number.');
assert.throws(
  () => selectParticipantNumber('browser-a', 'P04'),
  /participant number is locked/i,
);

db.close();
console.log('Participant number selection checks passed.');
