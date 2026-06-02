import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type AgentListFilters,
  type AgentListItem,
  agentMatchesSearch,
  filterAndSortAgentList,
} from '../src/components/agentCenterListModel.ts';

function agent(overrides: Partial<AgentListItem>): AgentListItem {
  return {
    id: 1,
    name: 'Agent One',
    project: 'repo',
    providerId: 'claude',
    status: 'waiting',
    statusGroup: 'waiting',
    activity: 'Idle',
    tokens: 0,
    updatedAt: 0,
    isPaused: false,
    hidden: false,
    ...overrides,
  };
}

function filters(overrides: Partial<AgentListFilters> = {}): AgentListFilters {
  return {
    providerFilter: 'all',
    statusFilter: 'all',
    projectFilter: 'all',
    teamFilter: 'all',
    searchQuery: '',
    sortKey: 'attention',
    ...overrides,
  };
}

test('agent search matches identity, paths, session metadata, team, and activity text', () => {
  const item = agent({
    id: 7,
    name: 'Fix Windows Paths',
    providerId: 'codex',
    project: 'pixel-agents-multi',
    projectDir: 'C:\\Users\\User\\Documents\\raychen\\pixel-agents-multi',
    transcriptPath: 'C:\\Users\\User\\.codex\\sessions\\session-abc.jsonl',
    sessionId: 'session-abc',
    teamName: 'Infra',
    roleName: 'Reviewer',
    activity: 'Running Bash tests',
    recentEventText: 'Permission approved for session-abc',
  });

  assert.equal(agentMatchesSearch(item, '#7 codex'), true);
  assert.equal(agentMatchesSearch(item, 'users/user/documents/raychen'), true);
  assert.equal(agentMatchesSearch(item, 'infra bash'), true);
  assert.equal(agentMatchesSearch(item, 'session abc reviewer'), true);
  assert.equal(agentMatchesSearch(item, 'missing needle'), false);
});

test('agent list filters combine provider, status, project, team, search, and hidden state', () => {
  const items = [
    agent({
      id: 1,
      name: 'Claude lead',
      providerId: 'claude',
      project: 'alpha',
      statusGroup: 'active',
      activity: 'Editing files',
      teamName: 'Core',
    }),
    agent({
      id: 2,
      name: 'Codex waiting',
      providerId: 'codex',
      project: 'alpha',
      statusGroup: 'needs_me',
      activity: 'Needs approval',
      teamName: 'Core',
    }),
    agent({
      id: 3,
      name: 'Hidden helper',
      providerId: 'codex',
      project: 'beta',
      statusGroup: 'waiting',
      activity: 'Idle',
      hidden: true,
      teamName: 'Ops',
    }),
  ];

  assert.deepEqual(
    filterAndSortAgentList(
      items,
      filters({
        providerFilter: 'codex',
        statusFilter: 'needs_me',
        projectFilter: 'alpha',
        teamFilter: 'Core',
        searchQuery: 'approval',
      }),
    ).map((item) => item.id),
    [2],
  );
  assert.deepEqual(
    filterAndSortAgentList(items, filters({ statusFilter: 'hidden' })).map((item) => item.id),
    [3],
  );
});

test('attention sort orders needs-me, error, active, paused, waiting, then hidden', () => {
  const items = [
    agent({ id: 1, statusGroup: 'waiting', updatedAt: 50 }),
    agent({ id: 2, statusGroup: 'active', updatedAt: 50 }),
    agent({ id: 3, statusGroup: 'error', updatedAt: 50 }),
    agent({ id: 4, statusGroup: 'needs_me', updatedAt: 50 }),
    agent({ id: 5, statusGroup: 'paused', isPaused: true, updatedAt: 50 }),
    agent({ id: 6, statusGroup: 'active', hidden: true, updatedAt: 1000 }),
  ];

  assert.deepEqual(
    filterAndSortAgentList(items, filters({ sortKey: 'attention' })).map((item) => item.id),
    [4, 3, 2, 5, 1, 6],
  );
});

test('token and updated sorts keep deterministic fallbacks', () => {
  const items = [
    agent({ id: 10, name: 'Beta', tokens: 100, updatedAt: 20 }),
    agent({ id: 11, name: 'Alpha', tokens: 100, updatedAt: 30 }),
    agent({ id: 12, name: 'Gamma', tokens: 300, updatedAt: 10 }),
  ];

  assert.deepEqual(
    filterAndSortAgentList(items, filters({ sortKey: 'tokens' })).map((item) => item.id),
    [12, 11, 10],
  );
  assert.deepEqual(
    filterAndSortAgentList(items, filters({ sortKey: 'updated' })).map((item) => item.id),
    [11, 10, 12],
  );
});
