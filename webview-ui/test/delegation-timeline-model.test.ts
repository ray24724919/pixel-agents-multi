import assert from 'node:assert/strict';
import test from 'node:test';

import type { DelegationSummary } from '../src/components/delegationModel.ts';
import {
  buildDelegationTimelineEventIntents,
  type DelegationTimelineAgentContext,
} from '../src/components/delegationTimelineModel.ts';

function delegation(overrides: Partial<DelegationSummary>): DelegationSummary {
  return {
    supervisorAgentId: 1,
    providerId: 'codex',
    status: 'delegating',
    activeDelegateCount: 1,
    completedDelegateCount: 0,
    failedDelegateCount: 0,
    delegateSource: 'hook',
    teamName: 'Release',
    delegateLabels: ['raw prompt: inspect private transcript'],
    updatedAt: 100,
    ...overrides,
  };
}

function agents(): DelegationTimelineAgentContext[] {
  return [
    {
      id: 1,
      name: 'Codex Lead',
      providerId: 'codex',
      projectName: 'pixel-agents',
      sessionId: 'session-1',
      runId: 'W7-B',
    },
  ];
}

function mapOf(...summaries: DelegationSummary[]): Map<number, DelegationSummary> {
  return new Map(summaries.map((summary) => [summary.supervisorAgentId, summary]));
}

test('delegation timeline emits started when a supervisor gains delegates', () => {
  const events = buildDelegationTimelineEventIntents({
    previous: new Map(),
    current: mapOf(delegation({ activeDelegateCount: 2 })),
    agents: agents(),
    nowMs: 500,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'delegation.started');
  assert.equal(events[0]?.title, 'Delegation started');
  assert.equal(events[0]?.severity, 'info');
  assert.equal(events[0]?.payload.totalDelegateCount, 2);
  assert.match(events[0]?.summary ?? '', /Codex Lead #1/);
  assert.match(events[0]?.summary ?? '', /pixel-agents project/);
  assert.doesNotMatch(events[0]?.summary ?? '', /raw prompt|private transcript/i);
  assert.doesNotMatch(JSON.stringify(events[0]?.payload), /raw prompt|private transcript/i);
});

test('delegation timeline emits progress when worker counts change', () => {
  const events = buildDelegationTimelineEventIntents({
    previous: mapOf(delegation({ activeDelegateCount: 1 })),
    current: mapOf(delegation({ activeDelegateCount: 2, completedDelegateCount: 1 })),
    agents: agents(),
    nowMs: 600,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'delegation.progress');
  assert.equal(events[0]?.payload.activeDelegateCount, 2);
  assert.equal(events[0]?.payload.completedDelegateCount, 1);
});

test('delegation timeline emits completed when active workers finish', () => {
  const events = buildDelegationTimelineEventIntents({
    previous: mapOf(delegation({ activeDelegateCount: 1, status: 'delegating' })),
    current: mapOf(
      delegation({
        status: 'waiting_for_delegate',
        activeDelegateCount: 0,
        completedDelegateCount: 1,
      }),
    ),
    agents: agents(),
    nowMs: 700,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'delegation.completed');
  assert.equal(events[0]?.severity, 'success');
});

test('delegation timeline emits failed once when a delegate error appears', () => {
  const events = buildDelegationTimelineEventIntents({
    previous: mapOf(delegation({ activeDelegateCount: 2, status: 'delegating' })),
    current: mapOf(
      delegation({
        status: 'delegate_error',
        activeDelegateCount: 1,
        failedDelegateCount: 1,
      }),
    ),
    agents: agents(),
    nowMs: 800,
  });
  const repeated = buildDelegationTimelineEventIntents({
    previous: mapOf(
      delegation({
        status: 'delegate_error',
        activeDelegateCount: 1,
        failedDelegateCount: 1,
      }),
    ),
    current: new Map(),
    agents: agents(),
    nowMs: 900,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'delegation.failed');
  assert.equal(events[0]?.severity, 'error');
  assert.equal(repeated.length, 0);
});

test('delegation timeline emits cancelled when active workers disappear without completion', () => {
  const events = buildDelegationTimelineEventIntents({
    previous: mapOf(delegation({ activeDelegateCount: 1, status: 'delegating' })),
    current: new Map(),
    agents: agents(),
    nowMs: 900,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'delegation.cancelled');
  assert.equal(events[0]?.severity, 'warning');
});

test('delegation timeline uses completion hints for subagent clear terminal transitions', () => {
  const events = buildDelegationTimelineEventIntents({
    previous: mapOf(delegation({ activeDelegateCount: 1, status: 'delegating' })),
    current: new Map(),
    agents: agents(),
    transitionHints: [{ supervisorAgentId: 1, reason: 'completed', timestamp: 1000 }],
    nowMs: 1100,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'delegation.completed');
  assert.equal(events[0]?.timestamp, 1000);
});
