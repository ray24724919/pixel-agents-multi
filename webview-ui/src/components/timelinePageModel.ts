export type TimelineSeverity = 'info' | 'success' | 'warning' | 'error';
export type TimelineSeverityFilter = 'all' | TimelineSeverity;

export interface TimelineAgentContext {
  id: number;
  name: string;
  providerId: string;
  project: string;
}

export interface TimelineSourceEvent {
  id: string;
  agentId: number;
  providerId?: string;
  projectName?: string;
  sessionId?: string;
  runId?: string;
  timestamp: number;
  kind: string;
  title: string;
  summary?: string;
  severity?: TimelineSeverity;
  source?: 'user' | 'agent' | 'tool' | 'system';
}

export interface TimelineLifecycleSourceEvent {
  id: number;
  status: string;
  label: string;
  detail?: string;
  severity?: TimelineSeverity;
  receivedAt: number;
}

export interface TimelinePageItem {
  id: string;
  agentId: number;
  agentName: string;
  providerId: string;
  project: string;
  timestamp: number;
  title: string;
  summary?: string;
  severity: TimelineSeverity;
  kind: string;
  source: 'user' | 'agent' | 'tool' | 'system';
  sessionId?: string;
  runId?: string;
  isActionLike: boolean;
  isDelegationLike: boolean;
}

export interface TimelinePageFilters {
  providerFilter: 'all' | string;
  severityFilter: TimelineSeverityFilter;
  projectFilter: 'all' | string;
  agentFilter: 'all' | string;
  searchQuery: string;
}

export interface TimelineFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface TimelinePageCounts {
  total: number;
  shown: number;
  info: number;
  warning: number;
  error: number;
  actionLike: number;
}

export interface TimelinePageModel {
  events: TimelinePageItem[];
  counts: TimelinePageCounts;
  providerOptions: TimelineFilterOption[];
  projectOptions: TimelineFilterOption[];
  agentOptions: TimelineFilterOption[];
  hasFilters: boolean;
}

export function buildTimelinePageItems(
  agents: readonly TimelineAgentContext[],
  timelineEvents: readonly TimelineSourceEvent[],
  lifecycleEvents: readonly TimelineLifecycleSourceEvent[],
): TimelinePageItem[] {
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const items: TimelinePageItem[] = [];

  for (const event of timelineEvents) {
    const agent = agentsById.get(event.agentId);
    const isActionLike = isActionLikeTimelineKind(event.kind);
    const isDelegationLike = isDelegationTimelineKind(event.kind);
    if (!agent && !isActionLike) continue;
    items.push({
      id: `timeline-${event.id}`,
      agentId: event.agentId,
      agentName: agent?.name ?? `Agent #${event.agentId}`,
      providerId: event.providerId ?? agent?.providerId ?? 'unknown',
      project: event.projectName ?? agent?.project ?? 'Unknown project',
      timestamp: event.timestamp,
      title: event.title,
      summary: event.summary ?? event.kind,
      severity: event.severity ?? 'info',
      kind: event.kind,
      source: event.source ?? 'system',
      sessionId: event.sessionId,
      runId: event.runId,
      isActionLike,
      isDelegationLike,
    });
  }

  lifecycleEvents.forEach((event, index) => {
    const agent = agentsById.get(event.id);
    if (!agent) return;
    const kind = `lifecycle.${event.status}`;
    items.push({
      id: `lifecycle-${event.receivedAt}-${event.id}-${index}`,
      agentId: agent.id,
      agentName: agent.name,
      providerId: agent.providerId,
      project: agent.project,
      timestamp: event.receivedAt,
      title: event.label,
      summary: [event.status, event.detail].filter(Boolean).join(' / '),
      severity: event.severity ?? 'info',
      kind,
      source: 'system',
      isActionLike: false,
      isDelegationLike: false,
    });
  });

  return items.sort((a, b) => b.timestamp - a.timestamp);
}

export function buildTimelinePageModel(
  events: readonly TimelinePageItem[],
  filters: TimelinePageFilters,
): TimelinePageModel {
  const filtered = events.filter((event) => timelineEventMatchesFilters(event, filters));
  return {
    events: filtered.slice().sort((a, b) => b.timestamp - a.timestamp),
    counts: getTimelinePageCounts(events, filtered.length),
    providerOptions: getTimelineFilterOptions(events, (event) => event.providerId, providerLabel),
    projectOptions: getTimelineFilterOptions(events, (event) => event.project),
    agentOptions: getTimelineFilterOptions(
      events,
      (event) => String(event.agentId),
      (_value, event) => `${event.agentName} #${event.agentId}`,
    ),
    hasFilters:
      filters.providerFilter !== 'all' ||
      filters.severityFilter !== 'all' ||
      filters.projectFilter !== 'all' ||
      filters.agentFilter !== 'all' ||
      filters.searchQuery.trim().length > 0,
  };
}

export function timelineEventMatchesFilters(
  event: TimelinePageItem,
  filters: TimelinePageFilters,
): boolean {
  if (filters.providerFilter !== 'all' && event.providerId !== filters.providerFilter) {
    return false;
  }
  if (filters.severityFilter !== 'all' && event.severity !== filters.severityFilter) {
    return false;
  }
  if (filters.projectFilter !== 'all' && event.project !== filters.projectFilter) {
    return false;
  }
  if (filters.agentFilter !== 'all' && String(event.agentId) !== filters.agentFilter) {
    return false;
  }
  return timelineEventMatchesSearch(event, filters.searchQuery);
}

export function timelineEventMatchesSearch(event: TimelinePageItem, query: string): boolean {
  const tokens = tokenizeSearch(query);
  if (tokens.length === 0) return true;
  const haystack = buildTimelineSearchText(event);
  return tokens.every((token) => haystack.includes(token));
}

export function timelineSeverityLabel(severity: TimelineSeverityFilter): string {
  if (severity === 'all') return 'All severities';
  if (severity === 'info') return 'Info';
  if (severity === 'success') return 'Success';
  if (severity === 'warning') return 'Warning';
  return 'Error';
}

export function isActionLikeTimelineKind(kind: string): boolean {
  return kind.startsWith('action.') || isDelegationTimelineKind(kind);
}

export function isDelegationTimelineKind(kind: string): boolean {
  return kind.startsWith('delegation.');
}

function getTimelinePageCounts(
  events: readonly TimelinePageItem[],
  shown: number,
): TimelinePageCounts {
  const counts: TimelinePageCounts = {
    total: events.length,
    shown,
    info: 0,
    warning: 0,
    error: 0,
    actionLike: 0,
  };
  for (const event of events) {
    if (event.severity === 'warning') {
      counts.warning += 1;
    } else if (event.severity === 'error') {
      counts.error += 1;
    } else {
      counts.info += 1;
    }
    if (event.isActionLike) counts.actionLike += 1;
  }
  return counts;
}

function getTimelineFilterOptions(
  events: readonly TimelinePageItem[],
  valueFor: (event: TimelinePageItem) => string,
  labelFor: (value: string, event: TimelinePageItem) => string = (value) => value,
): TimelineFilterOption[] {
  const options = new Map<string, TimelineFilterOption>();
  for (const event of events) {
    const value = valueFor(event);
    const existing = options.get(value);
    if (existing) {
      existing.count += 1;
    } else {
      options.set(value, { value, label: labelFor(value, event), count: 1 });
    }
  }
  return [...options.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }),
  );
}

function providerLabel(providerId: string): string {
  if (providerId === 'codex') return 'Codex';
  if (providerId === 'claude') return 'Claude';
  if (providerId === 'unknown') return 'Unknown';
  return providerId;
}

function buildTimelineSearchText(event: TimelinePageItem): string {
  return [
    event.title,
    event.summary,
    event.agentName,
    `agent ${event.agentId}`,
    `#${event.agentId}`,
    event.providerId,
    event.project,
    event.kind,
    event.source,
    event.severity,
    event.sessionId,
    event.runId,
    event.isActionLike ? 'action' : undefined,
    event.isDelegationLike ? 'delegation delegate worker supervising' : undefined,
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
