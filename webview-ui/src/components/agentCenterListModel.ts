export type AgentListStatusGroup = 'active' | 'paused' | 'waiting' | 'needs_me' | 'error';
export type AgentListStatusFilter = 'all' | AgentListStatusGroup | 'hidden';
export type AgentListSortKey =
  | 'attention'
  | 'updated'
  | 'name'
  | 'project'
  | 'provider'
  | 'tokens'
  | 'status';

export interface AgentListItem {
  id: number;
  name: string;
  project: string;
  providerId: string;
  status: string;
  statusGroup: AgentListStatusGroup;
  activity: string;
  detail?: string;
  tokens: number;
  updatedAt?: number;
  projectDir?: string;
  transcriptPath?: string;
  sessionId?: string;
  teamName?: string;
  roleName?: string;
  isTeamLead?: boolean;
  isPaused: boolean;
  hidden: boolean;
  recentEventText?: string;
}

export interface AgentListFilters {
  providerFilter: 'all' | string;
  statusFilter: AgentListStatusFilter;
  projectFilter: 'all' | string;
  teamFilter: 'all' | string;
  searchQuery: string;
  sortKey: AgentListSortKey;
}

export const AGENT_LIST_SORT_OPTIONS: readonly AgentListSortKey[] = [
  'attention',
  'updated',
  'name',
  'project',
  'provider',
  'tokens',
  'status',
];

export function filterAndSortAgentList<T extends AgentListItem>(
  agents: readonly T[],
  filters: AgentListFilters,
): T[] {
  return agents
    .filter((agent) => agentMatchesFilters(agent, filters))
    .map((agent, index) => ({ agent, index }))
    .sort((a, b) => compareAgentListItems(a.agent, b.agent, filters.sortKey) || a.index - b.index)
    .map((entry) => entry.agent);
}

export function agentMatchesFilters(agent: AgentListItem, filters: AgentListFilters): boolean {
  if (filters.providerFilter !== 'all' && agent.providerId !== filters.providerFilter) {
    return false;
  }
  if (filters.statusFilter === 'hidden') {
    if (!agent.hidden) return false;
  } else if (filters.statusFilter !== 'all' && agent.statusGroup !== filters.statusFilter) {
    return false;
  }
  if (filters.projectFilter !== 'all' && agent.project !== filters.projectFilter) {
    return false;
  }
  if (filters.teamFilter !== 'all' && agent.teamName !== filters.teamFilter) {
    return false;
  }
  return agentMatchesSearch(agent, filters.searchQuery);
}

export function agentMatchesSearch(agent: AgentListItem, query: string): boolean {
  const tokens = tokenizeSearch(query);
  if (tokens.length === 0) return true;
  const haystack = buildAgentSearchText(agent);
  return tokens.every((token) => haystack.includes(token));
}

export function compareAgentListItems(
  a: AgentListItem,
  b: AgentListItem,
  sortKey: AgentListSortKey,
): number {
  if (sortKey === 'updated') return compareUpdatedDesc(a, b) || compareByName(a, b);
  if (sortKey === 'name') return compareByName(a, b) || compareById(a, b);
  if (sortKey === 'project') {
    return compareText(a.project, b.project) || compareByName(a, b) || compareById(a, b);
  }
  if (sortKey === 'provider') {
    return compareText(a.providerId, b.providerId) || compareByName(a, b) || compareById(a, b);
  }
  if (sortKey === 'tokens') {
    return b.tokens - a.tokens || compareByName(a, b) || compareById(a, b);
  }
  if (sortKey === 'status') {
    return compareText(statusSortLabel(a), statusSortLabel(b)) || compareUpdatedDesc(a, b);
  }
  return compareAttention(a, b) || compareUpdatedDesc(a, b) || compareByName(a, b);
}

export function agentListSortLabel(sortKey: AgentListSortKey): string {
  if (sortKey === 'attention') return 'Attention first';
  if (sortKey === 'updated') return 'Recently updated';
  if (sortKey === 'name') return 'Agent name';
  if (sortKey === 'project') return 'Project';
  if (sortKey === 'provider') return 'Provider';
  if (sortKey === 'tokens') return 'Token total';
  return 'Status';
}

export function attentionRank(agent: AgentListItem): number {
  if (agent.hidden) return 5;
  if (agent.statusGroup === 'needs_me') return 0;
  if (agent.statusGroup === 'error') return 1;
  if (agent.statusGroup === 'waiting') return 2;
  if (agent.statusGroup === 'active') return 3;
  if (agent.isPaused || agent.statusGroup === 'paused') return 4;
  return 5;
}

function compareAttention(a: AgentListItem, b: AgentListItem): number {
  return attentionRank(a) - attentionRank(b);
}

function compareUpdatedDesc(a: AgentListItem, b: AgentListItem): number {
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

function compareByName(a: AgentListItem, b: AgentListItem): number {
  return compareText(a.name, b.name);
}

function compareById(a: AgentListItem, b: AgentListItem): number {
  return a.id - b.id;
}

function compareText(a: string | undefined, b: string | undefined): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base', numeric: true });
}

function statusSortLabel(agent: AgentListItem): string {
  if (agent.hidden) return 'z-hidden';
  if (agent.isPaused) return 'paused';
  return agent.statusGroup;
}

function buildAgentSearchText(agent: AgentListItem): string {
  return [
    agent.name,
    `agent ${agent.id}`,
    `#${agent.id}`,
    agent.providerId,
    agent.project,
    agent.projectDir,
    agent.transcriptPath,
    agent.sessionId,
    agent.teamName,
    agent.roleName,
    agent.isTeamLead ? 'lead' : undefined,
    agent.status,
    agent.statusGroup,
    agent.activity,
    agent.detail,
    agent.recentEventText,
    agent.hidden ? 'hidden' : undefined,
    agent.isPaused ? 'paused' : undefined,
  ]
    .map((value) => normalizeSearchText(value ?? ''))
    .filter(Boolean)
    .join(' ');
}

function tokenizeSearch(query: string): string[] {
  return normalizeSearchText(query).split(' ').filter(Boolean);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\\/]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
