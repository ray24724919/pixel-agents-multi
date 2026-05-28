import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPauseResumeMessage,
  isPausedStatus,
  pauseActionLabel,
} from '../src/components/pauseResume.ts';

test('paused lifecycle status is recognized by Agent Center helpers', () => {
  assert.equal(isPausedStatus('paused'), true);
  assert.equal(isPausedStatus('thinking'), false);
});

test('pause action label changes to resume for paused agents', () => {
  assert.equal(pauseActionLabel(false), 'Pause');
  assert.equal(pauseActionLabel(true), 'Resume');
});

test('pause message is emitted for running agents', () => {
  assert.deepEqual(buildPauseResumeMessage(7, false), { type: 'agentPause', id: 7 });
});

test('resume message is emitted for paused agents', () => {
  assert.deepEqual(buildPauseResumeMessage(7, true), { type: 'agentResume', id: 7 });
});
