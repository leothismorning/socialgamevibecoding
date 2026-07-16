import assert from 'node:assert/strict';
import {
  createExperiment,
  db,
  joinStudy,
  leaveStudy,
} from '../server/studyDb.js';

createExperiment({
  title: 'Automatic participant allocation test',
  brief: '',
  creatorName: 'Creator',
  initialCode: '<!doctype html><html><body>test</body></html>',
  initialPrompt: '',
  maxRounds: 3,
});

const assignedCodes: string[] = [];
for (let index = 1; index <= 20; index += 1) {
  const state = joinStudy(`browser-client-${String(index).padStart(2, '0')}`);
  assignedCodes.push(String(state.viewerParticipantCode));
}

assert.deepEqual(
  assignedCodes,
  Array.from({ length: 20 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`),
);

assert.equal(joinStudy('browser-client-01').viewerParticipantCode, 'P01');
leaveStudy('browser-client-01');
assert.equal(joinStudy('browser-client-01').viewerParticipantCode, 'P01');

assert.throws(
  () => joinStudy('browser-client-21'),
  /maximum of 20 participants/i,
);

db.close();
console.log('Automatic participant allocation checks passed.');
