import type * as vscode from 'vscode';

import {
  postAgentTimelineEvent,
  type TimelineEventKind,
  type TimelineEventVisibility,
} from './timelineEvents.js';
import type { AgentState } from './types.js';

export type AgentLifecycleStatus =
  | 'idle'
  | 'thinking'
  | 'tool_running'
  | 'waiting_user'
  | 'waiting_permission'
  | 'completed'
  | 'error';

export interface AgentLifecycleStatusMessage {
  type: 'agentLifecycleStatus';
  id: number;
  status: AgentLifecycleStatus;
  label: string;
  detail?: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  toolName?: string;
  updatedAt: number;
}

type LifecyclePayload = Omit<AgentLifecycleStatusMessage, 'type' | 'updatedAt'> & {
  updatedAt?: number;
};

interface TimelineOptions {
  kind?: TimelineEventKind;
  title?: string;
  summary?: string;
  visibility?: TimelineEventVisibility;
  providerId?: string;
  projectName?: string;
}

export function postAgentLifecycleStatus(
  webview: vscode.Webview | undefined,
  payload: LifecyclePayload,
  timeline?: TimelineOptions,
): void {
  const updatedAt = payload.updatedAt ?? Date.now();
  webview?.postMessage({
    type: 'agentLifecycleStatus',
    ...payload,
    updatedAt,
  });
  postAgentTimelineEvent(webview, {
    agentId: payload.id,
    timestamp: updatedAt,
    kind: timeline?.kind ?? 'status.changed',
    title: timeline?.title ?? payload.label,
    summary: timeline?.summary ?? payload.detail,
    statusAfter: payload.status,
    severity: payload.severity,
    providerId: timeline?.providerId,
    projectName: timeline?.projectName,
    visibility: timeline?.visibility ?? 'default',
  });
}

export function lifecycleFromTool(
  id: number,
  toolName: string | undefined,
  status: string | undefined,
): LifecyclePayload {
  return {
    id,
    status: 'tool_running',
    label: status || (toolName ? `Using ${toolName}` : 'Using tool'),
    toolName,
    severity: 'info',
  };
}

export function postIdle(webview: vscode.Webview | undefined, id: number): void {
  postAgentLifecycleStatus(webview, {
    id,
    status: 'idle',
    label: 'Idle',
    severity: 'info',
  });
}

export function postThinking(
  webview: vscode.Webview | undefined,
  id: number,
  detail?: string,
): void {
  postAgentLifecycleStatus(webview, {
    id,
    status: 'thinking',
    label: 'Thinking',
    detail,
    severity: 'info',
  });
}

export function postToolRunning(
  webview: vscode.Webview | undefined,
  id: number,
  toolName: string | undefined,
  status: string | undefined,
): void {
  const payload = lifecycleFromTool(id, toolName, status);
  postAgentLifecycleStatus(webview, payload, {
    kind: 'tool.started',
    title: payload.label,
    summary: toolName ? `Tool: ${toolName}` : undefined,
    visibility: 'default',
  });
}

export function postWaitingUser(
  webview: vscode.Webview | undefined,
  id: number,
  detail?: string,
): void {
  postAgentLifecycleStatus(
    webview,
    {
      id,
      status: 'waiting_user',
      label: 'Waiting for input',
      detail,
      severity: 'info',
    },
    {
      kind: 'user_input.requested',
      title: 'Waiting for input',
      summary: detail,
    },
  );
}

export function postWaitingPermission(
  webview: vscode.Webview | undefined,
  id: number,
  detail?: string,
): void {
  postAgentLifecycleStatus(
    webview,
    {
      id,
      status: 'waiting_permission',
      label: 'Waiting for permission',
      detail,
      severity: 'warning',
    },
    {
      kind: 'permission.requested',
      title: 'Waiting for permission',
      summary: detail,
    },
  );
}

export function postCompleted(
  webview: vscode.Webview | undefined,
  id: number,
  detail?: string,
): void {
  postAgentLifecycleStatus(
    webview,
    {
      id,
      status: 'completed',
      label: 'Completed',
      detail,
      severity: 'success',
    },
    {
      kind: 'run.completed',
      title: 'Completed',
      summary: detail,
    },
  );
}

export function postError(webview: vscode.Webview | undefined, id: number, detail?: string): void {
  postAgentLifecycleStatus(
    webview,
    {
      id,
      status: 'error',
      label: 'Error',
      detail,
      severity: 'error',
    },
    {
      kind: 'run.failed',
      title: 'Error',
      summary: detail,
    },
  );
}

export function postAgentLifecycleSnapshot(
  webview: vscode.Webview | undefined,
  agent: AgentState,
): void {
  if (agent.permissionSent) {
    postWaitingPermission(webview, agent.id);
    return;
  }

  const activeTool = agent.activeToolStatuses.entries().next();
  if (!activeTool.done) {
    const [toolId, status] = activeTool.value;
    postToolRunning(webview, agent.id, agent.activeToolNames.get(toolId), status);
    return;
  }

  if (agent.isWaiting) {
    postWaitingUser(webview, agent.id);
    return;
  }

  postIdle(webview, agent.id);
}
