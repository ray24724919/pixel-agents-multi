import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDelegationSummaries,
  type DelegationAgentContext,
  delegationStatusLabel,
  delegationWorkerLabel,
} from '../src/components/delegationModel.ts';

function agent(overrides: Partial<DelegationAgentContext>): DelegationAgentContext {
  return {
    id: 1,
    name: 'Supervisor',
    providerId: 'codex',
    statusGroup: 'waiting',
    updatedAt: 100,
    ...overrides,
  };
}

test('delegation summaries derive active worker counts from subagent state', () => {
  const summaries = buildDelegationSummaries({
    agents: [
      agent({ id: 1, name: 'Codex lead', providerId: 'codex' }),
      agent({ id: 2, name: 'Claude lead', providerId: 'claude' }),
    ],
    subagentCharacters: [
      { id: -1, parentAgentId: 1, parentToolId: 'task-a', label: 'patch worker' },
      { id: -2, parentAgentId: 1, parentToolId: 'task-b', label: 'test worker' },
      { id: -3, parentAgentId: 2, parentToolId: 'task-c', label: 'review worker' },
    ],
    subagentTools: {
      1: {
        'task-a': [{ status: 'Running tests', done: false }],
        'task-b': [{ status: 'Finished', done: true }],
      },
      2: {
        'task-c': [{ status: 'Reading files', done: false }],
      },
    },
    nowMs: 500,
  });

  const codex = summaries.get(1);
  const claude = summaries.get(2);
  assert.equal(codex?.providerId, 'codex');
  assert.equal(codex?.status, 'delegating');
  assert.equal(codex?.activeDelegateCount, 1);
  assert.equal(codex?.completedDelegateCount, 1);
  assert.equal(codex?.delegateSource, 'hook');
  assert.deepEqual(codex?.delegateLabels, ['patch worker', 'test worker']);
  assert.equal(claude?.providerId, 'claude');
  assert.equal(claude?.activeDelegateCount, 1);
  assert.equal(delegationWorkerLabel(codex), '2 workers');
});

test('delegation summaries derive terminal-backed team workers and errors', () => {
  const summaries = buildDelegationSummaries({
    agents: [
      agent({
        id: 10,
        name: 'Claude team lead',
        providerId: 'claude',
        statusGroup: 'waiting',
        teamName: 'Docs',
        isTeamLead: true,
      }),
      agent({
        id: 11,
        name: 'Writer',
        providerId: 'claude',
        statusGroup: 'active',
        teamName: 'Docs',
        leadAgentId: 10,
        updatedAt: 300,
      }),
      agent({
        id: 12,
        name: 'Reviewer',
        providerId: 'claude',
        statusGroup: 'error',
        teamName: 'Docs',
        leadAgentId: 10,
        updatedAt: 400,
      }),
    ],
    subagentCharacters: [],
    subagentTools: {},
    nowMs: 500,
  });

  const summary = summaries.get(10);
  assert.equal(summary?.status, 'delegate_error');
  assert.equal(summary?.delegateSource, 'terminal');
  assert.equal(summary?.activeDelegateCount, 1);
  assert.equal(summary?.failedDelegateCount, 1);
  assert.equal(summary?.updatedAt, 400);
  assert.equal(delegationStatusLabel(summary?.status ?? 'none'), 'Delegate error');
});

test('delegation summaries treat completed parent Task tools as completed workers', () => {
  const summaries = buildDelegationSummaries({
    agents: [agent({ id: 1, name: 'Codex lead', providerId: 'codex' })],
    subagentCharacters: [
      { id: -1, parentAgentId: 1, parentToolId: 'task-a', label: 'patch worker' },
    ],
    subagentTools: {},
    parentTools: {
      1: [{ toolId: 'task-a', status: 'Subtask: patch worker', done: true }],
    },
    nowMs: 500,
  });

  const summary = summaries.get(1);
  assert.equal(summary?.status, 'waiting_for_delegate');
  assert.equal(summary?.activeDelegateCount, 0);
  assert.equal(summary?.completedDelegateCount, 1);
});
