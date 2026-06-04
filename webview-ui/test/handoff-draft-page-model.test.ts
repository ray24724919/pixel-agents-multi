import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHandoffDraftPageModel } from '../src/components/handoffDraftPageModel.ts';
import type { TimelinePageItem } from '../src/components/timelinePageModel.ts';
import {
  buildTimelineReplaySessions,
  getTimelineReplayState,
} from '../src/components/timelineReplayModel.ts';

function item(overrides: Partial<TimelinePageItem> = {}): TimelinePageItem {
  return {
    id: 'event-1',
    agentId: 3,
    agentName: 'Codex Lead',
    providerId: 'codex',
    project: 'pixel-agents',
    timestamp: 100,
    title: 'Tool started',
    summary: 'Safe normalized event',
    severity: 'info',
    kind: 'tool.started',
    source: 'tool',
    statusAfter: 'tool_running',
    sessionId: 'session-a',
    runId: 'run-a',
    category: 'tool',
    isActionLike: false,
    isDelegationLike: false,
    ...overrides,
  };
}

test('handoff page model prefers the selected replay session over filtered timeline events', () => {
  const replayEvents = [
    item({ id: 'replay-start', timestamp: 100, sessionId: 'session-a' }),
    item({
      id: 'replay-end',
      timestamp: 200,
      sessionId: 'session-a',
      title: 'Run completed',
      kind: 'run.completed',
      category: 'run',
      statusAfter: 'completed',
    }),
  ];
  const [session] = buildTimelineReplaySessions(replayEvents);
  const state = getTimelineReplayState(session, 1);
  const model = buildHandoffDraftPageModel({
    replayState: state,
    timelineEvents: [
      ...replayEvents,
      item({ id: 'filtered-other', timestamp: 300, sessionId: 'session-b' }),
    ],
  });

  assert.equal(model.source, 'replay-session');
  assert.equal(model.canCreate, true);
  assert.equal(model.notice, undefined);
  assert.equal(model.draft?.metadata.eventCount, 2);
  assert.deepEqual(model.draft?.metadata.importantEventIds, ['replay-end']);
  assert.match(model.sourceDetail, /2 events/);
});

test('handoff page model falls back to the current Timeline filtered scope', () => {
  const model = buildHandoffDraftPageModel({
    replayState: getTimelineReplayState(undefined, 0),
    timelineEvents: [
      item({ id: 'filtered-a', timestamp: 100 }),
      item({ id: 'filtered-b', timestamp: 200, severity: 'warning' }),
    ],
  });

  assert.equal(model.source, 'timeline-filtered');
  assert.equal(model.canCreate, true);
  assert.equal(model.notice, 'no-replay-session-selected');
  assert.equal(model.draft?.metadata.eventCount, 2);
  assert.match(model.draft?.markdown ?? '', /Timeline filtered scope/);
});

test('handoff page model disables creation when no timeline events are available', () => {
  const model = buildHandoffDraftPageModel({
    replayState: getTimelineReplayState(undefined, 0),
    timelineEvents: [],
  });

  assert.equal(model.source, 'none');
  assert.equal(model.canCreate, false);
  assert.equal(model.notice, 'no-timeline-events');
  assert.equal(model.draft, undefined);
  assert.match(model.sourceDetail, /clear Timeline filters/);
});
