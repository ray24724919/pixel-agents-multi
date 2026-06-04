import type * as vscode from 'vscode';

import type { AgentLifecycleStatus } from './lifecycleStatus.js';

export type TimelineEventKind =
  | 'status.changed'
  | 'tool.started'
  | 'tool.completed'
  | 'permission.requested'
  | 'user_input.requested'
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'token.usage'
  | 'action.hide'
  | 'action.archive'
  | 'action.kill'
  | 'handoff.generated'
  | 'handoff.opened'
  | 'handoff.status_changed'
  | 'handoff.dispatch_prompt_created';

export type TimelineEventSeverity = 'info' | 'success' | 'warning' | 'error';

export type TimelineEventVisibility = 'default' | 'verbose' | 'debug';

export interface TimelineEvent {
  id: string;
  agentId: number;
  timestamp: number;
  kind: TimelineEventKind;
  title: string;
  summary?: string;
  statusAfter?: AgentLifecycleStatus;
  severity?: TimelineEventSeverity;
  source?: 'user' | 'agent' | 'tool' | 'system';
  providerId?: string;
  projectName?: string;
  sessionId?: string;
  runId?: string;
  artifactId?: string;
  artifactStatus?: string;
  previousStatus?: string;
  nextStatus?: string;
  visibility: TimelineEventVisibility;
}

export interface TimelineEventMessage {
  type: 'agentTimelineEvent';
  event: TimelineEvent;
}

type TimelineEventPayload = Omit<TimelineEvent, 'id' | 'timestamp' | 'visibility'> & {
  id?: string;
  timestamp?: number;
  visibility?: TimelineEventVisibility;
};

let timelineEventSequence = 0;

function createTimelineEventId(agentId: number, timestamp: number): string {
  timelineEventSequence = (timelineEventSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `agent-${agentId}-${timestamp}-${timelineEventSequence}`;
}

export function postAgentTimelineEvent(
  webview: vscode.Webview | undefined,
  payload: TimelineEventPayload,
): void {
  const timestamp = payload.timestamp ?? Date.now();
  webview?.postMessage({
    type: 'agentTimelineEvent',
    event: {
      ...payload,
      id: payload.id ?? createTimelineEventId(payload.agentId, timestamp),
      timestamp,
      visibility: payload.visibility ?? 'default',
    },
  });
}
