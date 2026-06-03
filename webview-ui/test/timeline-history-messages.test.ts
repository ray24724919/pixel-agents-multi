import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeTimelineEventsById,
  timelineEventForPersistence,
  timelineEventsFromHistoryLoadedMessage,
  timelineHistoryStateFromLoadedMessage,
} from '../src/hooks/timelineHistoryMessages.ts';
import type { AgentTimelineEvent } from '../src/hooks/useExtensionMessages.ts';

function event(overrides: Partial<AgentTimelineEvent>): AgentTimelineEvent {
  return {
    id: 'event-1',
    agentId: 1,
    timestamp: 100,
    kind: 'tool.started',
    title: 'Tool started',
    visibility: 'default',
    ...overrides,
  };
}

test('timeline history loaded messages normalize safe persisted events', () => {
  const events = timelineEventsFromHistoryLoadedMessage({
    type: 'timelineHistoryLoaded',
    loadedAtMs: 1234,
    records: [
      {
        schemaVersion: 1,
        id: 'persisted-1',
        agentId: 2,
        providerId: 'claude',
        projectName: 'docs',
        sessionId: 'session-1',
        runId: 'W8-A',
        timestamp: 500,
        kind: 'delegation.started',
        title: 'Delegation started',
        summary: 'Claude supervisor #2 / 1 worker',
        statusAfter: 'tool_running',
        severity: 'info',
        source: 'agent',
        visibility: 'default',
        payload: { rawPrompt: 'do not keep' },
      },
      { id: 'invalid' },
    ],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, 'persisted-1');
  assert.equal(events[0]?.providerId, 'claude');
  assert.equal(events[0]?.statusAfter, 'tool_running');
  assert.equal('payload' in events[0]!, false);
  assert.doesNotMatch(JSON.stringify(events[0]), /rawPrompt|do not keep/);
});

test('timeline history merge deduplicates by id and keeps newest first', () => {
  const merged = mergeTimelineEventsById(
    [
      event({ id: 'same', timestamp: 100, title: 'Old same' }),
      event({ id: 'old', timestamp: 50, title: 'Old' }),
    ],
    [
      event({ id: 'new', timestamp: 300, title: 'New' }),
      event({ id: 'same', timestamp: 200, title: 'New same' }),
    ],
    2,
  );

  assert.deepEqual(
    merged.map((item) => [item.id, item.title]),
    [
      ['new', 'New'],
      ['same', 'New same'],
    ],
  );
});

test('timeline event persistence helper drops payload and invalid fields', () => {
  const persisted = timelineEventForPersistence(
    event({
      id: 'persist-me',
      agentId: 3,
      timestamp: 700,
      kind: 'action.kill',
      title: 'Agent killed',
      severity: 'warning',
      source: 'user',
      payload: { rawToolOutput: 'secret' },
    }),
  );

  assert.equal(persisted?.id, 'persist-me');
  assert.equal(persisted?.severity, 'warning');
  assert.equal('payload' in persisted!, false);
  assert.doesNotMatch(JSON.stringify(persisted), /rawToolOutput|secret/);
});

test('timeline history state tracks loaded metadata and valid persisted record count', () => {
  const state = timelineHistoryStateFromLoadedMessage({
    type: 'timelineHistoryLoaded',
    loadedAtMs: 900,
    unavailable: true,
    error: 'read failed',
    records: [
      event({ id: 'valid-1', timestamp: 200 }),
      { id: 'invalid', timestamp: 300 },
      event({ id: 'valid-2', timestamp: 100 }),
    ],
  });

  assert.equal(state.loadedAtMs, 900);
  assert.equal(state.unavailable, true);
  assert.equal(state.error, 'read failed');
  assert.equal(state.persistedRecordCount, 2);
});
