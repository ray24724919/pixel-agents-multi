import type { TimelineHistoryState } from '../../hooks/useExtensionMessages.js';
import {
  buildHandoffExecutorStateModel,
  type HandoffArtifactLibraryItem,
  type HandoffArtifactLibraryState,
  type HandoffExecutorStateTone,
  type HandoffMergeReadinessStatus,
  type HandoffQueueOperatorSummaryStatus,
  type HandoffReviewChecklistState,
} from '../handoffArtifactLibraryModel.js';
import { type HandoffDraftPageModel } from '../handoffDraftPageModel.js';
import { formatRelative } from './formatters.js';
import type {
  AgentSummary,
  HandoffOpenStatus,
  HandoffStatusUpdateStatus,
  HandoffWriteStatus,
} from './types.js';

export function timelineHistoryStatusText(timelineHistory: TimelineHistoryState): string {
  if (timelineHistory.unavailable) return 'Local history unavailable';
  if (timelineHistory.loadedAtMs === undefined) return 'Local history loading';
  const noun = timelineHistory.persistedRecordCount === 1 ? 'record' : 'records';
  return `${timelineHistory.persistedRecordCount.toLocaleString()} persisted ${noun} / loaded ${formatRelative(
    timelineHistory.loadedAtMs,
  )}`;
}

export function handoffLibraryStatusLabel(state: HandoffArtifactLibraryState): string {
  if (state.unavailable) return 'Recent handoffs unavailable';
  if (state.loadedAtMs === undefined) return 'Recent handoffs loading';
  const noun = state.items.length === 1 ? 'handoff' : 'handoffs';
  return `${state.items.length.toLocaleString()} recent ${noun} / refreshed ${formatRelative(
    state.loadedAtMs,
  )}`;
}

export function handoffAgentOptionLabel(
  agent: Pick<AgentSummary, 'id' | 'name' | 'providerId' | 'project'>,
): string {
  return `${agent.name} #${agent.id} / ${agent.providerId} / ${agent.project}`;
}

export function handoffExecutionAgentLabelFromMessage(message: Record<string, unknown>): string {
  const name = typeof message.linkedAgentName === 'string' ? message.linkedAgentName : undefined;
  const id =
    typeof message.linkedAgentId === 'number' && Number.isFinite(message.linkedAgentId)
      ? `Agent #${message.linkedAgentId}`
      : undefined;
  const provider =
    typeof message.linkedAgentProviderId === 'string' ? message.linkedAgentProviderId : undefined;
  return [name ?? id, provider].filter(Boolean).join(' / ');
}

export function handoffExecutionDetailLabel(
  item: HandoffArtifactLibraryItem,
  agents: readonly AgentSummary[],
): string {
  const dispatchPackage = item.dispatchPackage;
  if (!dispatchPackage) return 'No handoff work package yet.';
  const executorState = buildHandoffExecutorStateModel(item, agents);
  const packageLabel = `Package ${dispatchPackage.statusLabel}: ${dispatchPackage.packageRelativePath}`;
  const linkedLabel = [executorState.providerLabel, executorState.agentLabel]
    .filter(Boolean)
    .join(' / ');
  return [
    packageLabel,
    `Executor ${executorState.label}`,
    linkedLabel,
    executorState.detail,
    `Next: ${executorState.recommendedAction}`,
  ]
    .filter(Boolean)
    .join(' / ');
}

export function handoffReviewChecklistClass(state: HandoffReviewChecklistState): string {
  if (state === 'ok') return 'border-status-waiting text-status-waiting';
  if (state === 'missing') return 'border-status-error text-status-error';
  if (state === 'warning') return 'border-status-permission text-status-permission';
  return 'border-border text-text-muted';
}

export function handoffExecutorStateToneClass(tone: HandoffExecutorStateTone): string {
  if (tone === 'danger') return 'border-status-error text-status-error';
  if (tone === 'warning') return 'border-status-permission text-status-permission';
  if (tone === 'active') return 'border-status-active text-status-active';
  if (tone === 'success') return 'border-status-waiting text-status-waiting';
  if (tone === 'ready') return 'border-accent text-accent-bright';
  return 'border-border text-text-muted';
}

export function handoffMergeReadinessClass(status: HandoffMergeReadinessStatus): string {
  if (status === 'already_merged') return 'border-status-waiting bg-bg text-status-waiting';
  if (status === 'ready_to_inspect') return 'border-accent bg-bg text-accent-bright';
  if (status === 'blocked') return 'border-status-error bg-bg text-status-error';
  if (status === 'needs_report' || status === 'needs_review' || status === 'active') {
    return 'border-status-permission bg-bg text-status-permission';
  }
  return 'border-border bg-bg text-text-muted';
}

export function handoffQueueOperatorSummaryClass(
  status: HandoffQueueOperatorSummaryStatus,
): string {
  if (status === 'warning') return 'border-status-error text-status-error';
  if (status === 'ready') return 'border-accent text-accent-bright';
  if (status === 'active') return 'border-status-active text-status-active';
  if (status === 'done') return 'border-status-waiting text-status-waiting';
  return 'border-border text-text-muted';
}

export function handoffDraftNoticeText(model: HandoffDraftPageModel): string | undefined {
  if (model.notice === 'no-timeline-events') {
    return 'No timeline events available.';
  }
  if (model.notice === 'no-replay-session-selected') {
    return 'No replay session selected; using the current Timeline filtered scope.';
  }
  return undefined;
}

export function handoffCopyStatusLabel(status: 'idle' | 'copied' | 'failed'): string {
  if (status === 'copied') return 'Markdown copied';
  if (status === 'failed') return 'Clipboard copy failed';
  return 'Preview ready; copy or write locally.';
}

export function handoffWriteStatusLabel(
  status: HandoffWriteStatus,
  writtenPath: string,
  error: string,
): string {
  if (status === 'writing') return 'Writing editable Markdown into docs/agent-handoffs/...';
  if (status === 'written') return `Written and opened: ${writtenPath || 'handoff draft'}`;
  if (status === 'failed') return `Write failed: ${error || 'Could not write handoff draft.'}`;
  return 'Repo write creates an editable Markdown file; nothing is staged or committed.';
}

export function handoffOpenStatusLabel(
  status: HandoffOpenStatus,
  openedPath: string,
  error: string,
): string {
  if (status === 'opening') return 'Opening handoff Markdown in VS Code...';
  if (status === 'opened') return `Opened: ${openedPath || 'handoff artifact'}`;
  if (status === 'failed') return `Open failed: ${error || 'Could not open handoff artifact.'}`;
  return 'Open reads only validated repo-local Markdown handoffs.';
}

export function handoffStatusUpdateLabel(
  status: HandoffStatusUpdateStatus,
  updatedPath: string,
  error: string,
): string {
  if (status === 'updating') return 'Updating handoff metadata sidecar...';
  if (status === 'updated') return `Status updated: ${updatedPath || 'handoff artifact'}`;
  if (status === 'failed') return `Status update failed: ${error || 'Could not update handoff.'}`;
  return 'Status actions update only local metadata; Markdown remains editable.';
}
