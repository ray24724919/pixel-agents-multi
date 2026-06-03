import assert from 'node:assert/strict';
import test from 'node:test';

import type { TimelinePageItem } from '../src/components/timelinePageModel.ts';
import {
  buildTimelineReplaySessions,
  deriveTimelineReplayStatus,
  findTimelineReplayFrameByEventId,
  getTimelineReplayFrameMarker,
  getTimelineReplayState,
  resolveTimelineReplaySelection,
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

test('timeline replay finds the matching session and frame by event id', () => {
  const sessions = buildTimelineReplaySessions([
    item({ id: 'first', timestamp: 100, sessionId: 'session-1' }),
    item({ id: 'target', timestamp: 200, sessionId: 'session-2' }),
    item({ id: 'after-target', timestamp: 300, sessionId: 'session-2' }),
  ]);

  const location = findTimelineReplayFrameByEventId(sessions, 'target');

  assert.equal(location?.frame.event.id, 'target');
  assert.equal(location?.frame.index, 0);
  assert.equal(location?.cursorIndex, 0);
  assert.equal(location?.sessionId.includes('session:session-2'), true);
});

test('timeline replay selection reports filtered-out sessions without crashing', () => {
  const sessions = buildTimelineReplaySessions([
    item({ id: 'visible', timestamp: 100, sessionId: 'visible-session' }),
  ]);

  const state = resolveTimelineReplaySelection(sessions, 'filtered-session', 4);

  assert.equal(state.currentFrame, undefined);
  assert.equal(state.cursorIndex, 0);
  assert.equal(state.unavailableReason, 'session-filtered-out');
  assert.equal(state.hasNext, false);
});

test('timeline replay handles single-frame sessions', () => {
  const [session] = buildTimelineReplaySessions([
    item({ id: 'only', timestamp: 100, sessionId: 'session-1' }),
  ]);

  const state = getTimelineReplayState(session, 99);

  assert.equal(state.currentFrame?.event.id, 'only');
  assert.equal(state.progress, 1);
  assert.equal(state.progressLabel, '1 / 1');
  assert.equal(state.hasPrevious, false);
  assert.equal(state.hasNext, false);
  assert.equal(state.isSingleFrame, true);
});

test('timeline replay marker identifies the current replay frame', () => {
  const [session] = buildTimelineReplaySessions([
    item({ id: 'first', timestamp: 100, sessionId: 'session-1' }),
    item({ id: 'current', timestamp: 200, sessionId: 'session-1', severity: 'warning' }),
  ]);
  const state = getTimelineReplayState(session, 1);

  const currentMarker = getTimelineReplayFrameMarker(session!.frames[1]!.event, state);
  const otherMarker = getTimelineReplayFrameMarker(session!.frames[0]!.event, state);

  assert.equal(currentMarker.isCurrent, true);
  assert.equal(currentMarker.label, 'Replay frame 2 / 2');
  assert.equal(currentMarker.severity, 'warning');
  assert.equal(otherMarker.isCurrent, false);
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
