import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldRetainTimelineEventAfterAgentRemoval } from '../src/hooks/timelineRetention.ts';

test('agent removal retains action timeline events for supervisor history', () => {
  assert.equal(shouldRetainTimelineEventAfterAgentRemoval('action.hide'), true);
  assert.equal(shouldRetainTimelineEventAfterAgentRemoval('action.archive'), true);
  assert.equal(shouldRetainTimelineEventAfterAgentRemoval('action.kill'), true);
  assert.equal(shouldRetainTimelineEventAfterAgentRemoval('delegation.started'), true);
  assert.equal(shouldRetainTimelineEventAfterAgentRemoval('delegation.completed'), true);
  assert.equal(shouldRetainTimelineEventAfterAgentRemoval('delegation.failed'), true);
  assert.equal(shouldRetainTimelineEventAfterAgentRemoval('tool.started'), false);
});
