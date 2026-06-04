import { TIMELINE_HISTORY_MAX_EVENTS } from '../constants.js';
import type { AgentTimelineEvent } from './useExtensionMessages.js';

export interface TimelineHistoryLoadedMessage {
  type: 'timelineHistoryLoaded';
  records?: unknown;
  loadedAtMs?: unknown;
  unavailable?: unknown;
  error?: unknown;
}

export interface TimelineHistoryState {
  loadedAtMs?: number;
  unavailable: boolean;
  error?: string;
  persistedRecordCount: number;
}

export type PersistedTimelineEvent = Omit<AgentTimelineEvent, 'payload'>;

export const initialTimelineHistoryState: TimelineHistoryState = {
  unavailable: false,
  persistedRecordCount: 0,
};

export function timelineEventsFromHistoryLoadedMessage(
  message: TimelineHistoryLoadedMessage,
): PersistedTimelineEvent[] {
  if (!Array.isArray(message.records)) return [];
  return message.records
    .map(timelineEventForPersistence)
    .filter((event): event is PersistedTimelineEvent => event !== undefined);
}

export function timelineHistoryStateFromLoadedMessage(
  message: TimelineHistoryLoadedMessage,
): TimelineHistoryState {
  const events = timelineEventsFromHistoryLoadedMessage(message);
  const loadedAtMs = numberValue(message.loadedAtMs);
  const error = stringValue(message.error);
  return {
    loadedAtMs,
    unavailable: message.unavailable === true,
    error,
    persistedRecordCount: events.length,
  };
}

export function mergeTimelineEventsById(
  existing: readonly AgentTimelineEvent[],
  incoming: readonly AgentTimelineEvent[],
  maxEvents = TIMELINE_HISTORY_MAX_EVENTS,
): AgentTimelineEvent[] {
  const byId = new Map<string, AgentTimelineEvent>();
  for (const event of [...incoming, ...existing].sort(compareNewestFirst)) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()].slice(0, maxEvents);
}

export function timelineEventForPersistence(value: unknown): PersistedTimelineEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const event = value as Partial<AgentTimelineEvent>;
  const id = stringValue(event.id);
  const agentId = numberValue(event.agentId);
  const timestamp = numberValue(event.timestamp);
  const kind = stringValue(event.kind);
  const title = stringValue(event.title);
  if (!id || agentId === undefined || timestamp === undefined || !kind || !title) {
    return undefined;
  }

  const out: PersistedTimelineEvent = {
    id,
    agentId,
    timestamp,
    kind,
    title,
    visibility: timelineVisibility(event.visibility) ?? 'default',
  };
  const providerId = stringValue(event.providerId);
  const projectName = stringValue(event.projectName);
  const sessionId = stringValue(event.sessionId);
  const runId = stringValue(event.runId);
  const artifactId = stringValue(event.artifactId);
  const artifactStatus = stringValue(event.artifactStatus);
  const previousStatus = stringValue(event.previousStatus);
  const nextStatus = stringValue(event.nextStatus);
  const dispatchStatus = stringValue(event.dispatchStatus);
  const packageRelativePath = stringValue(event.packageRelativePath);
  const reportRelativePath = stringValue(event.reportRelativePath);
  const summary = stringValue(event.summary);
  const statusAfter = lifecycleStatus(event.statusAfter);
  const severity = timelineSeverity(event.severity);
  const source = timelineSource(event.source);

  if (providerId) out.providerId = providerId;
  if (projectName) out.projectName = projectName;
  if (sessionId) out.sessionId = sessionId;
  if (runId) out.runId = runId;
  if (artifactId) out.artifactId = artifactId;
  if (artifactStatus) out.artifactStatus = artifactStatus;
  if (previousStatus) out.previousStatus = previousStatus;
  if (nextStatus) out.nextStatus = nextStatus;
  if (dispatchStatus) out.dispatchStatus = dispatchStatus;
  if (packageRelativePath) out.packageRelativePath = packageRelativePath;
  if (reportRelativePath) out.reportRelativePath = reportRelativePath;
  if (summary) out.summary = summary;
  if (statusAfter) out.statusAfter = statusAfter;
  if (severity) out.severity = severity;
  if (source) out.source = source;
  return out;
}

function compareNewestFirst(a: AgentTimelineEvent, b: AgentTimelineEvent): number {
  if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
  return b.id.localeCompare(a.id);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function timelineSeverity(value: unknown): AgentTimelineEvent['severity'] | undefined {
  if (value === 'info' || value === 'success' || value === 'warning' || value === 'error') {
    return value;
  }
  return undefined;
}

function timelineSource(value: unknown): AgentTimelineEvent['source'] | undefined {
  if (value === 'user' || value === 'agent' || value === 'tool' || value === 'system') {
    return value;
  }
  return undefined;
}

function timelineVisibility(value: unknown): AgentTimelineEvent['visibility'] | undefined {
  if (value === 'default' || value === 'verbose' || value === 'debug') {
    return value;
  }
  return undefined;
}

function lifecycleStatus(value: unknown): AgentTimelineEvent['statusAfter'] | undefined {
  if (
    value === 'idle' ||
    value === 'thinking' ||
    value === 'tool_running' ||
    value === 'waiting_user' ||
    value === 'waiting_permission' ||
    value === 'paused' ||
    value === 'completed' ||
    value === 'error'
  ) {
    return value;
  }
  return undefined;
}
