import assert from 'node:assert/strict';
import test from 'node:test';

import type { TimelinePageItem } from '../src/components/timelinePageModel.ts';
import {
  buildTimelineReplaySessions,
  deriveTimelineReplayStatus,
  getTimelineReplayState,
} from '../src/components/timelineReplayModel.ts';

function item(overrides: Partial<TimelinePageItem>): TimelinePageItem {
  return {
    id: 'event-1',
    agentId: 1,
    agentName: 'Codex Alpha',
    providerId: 'codex',
    project: 'pixel-agents',
    timestamp: 100,
    title: 'Tool started',
    severity: 'info',
    kind: 'tool.started',
    source: 'tool',
    category: 'tool',
    isActionLike: false,
    isDelegationLike: false,
    ...overrides,
  };
}

test('timeline replay sessions group by agent provider project session and run', () => {
  const sessions = buildTimelineReplaySessions([
    item({ id: 's1-late', timestamp: 300, sessionId: 'session-1', runId: 'run-a' }),
    item({ id: 's2', timestamp: 250, sessionId: 'session-2', runId: 'run-a' }),
    item({ id: 's1-early', timestamp: 100, sessionId: 'session-1', runId: 'run-a' }),
    item({
      id: 'different-run',
      timestamp: 200,
      sessionId: 'session-1',
      runId: 'run-b',
    }),
  ]);

  assert.equal(sessions.length, 3);
  const firstSession = sessions.find(
    (session) => session.sessionId === 'session-1' && session.runId === 'run-a',
  );
  assert.deepEqual(
    firstSession?.frames.map((frame) => frame.event.id),
    ['s1-early', 's1-late'],
  );
  assert.equal(firstSession?.startedAt, 100);
  assert.equal(firstSession?.endedAt, 300);
});

test('timeline replay state exposes cursor progress and previous next availability', () => {
  const [session] = buildTimelineReplaySessions([
    item({ id: 'first', timestamp: 100, sessionId: 'session-1' }),
    item({ id: 'second', timestamp: 200, sessionId: 'session-1', kind: 'tool.completed' }),
    item({
      id: 'third',
      timestamp: 300,
      sessionId: 'session-1',
      kind: 'run.completed',
      category: 'run',
    }),
  ]);

  const state = getTimelineReplayState(session, 1);

  assert.equal(state.currentFrame?.event.id, 'second');
  assert.equal(state.hasPrevious, true);
  assert.equal(state.hasNext, true);
  assert.equal(state.progress, 0.5);
  assert.equal(state.progressLabel, '2 / 3');
  assert.equal(state.kind, 'tool.completed');
});

test('timeline replay derives lifecycle state from safe statusAfter before kind fallback', () => {
  const explicit = item({
    statusAfter: 'waiting_user',
    kind: 'run.completed',
    category: 'run',
  });

  assert.equal(deriveTimelineReplayStatus(explicit), 'waiting_user');
});

test('timeline replay reconstructs status from event kind and category fallbacks', () => {
  assert.equal(deriveTimelineReplayStatus(item({ kind: 'tool.started' })), 'tool_running');
  assert.equal(
    deriveTimelineReplayStatus(
      item({ kind: 'permission.requested', category: 'permission', severity: 'warning' }),
    ),
    'waiting_permission',
  );
  assert.equal(
    deriveTimelineReplayStatus(item({ kind: 'run.failed', category: 'run', severity: 'error' })),
    'error',
  );
  assert.equal(
    deriveTimelineReplayStatus(item({ kind: 'delegation.completed', category: 'delegation' })),
    'completed',
  );
  assert.equal(
    deriveTimelineReplayStatus(item({ kind: 'delegation.progress', category: 'delegation' })),
    'tool_running',
  );
});
