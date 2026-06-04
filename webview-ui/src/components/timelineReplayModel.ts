import type {
  TimelineCategory,
  TimelineLifecycleStatus,
  TimelinePageItem,
  TimelineSeverity,
} from './timelinePageModel.js';

export interface TimelineReplayFrame {
  id: string;
  event: TimelinePageItem;
  index: number;
  offsetMs: number;
  timestamp: number;
  status: TimelineLifecycleStatus;
  statusLabel: string;
  severity: TimelineSeverity;
  kind: string;
  category: TimelineCategory;
}

export interface TimelineReplaySession {
  id: string;
  label: string;
  agentId: number;
  agentName: string;
  providerId: string;
  project: string;
  sessionId?: string;
  runId?: string;
  startedAt: number;
  endedAt: number;
  frameCount: number;
  frames: TimelineReplayFrame[];
}

export interface TimelineReplayState {
  session?: TimelineReplaySession;
  cursorIndex: number;
  currentFrame?: TimelineReplayFrame;
  hasFirst: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  hasLast: boolean;
  progress: number;
  progressLabel: string;
  status: TimelineLifecycleStatus;
  statusLabel: string;
  severity: TimelineSeverity;
  kind?: string;
  category?: TimelineCategory;
  isSingleFrame: boolean;
  unavailableReason?: 'no-sessions' | 'session-filtered-out';
}

export interface TimelineReplayFrameLocation {
  sessionId: string;
  cursorIndex: number;
  frame: TimelineReplayFrame;
}

export interface TimelineReplayFrameMarker {
  isCurrent: boolean;
  label?: string;
  status?: TimelineLifecycleStatus;
  severity?: TimelineSeverity;
}

export function buildTimelineReplaySessions(
  events: readonly TimelinePageItem[],
): TimelineReplaySession[] {
  const bySession = new Map<string, TimelinePageItem[]>();
  for (const event of events) {
    const key = timelineReplaySessionKey(event);
    bySession.set(key, [...(bySession.get(key) ?? []), event]);
  }

  return [...bySession.entries()]
    .map(([id, sessionEvents]) => buildTimelineReplaySession(id, sessionEvents))
    .filter((session): session is TimelineReplaySession => session !== undefined)
    .sort((a, b) => {
      if (b.endedAt !== a.endedAt) return b.endedAt - a.endedAt;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });
    });
}

export function getTimelineReplayState(
  session: TimelineReplaySession | undefined,
  cursorIndex: number,
): TimelineReplayState {
  if (!session || session.frames.length === 0) {
    return emptyTimelineReplayState('no-sessions');
  }

  const normalizedCursor = clampCursor(cursorIndex, session.frames.length);
  const currentFrame = session.frames[normalizedCursor];
  const progress =
    session.frames.length === 1 ? 1 : normalizedCursor / Math.max(1, session.frames.length - 1);
  return {
    session,
    cursorIndex: normalizedCursor,
    currentFrame,
    hasFirst: normalizedCursor > 0,
    hasPrevious: normalizedCursor > 0,
    hasNext: normalizedCursor < session.frames.length - 1,
    hasLast: normalizedCursor < session.frames.length - 1,
    progress,
    progressLabel: `${normalizedCursor + 1} / ${session.frames.length}`,
    status: currentFrame.status,
    statusLabel: currentFrame.statusLabel,
    severity: currentFrame.severity,
    kind: currentFrame.kind,
    category: currentFrame.category,
    isSingleFrame: session.frames.length === 1,
  };
}

export function findTimelineReplayFrameByEventId(
  sessions: readonly TimelineReplaySession[],
  eventId: string,
): TimelineReplayFrameLocation | undefined {
  for (const session of sessions) {
    const frame = session.frames.find((candidate) => candidate.event.id === eventId);
    if (frame) {
      return {
        sessionId: session.id,
        cursorIndex: frame.index,
        frame,
      };
    }
  }
  return undefined;
}

export function resolveTimelineReplaySelection(
  sessions: readonly TimelineReplaySession[],
  selectedSessionId: string,
  cursorIndex: number,
): TimelineReplayState {
  if (sessions.length === 0) return getTimelineReplayState(undefined, 0);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  if (!selectedSession) {
    if (selectedSessionId) return emptyTimelineReplayState('session-filtered-out');
    return getTimelineReplayState(sessions[0], 0);
  }
  return getTimelineReplayState(selectedSession, cursorIndex);
}

export function getTimelineReplayFrameMarker(
  event: TimelinePageItem,
  state: TimelineReplayState,
): TimelineReplayFrameMarker {
  if (!state.currentFrame || state.currentFrame.event.id !== event.id) {
    return { isCurrent: false };
  }
  return {
    isCurrent: true,
    label: `Replay frame ${state.progressLabel}`,
    status: state.status,
    severity: state.severity,
  };
}

export function deriveTimelineReplayStatus(event: TimelinePageItem): TimelineLifecycleStatus {
  if (event.statusAfter) return event.statusAfter;

  const kind = event.kind.toLowerCase();
  if (kind.startsWith('lifecycle.')) {
    return timelineLifecycleStatus(kind.slice('lifecycle.'.length)) ?? 'idle';
  }
  if (kind === 'tool.started') return 'tool_running';
  if (event.category === 'permission' || kind.startsWith('permission.')) {
    return 'waiting_permission';
  }
  if (kind === 'run.failed' || kind === 'tool.failed' || kind === 'delegation.failed') {
    return 'error';
  }
  if (kind === 'run.completed' || kind === 'tool.completed' || kind === 'delegation.completed') {
    return 'completed';
  }
  if (kind === 'delegation.started' || kind === 'delegation.progress') {
    return 'tool_running';
  }
  if (event.severity === 'error') return 'error';
  return 'idle';
}

export function timelineReplayStatusLabel(status: TimelineLifecycleStatus): string {
  if (status === 'idle') return 'Idle';
  if (status === 'thinking') return 'Thinking';
  if (status === 'tool_running') return 'Tool running';
  if (status === 'waiting_user') return 'Waiting for user';
  if (status === 'waiting_permission') return 'Waiting for permission';
  if (status === 'paused') return 'Paused';
  if (status === 'completed') return 'Completed';
  return 'Error';
}

export function timelineReplaySessionKey(event: TimelinePageItem): string {
  return [
    event.providerId,
    event.project,
    `agent:${event.agentId}`,
    `session:${event.sessionId ?? 'none'}`,
    `run:${event.runId ?? 'none'}`,
  ].join('|');
}

function buildTimelineReplaySession(
  id: string,
  events: readonly TimelinePageItem[],
): TimelineReplaySession | undefined {
  const sortedEvents = events.slice().sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.id.localeCompare(b.id);
  });
  const first = sortedEvents[0];
  const last = sortedEvents[sortedEvents.length - 1];
  if (!first || !last) return undefined;

  const frames = sortedEvents.map((event, index) => {
    const status = deriveTimelineReplayStatus(event);
    return {
      id: `${id}|frame:${event.id}`,
      event,
      index,
      offsetMs: event.timestamp - first.timestamp,
      timestamp: event.timestamp,
      status,
      statusLabel: timelineReplayStatusLabel(status),
      severity: event.severity,
      kind: event.kind,
      category: event.category,
    };
  });

  return {
    id,
    label: timelineReplaySessionLabel(first),
    agentId: first.agentId,
    agentName: first.agentName,
    providerId: first.providerId,
    project: first.project,
    sessionId: first.sessionId,
    runId: first.runId,
    startedAt: first.timestamp,
    endedAt: last.timestamp,
    frameCount: frames.length,
    frames,
  };
}

function timelineReplaySessionLabel(event: TimelinePageItem): string {
  const scope = event.runId ?? event.sessionId ?? event.project;
  return `${event.agentName} #${event.agentId} / ${event.providerId} / ${scope}`;
}

function clampCursor(cursorIndex: number, frameCount: number): number {
  if (!Number.isFinite(cursorIndex)) return 0;
  return Math.min(Math.max(0, Math.floor(cursorIndex)), frameCount - 1);
}

function emptyTimelineReplayState(
  unavailableReason: TimelineReplayState['unavailableReason'],
): TimelineReplayState {
  return {
    cursorIndex: 0,
    hasFirst: false,
    hasPrevious: false,
    hasNext: false,
    hasLast: false,
    progress: 0,
    progressLabel: '0 / 0',
    status: 'idle',
    statusLabel: timelineReplayStatusLabel('idle'),
    severity: 'info',
    isSingleFrame: false,
    unavailableReason,
  };
}

function timelineLifecycleStatus(value: string): TimelineLifecycleStatus | undefined {
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
