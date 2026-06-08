import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type AgentLifecycleStatus,
  lifecycleStatusDrivesOfficeWork,
  lifecycleStatusStopsOfficeWork,
  resolveRestoredAgentInitialActive,
} from '../src/hooks/useExtensionMessages.ts';

test('only active lifecycle states drive office work animation', () => {
  const statuses: AgentLifecycleStatus[] = [
    'idle',
    'thinking',
    'tool_running',
    'waiting_user',
    'waiting_permission',
    'paused',
    'completed',
    'error',
  ];

  const activeStatuses = statuses.filter(lifecycleStatusDrivesOfficeWork);

  assert.deepEqual(activeStatuses, ['thinking', 'tool_running']);
});

test('waiting and paused lifecycle states stop office work animation', () => {
  const statuses: AgentLifecycleStatus[] = [
    'idle',
    'thinking',
    'tool_running',
    'waiting_user',
    'waiting_permission',
    'paused',
    'completed',
    'error',
  ];

  const stoppedStatuses = statuses.filter(lifecycleStatusStopsOfficeWork);

  assert.deepEqual(stoppedStatuses, [
    'idle',
    'waiting_user',
    'waiting_permission',
    'paused',
    'completed',
    'error',
  ]);
});

test('latest office activity overrides restored idle defaults', () => {
  assert.equal(resolveRestoredAgentInitialActive(false, { active: true }), true);
  assert.equal(resolveRestoredAgentInitialActive(true, { active: false }), false);
  assert.equal(resolveRestoredAgentInitialActive(false, undefined), false);
});
