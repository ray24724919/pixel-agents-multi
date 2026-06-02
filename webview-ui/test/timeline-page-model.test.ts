import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTimelinePageItems,
  buildTimelinePageModel,
  type TimelineAgentContext,
  type TimelinePageFilters,
  type TimelineSourceEvent,
} from '../src/components/timelinePageModel.ts';

const defaultFilters: TimelinePageFilters = {
  providerFilter: 'all',
  severityFilter: 'all',
  projectFilter: 'all',
  agentFilter: 'all',
  searchQuery: '',
};

function agent(overrides: Partial<TimelineAgentContext>): TimelineAgentContext {
  return {
    id: 1,
    name: 'Codex Alpha',
    providerId: 'codex',
    project: 'pixel-agents',
    ...overrides,
  };
}

function event(overrides: Partial<TimelineSourceEvent>): TimelineSourceEvent {
  return {
    id: 'event-1',
    agentId: 1,
    timestamp: 100,
    kind: 'tool.started',
    title: 'Tool started',
    severity: 'info',
    source: 'tool',
    ...overrides,
  };
}

test('timeline page keeps action history for agents that are no longer visible', () => {
  const items = buildTimelinePageItems(
    [],
    [
      event({
        id: 'archive-2',
        agentId: 2,
        providerId: 'codex',
        projectName: 'old-project',
        sessionId: 'session-2',
        timestamp: 300,
        kind: 'action.archive',
        title: 'Archived agent',
        summary: 'Archived from supervisor action menu.',
        severity: 'warning',
        source: 'user',
      }),
      event({
        id: 'tool-2',
        agentId: 2,
        timestamp: 250,
        kind: 'tool.started',
        title: 'Hidden tool event',
      }),
    ],
    [],
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, 'timeline-archive-2');
  assert.equal(items[0]?.agentName, 'Agent #2');
  assert.equal(items[0]?.providerId, 'codex');
  assert.equal(items[0]?.project, 'old-project');
  assert.equal(items[0]?.sessionId, 'session-2');
  assert.equal(items[0]?.isActionLike, true);
});

test('timeline page search spans event, agent, provider, and project text', () => {
  const items = buildTimelinePageItems(
    [
      agent({ id: 1, name: 'Codex Alpha', providerId: 'codex', project: 'pixel-agents' }),
      agent({ id: 2, name: 'Claude Review', providerId: 'claude', project: 'docs-site' }),
    ],
    [
      event({
        id: 'build-1',
        agentId: 1,
        timestamp: 200,
        kind: 'tool.completed',
        title: 'Build completed',
        summary: 'npm test passed for release branch',
        severity: 'success',
      }),
      event({
        id: 'review-2',
        agentId: 2,
        timestamp: 100,
        kind: 'agent.waiting',
        title: 'Needs review',
        summary: 'Waiting on docs copy',
        severity: 'info',
      }),
    ],
    [],
  );
  const model = buildTimelinePageModel(items, {
    ...defaultFilters,
    searchQuery: 'build alpha codex pixel agents',
  });

  assert.deepEqual(
    model.events.map((item) => item.id),
    ['timeline-build-1'],
  );
});

test('timeline page applies provider severity project and agent filters together', () => {
  const items = buildTimelinePageItems(
    [
      agent({ id: 1, name: 'Codex Alpha', providerId: 'codex', project: 'pixel-agents' }),
      agent({ id: 2, name: 'Codex Beta', providerId: 'codex', project: 'other-repo' }),
      agent({ id: 3, name: 'Claude Gamma', providerId: 'claude', project: 'pixel-agents' }),
    ],
    [
      event({
        id: 'match',
        agentId: 1,
        timestamp: 300,
        kind: 'tool.completed',
        title: 'Finished test run',
        severity: 'success',
      }),
      event({
        id: 'wrong-project',
        agentId: 2,
        timestamp: 200,
        kind: 'tool.completed',
        title: 'Finished test run',
        severity: 'success',
      }),
      event({
        id: 'wrong-provider',
        agentId: 3,
        timestamp: 100,
        kind: 'tool.completed',
        title: 'Finished test run',
        severity: 'success',
      }),
    ],
    [],
  );
  const model = buildTimelinePageModel(items, {
    ...defaultFilters,
    providerFilter: 'codex',
    severityFilter: 'success',
    projectFilter: 'pixel-agents',
    agentFilter: '1',
  });

  assert.equal(model.counts.shown, 1);
  assert.equal(model.events[0]?.id, 'timeline-match');
});

test('timeline page counters and filter options are built from the indexed event set', () => {
  const items = buildTimelinePageItems(
    [
      agent({ id: 1, name: 'Codex Alpha', providerId: 'codex', project: 'pixel-agents' }),
      agent({ id: 2, name: 'Claude Review', providerId: 'claude', project: 'docs-site' }),
    ],
    [
      event({ id: 'info', agentId: 1, timestamp: 400, severity: 'info' }),
      event({ id: 'success', agentId: 1, timestamp: 300, severity: 'success' }),
      event({ id: 'warning', agentId: 2, timestamp: 200, severity: 'warning' }),
      event({
        id: 'kill',
        agentId: 9,
        providerId: 'codex',
        projectName: 'archived-repo',
        timestamp: 100,
        kind: 'action.kill',
        title: 'Killed agent',
        severity: 'error',
      }),
    ],
    [],
  );
  const model = buildTimelinePageModel(items, defaultFilters);

  assert.deepEqual(model.counts, {
    total: 4,
    shown: 4,
    info: 2,
    warning: 1,
    error: 1,
    actionLike: 1,
  });
  assert.deepEqual(
    model.providerOptions.map((option) => option.value),
    ['claude', 'codex'],
  );
  assert.deepEqual(
    model.projectOptions.map((option) => option.value),
    ['archived-repo', 'docs-site', 'pixel-agents'],
  );
  assert.deepEqual(
    model.agentOptions.map((option) => option.value),
    ['9', '2', '1'],
  );
});

test('timeline page includes active-agent lifecycle events and sorts newest first', () => {
  const items = buildTimelinePageItems(
    [agent({ id: 1 }), agent({ id: 2, name: 'Removed Later' })],
    [event({ id: 'tool', agentId: 1, timestamp: 200, title: 'Tool event' })],
    [
      {
        id: 1,
        status: 'active',
        label: 'Agent became active',
        detail: 'Running tests',
        severity: 'info',
        receivedAt: 300,
      },
      {
        id: 99,
        status: 'active',
        label: 'Missing agent lifecycle',
        receivedAt: 400,
      },
    ],
  );

  assert.deepEqual(
    items.map((item) => item.id),
    ['lifecycle-300-1-0', 'timeline-tool'],
  );
  assert.equal(items[0]?.summary, 'active / Running tests');
});
