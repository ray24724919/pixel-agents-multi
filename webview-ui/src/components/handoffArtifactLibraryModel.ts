export interface HandoffArtifactLibraryItem {
  relativePath: string;
  filename: string;
  modifiedAt: number;
  sizeBytes: number;
  title?: string;
  artifactId?: string;
  artifactType?: string;
  metadataRelativePath?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  providerId?: string;
  projectName?: string;
  agentName?: string;
  sessionId?: string;
  runId?: string;
  dispatchPackage?: HandoffDispatchPackage;
  completion?: HandoffCompletionStatus;
  review?: HandoffCompletionReview;
  executionLiveHint?: HandoffExecutionLiveHint;
  displayTitle: string;
  displayDetail: string;
  statusLabel: string;
}

export interface HandoffCompletionStatus {
  reportExists: boolean;
  reportRelativePath: string;
  reportModifiedAt?: number;
  reportSizeBytes?: number;
  branchName: string;
  branchExists?: boolean;
  branchMergedToMain?: boolean;
  checkedAt: string;
  statusLabel: string;
}

export type HandoffCompletionReviewStatus =
  | 'not_ready'
  | 'active'
  | 'blocked'
  | 'needs_report'
  | 'needs_review'
  | 'ready_to_merge'
  | 'merged'
  | 'unknown';

export interface HandoffCompletionReviewReport {
  title?: string;
  hasSummary: boolean;
  hasFilesChanged: boolean;
  hasValidation: boolean;
  hasAcceptanceCriteria: boolean;
  hasDeviations: boolean;
  validationLines: string[];
  changedFileLines: string[];
  riskLines: string[];
  truncated: boolean;
}

export interface HandoffCompletionReviewGit {
  branchExists?: boolean;
  branchMergedToMain?: boolean;
  branchHeadSha?: string;
  mainHeadSha?: string;
  aheadCount?: number;
  behindCount?: number;
}

export interface HandoffCompletionReview {
  status: HandoffCompletionReviewStatus;
  statusLabel: string;
  nextActionLabel: string;
  reportRelativePath?: string;
  branchName?: string;
  report?: HandoffCompletionReviewReport;
  git?: HandoffCompletionReviewGit;
  warnings: string[];
  checkedAt: string;
}

export type HandoffDispatchStatus = 'draft' | 'ready' | 'dispatched' | 'completed' | 'blocked';
export type HandoffExecutionStatus =
  | 'linked'
  | 'active'
  | 'waiting'
  | 'completed'
  | 'blocked'
  | 'unknown';

export interface HandoffExecutionMetadata {
  agentId?: number;
  agentName?: string;
  providerId?: string;
  projectName?: string;
  sessionId?: string;
  runId?: string;
  linkedAt: string;
  updatedAt: string;
  status: HandoffExecutionStatus;
  statusLabel: string;
}

export interface HandoffDispatchPackage {
  packageRelativePath: string;
  branchName: string;
  reportRelativePath: string;
  status: HandoffDispatchStatus;
  createdAt: string;
  updatedAt: string;
  execution?: HandoffExecutionMetadata;
  statusLabel: string;
}

export interface HandoffExecutionLiveHint {
  agentId: number;
  label: string;
  statusGroup?: string;
}

export interface HandoffExecutionQueueSummary {
  dispatchPackageCount: number;
  linkedPackageCount: number;
  completedPackageCount: number;
  blockedPackageCount: number;
  dispatchCounts: Record<HandoffDispatchStatus, number>;
  executionCounts: Record<HandoffExecutionStatus, number>;
  latestActivityLabel?: string;
}

export interface HandoffArtifactLibraryState {
  items: HandoffArtifactLibraryItem[];
  loadedAtMs?: number;
  unavailable: boolean;
  error?: string;
}

export interface OpenHandoffArtifactMessage {
  type: 'openHandoffArtifact';
  requestId: string;
  relativePath: string;
}

export type HandoffArtifactLocalStatus = 'draft' | 'reviewed' | 'stale';

export interface HandoffArtifactStatusAction {
  nextStatus: HandoffArtifactLocalStatus;
  label: string;
  disabled: boolean;
}

export interface UpdateHandoffArtifactStatusMessage {
  type: 'updateHandoffArtifactStatus';
  requestId: string;
  relativePath: string;
  nextStatus: HandoffArtifactLocalStatus;
}

export interface CreateHandoffDispatchPromptMessage {
  type: 'createHandoffDispatchPrompt';
  requestId: string;
  relativePath: string;
}

export type HandoffDispatchPromptStatus = 'idle' | 'creating' | 'copied' | 'failed';
export type HandoffWorkPackageStatus =
  | 'idle'
  | 'creating'
  | 'created'
  | 'opening'
  | 'opened'
  | 'copying'
  | 'copied'
  | 'updating'
  | 'updated'
  | 'failed';

export interface CreateHandoffWorkPackageMessage {
  type: 'createHandoffWorkPackage';
  requestId: string;
  relativePath: string;
}

export interface OpenHandoffWorkPackageMessage {
  type: 'openHandoffWorkPackage';
  requestId: string;
  relativePath: string;
}

export interface CreateHandoffWorkPackagePromptMessage {
  type: 'createHandoffWorkPackagePrompt';
  requestId: string;
  relativePath: string;
}

export interface UpdateHandoffDispatchStatusMessage {
  type: 'updateHandoffDispatchStatus';
  requestId: string;
  relativePath: string;
  nextStatus: HandoffDispatchStatus;
}

export interface LinkHandoffExecutionAgentMessage {
  type: 'linkHandoffExecutionAgent';
  requestId: string;
  relativePath: string;
  agentId: number;
}

export interface UpdateHandoffExecutionStatusMessage {
  type: 'updateHandoffExecutionStatus';
  requestId: string;
  relativePath: string;
  nextStatus: HandoffExecutionStatus;
}

export interface LaunchHandoffExecutorMessage {
  type: 'launchHandoffExecutor';
  requestId: string;
  relativePath: string;
  providerId: 'codex' | 'claude';
}

export interface RefreshHandoffCompletionMessage {
  type: 'refreshHandoffCompletion';
  requestId: string;
  relativePath: string;
}

export interface OpenHandoffReportMessage {
  type: 'openHandoffReport';
  requestId: string;
  relativePath: string;
}

export interface HandoffDispatchStatusAction {
  nextStatus: HandoffDispatchStatus;
  label: string;
  disabled: boolean;
}

export interface HandoffExecutionStatusAction {
  nextStatus: HandoffExecutionStatus;
  label: string;
  disabled: boolean;
}

export interface HandoffStatusSelectAction<TStatus extends string> {
  nextStatus: TStatus;
  label: string;
  disabled: boolean;
}

export interface HandoffStatusSelectOption<TStatus extends string> {
  value: TStatus;
  label: string;
  disabled: boolean;
  current: boolean;
}

export interface HandoffStatusSelectModel<TStatus extends string> {
  options: HandoffStatusSelectOption<TStatus>[];
  disabled: boolean;
}

export type HandoffExecutionActionStatus =
  | 'idle'
  | 'linking'
  | 'linked'
  | 'updating'
  | 'updated'
  | 'launching'
  | 'launched'
  | 'refreshing'
  | 'refreshed'
  | 'opening_report'
  | 'report_opened'
  | 'failed';

export type HandoffQueueGroup =
  | 'all'
  | 'needs_dispatch'
  | 'active_waiting'
  | 'blocked'
  | 'report_ready'
  | 'done';

export interface HandoffQueueSummary {
  totalPackages: number;
  needsDispatch: number;
  activeWaiting: number;
  blocked: number;
  reportReady: number;
  done: number;
}

export type HandoffQueueOperatorSummaryStatus = 'idle' | 'warning' | 'active' | 'ready' | 'done';

export interface HandoffQueueOperatorSummary {
  status: HandoffQueueOperatorSummaryStatus;
  label: string;
  detail: string;
  targetGroup: HandoffQueueGroup;
  actionLabel: string;
}

export type HandoffExecutorState =
  | 'not_started'
  | 'active'
  | 'waiting'
  | 'blocked'
  | 'completed'
  | 'report_ready'
  | 'stale_unknown';

export type HandoffExecutorStateTone =
  | 'neutral'
  | 'active'
  | 'warning'
  | 'danger'
  | 'success'
  | 'ready';

export type HandoffExecutorNextActionKind =
  | 'create_work_package'
  | 'launch'
  | 'inspect_terminal'
  | 'refresh_completion'
  | 'open_report'
  | 'mark_reviewed'
  | 'wait'
  | 'none';

export interface HandoffExecutorAgentSnapshot {
  id: number;
  name?: string;
  providerId?: string;
  project?: string;
  status?: string;
  statusGroup?: string;
  activity?: string;
  detail?: string;
  sessionId?: string;
  isPaused?: boolean;
  hidden?: boolean;
}

export interface HandoffExecutorStateModel {
  state: HandoffExecutorState;
  label: string;
  detail: string;
  tone: HandoffExecutorStateTone;
  recommendedAction: string;
  nextActionKind: HandoffExecutorNextActionKind;
  canRefreshCompletion: boolean;
  canOpenReport: boolean;
  shouldInspectTerminal: boolean;
  reportReady: boolean;
  linkedAgentVisible: boolean;
  providerLabel?: string;
  agentLabel?: string;
}

export type HandoffReviewChecklistState = 'ok' | 'missing' | 'warning' | 'unknown';
export type HandoffReviewChecklistId =
  | 'summary'
  | 'files_changed'
  | 'validation'
  | 'warnings'
  | 'branch';

export interface HandoffReviewChecklistItem {
  id: HandoffReviewChecklistId;
  label: string;
  state: HandoffReviewChecklistState;
  detail: string;
}

export type HandoffReviewRecommendedActionKind =
  | 'create_work_package'
  | 'refresh_completion'
  | 'open_report'
  | 'mark_reviewed'
  | 'wait_for_report'
  | 'none';

export interface HandoffReviewRecommendedAction {
  kind: HandoffReviewRecommendedActionKind;
  label: string;
  disabled: boolean;
  detail: string;
}

export type HandoffMergeReadinessStatus =
  | 'already_merged'
  | 'ready_to_inspect'
  | 'needs_report'
  | 'needs_review'
  | 'blocked'
  | 'active'
  | 'unknown';

export interface HandoffMergeReadiness {
  status: HandoffMergeReadinessStatus;
  label: string;
  detail: string;
  branchStatus: string;
  reportStatus: string;
  validationStatus: string;
  warningCount: number;
  recommendedStep: string;
  canCopyChecklist: boolean;
}

export type HandoffChecklistCopyKind = 'merge' | 'review' | 'blocker' | 'status' | 'closeout';

export interface HandoffChecklistCopyModel {
  kind: HandoffChecklistCopyKind;
  actionLabel: string;
  copiedLabel: string;
  title: string;
  text?: string;
  disabled: boolean;
  canCopy: boolean;
}

export const initialHandoffArtifactLibraryState: HandoffArtifactLibraryState = {
  items: [],
  unavailable: false,
};

export function handoffArtifactLibraryStateFromLoadedMessage(
  message: Record<string, unknown>,
): HandoffArtifactLibraryState {
  return {
    items: Array.isArray(message.artifacts)
      ? message.artifacts
          .map(handoffArtifactItemFromUnknown)
          .filter((item): item is HandoffArtifactLibraryItem => item !== undefined)
      : [],
    loadedAtMs: numberValue(message.loadedAtMs),
    unavailable: message.unavailable === true,
    error: stringValue(message.error),
  };
}

export function buildOpenHandoffArtifactMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath'>,
  requestId: string,
): OpenHandoffArtifactMessage | undefined {
  if (!requestId || !item.relativePath) return undefined;
  return {
    type: 'openHandoffArtifact',
    requestId,
    relativePath: item.relativePath,
  };
}

export function handoffArtifactStatusActions(
  item: Pick<HandoffArtifactLibraryItem, 'artifactId' | 'metadataRelativePath' | 'status'>,
): HandoffArtifactStatusAction[] {
  const canUpdate = !!item.artifactId && !!item.metadataRelativePath;
  return (['reviewed', 'stale', 'draft'] as const).map((nextStatus) => ({
    nextStatus,
    label: handoffArtifactStatusActionLabel(nextStatus),
    disabled: !canUpdate || item.status === nextStatus,
  }));
}

export function buildUpdateHandoffArtifactStatusMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath'>,
  nextStatus: HandoffArtifactLocalStatus,
  requestId: string,
): UpdateHandoffArtifactStatusMessage | undefined {
  if (!requestId || !item.relativePath || !isLocalHandoffArtifactStatus(nextStatus)) {
    return undefined;
  }
  return {
    type: 'updateHandoffArtifactStatus',
    requestId,
    relativePath: item.relativePath,
    nextStatus,
  };
}

export function canCreateHandoffDispatchPrompt(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath'>,
): boolean {
  return !!item.relativePath;
}

export function buildCreateHandoffDispatchPromptMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath'>,
  requestId: string,
): CreateHandoffDispatchPromptMessage | undefined {
  if (!requestId || !canCreateHandoffDispatchPrompt(item)) return undefined;
  return {
    type: 'createHandoffDispatchPrompt',
    requestId,
    relativePath: item.relativePath,
  };
}

export function handoffDispatchPromptStatusLabel(
  status: HandoffDispatchPromptStatus,
  branchName: string,
  reportRelativePath: string,
  error: string,
): string {
  if (status === 'creating') return 'Creating dispatch prompt...';
  if (status === 'copied') {
    return `Dispatch prompt copied: ${branchName || 'executor branch'} / ${
      reportRelativePath || 'executor report'
    }`;
  }
  if (status === 'failed') {
    return `Dispatch prompt failed: ${error || 'Could not copy dispatch prompt.'}`;
  }
  return 'Dispatch prompts reference handoff Markdown; they do not include the handoff body.';
}

export function canCreateHandoffWorkPackage(
  item: Pick<
    HandoffArtifactLibraryItem,
    'relativePath' | 'artifactId' | 'metadataRelativePath' | 'dispatchPackage'
  >,
): boolean {
  return (
    !!item.relativePath && !!item.artifactId && !!item.metadataRelativePath && !item.dispatchPackage
  );
}

export function canUseHandoffWorkPackage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
): boolean {
  return !!item.relativePath && !!item.dispatchPackage?.packageRelativePath;
}

export function buildCreateHandoffWorkPackageMessage(
  item: Pick<
    HandoffArtifactLibraryItem,
    'relativePath' | 'artifactId' | 'metadataRelativePath' | 'dispatchPackage'
  >,
  requestId: string,
): CreateHandoffWorkPackageMessage | undefined {
  if (!requestId || !canCreateHandoffWorkPackage(item)) return undefined;
  return {
    type: 'createHandoffWorkPackage',
    requestId,
    relativePath: item.relativePath,
  };
}

export function buildOpenHandoffWorkPackageMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
  requestId: string,
): OpenHandoffWorkPackageMessage | undefined {
  if (!requestId || !canUseHandoffWorkPackage(item)) return undefined;
  return {
    type: 'openHandoffWorkPackage',
    requestId,
    relativePath: item.relativePath,
  };
}

export function buildCreateHandoffWorkPackagePromptMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
  requestId: string,
): CreateHandoffWorkPackagePromptMessage | undefined {
  if (!requestId || !canUseHandoffWorkPackage(item)) return undefined;
  return {
    type: 'createHandoffWorkPackagePrompt',
    requestId,
    relativePath: item.relativePath,
  };
}

export function handoffDispatchStatusActions(
  item: Pick<HandoffArtifactLibraryItem, 'dispatchPackage' | 'relativePath'>,
): HandoffDispatchStatusAction[] {
  const canUpdate = canUseHandoffWorkPackage(item);
  return (['ready', 'dispatched', 'completed', 'blocked', 'draft'] as const).map((nextStatus) => ({
    nextStatus,
    label: handoffDispatchStatusActionLabel(nextStatus),
    disabled: !canUpdate || item.dispatchPackage?.status === nextStatus,
  }));
}

export function buildUpdateHandoffDispatchStatusMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
  nextStatus: HandoffDispatchStatus,
  requestId: string,
): UpdateHandoffDispatchStatusMessage | undefined {
  if (!requestId || !canUseHandoffWorkPackage(item) || !isHandoffDispatchStatus(nextStatus)) {
    return undefined;
  }
  return {
    type: 'updateHandoffDispatchStatus',
    requestId,
    relativePath: item.relativePath,
    nextStatus,
  };
}

export function canLinkHandoffExecutionAgent(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
  agentId: number | undefined,
): boolean {
  return canUseHandoffWorkPackage(item) && safeAgentId(agentId) !== undefined;
}

export function buildLinkHandoffExecutionAgentMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
  agentId: number | undefined,
  requestId: string,
): LinkHandoffExecutionAgentMessage | undefined {
  const safeId = safeAgentId(agentId);
  if (!requestId || safeId === undefined || !canUseHandoffWorkPackage(item)) return undefined;
  return {
    type: 'linkHandoffExecutionAgent',
    requestId,
    relativePath: item.relativePath,
    agentId: safeId,
  };
}

export function handoffExecutionStatusActions(
  item: Pick<HandoffArtifactLibraryItem, 'dispatchPackage' | 'relativePath'>,
): HandoffExecutionStatusAction[] {
  const canUpdate = canUseHandoffWorkPackage(item) && !!item.dispatchPackage?.execution;
  return (['active', 'waiting', 'completed', 'blocked', 'unknown'] as const).map((nextStatus) => ({
    nextStatus,
    label: handoffExecutionStatusActionLabel(nextStatus),
    disabled: !canUpdate || item.dispatchPackage?.execution?.status === nextStatus,
  }));
}

export function buildHandoffStatusSelectModel<TStatus extends string>(
  value: TStatus,
  selectedLabel: string,
  actions: readonly HandoffStatusSelectAction<TStatus>[],
  disabled = false,
): HandoffStatusSelectModel<TStatus> {
  const hasCurrentOption = actions.some((action) => action.nextStatus === value);
  const optionActions = hasCurrentOption
    ? actions
    : [{ nextStatus: value, label: selectedLabel, disabled: true }, ...actions];
  return {
    disabled: disabled || actions.every((action) => action.disabled),
    options: optionActions.map((action) => ({
      value: action.nextStatus,
      label: action.nextStatus === value ? `Current: ${selectedLabel}` : action.label,
      disabled: disabled || action.disabled,
      current: action.nextStatus === value,
    })),
  };
}

export function buildUpdateHandoffExecutionStatusMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
  nextStatus: HandoffExecutionStatus,
  requestId: string,
): UpdateHandoffExecutionStatusMessage | undefined {
  if (
    !requestId ||
    !canUseHandoffWorkPackage(item) ||
    !item.dispatchPackage?.execution ||
    !isHandoffExecutionStatus(nextStatus)
  ) {
    return undefined;
  }
  return {
    type: 'updateHandoffExecutionStatus',
    requestId,
    relativePath: item.relativePath,
    nextStatus,
  };
}

export function buildLaunchHandoffExecutorMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
  requestId: string,
  providerId: unknown = 'codex',
): LaunchHandoffExecutorMessage | undefined {
  if (!requestId || !canUseHandoffWorkPackage(item)) return undefined;
  const safeProviderId = providerId === 'claude' ? 'claude' : 'codex';
  return {
    type: 'launchHandoffExecutor',
    requestId,
    relativePath: item.relativePath,
    providerId: safeProviderId,
  };
}

export function buildRefreshHandoffCompletionMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'dispatchPackage'>,
  requestId: string,
): RefreshHandoffCompletionMessage | undefined {
  if (!requestId || !canUseHandoffWorkPackage(item)) return undefined;
  return {
    type: 'refreshHandoffCompletion',
    requestId,
    relativePath: item.relativePath,
  };
}

export function buildOpenHandoffReportMessage(
  item: Pick<HandoffArtifactLibraryItem, 'relativePath' | 'completion'>,
  requestId: string,
): OpenHandoffReportMessage | undefined {
  if (!requestId || !item.relativePath || item.completion?.reportExists !== true) {
    return undefined;
  }
  return {
    type: 'openHandoffReport',
    requestId,
    relativePath: item.relativePath,
  };
}

export function buildHandoffExecutionQueueSummary(
  items: readonly Pick<HandoffArtifactLibraryItem, 'dispatchPackage' | 'updatedAt'>[],
): HandoffExecutionQueueSummary {
  const dispatchCounts: Record<HandoffDispatchStatus, number> = {
    draft: 0,
    ready: 0,
    dispatched: 0,
    completed: 0,
    blocked: 0,
  };
  const executionCounts: Record<HandoffExecutionStatus, number> = {
    linked: 0,
    active: 0,
    waiting: 0,
    completed: 0,
    blocked: 0,
    unknown: 0,
  };
  let dispatchPackageCount = 0;
  let linkedPackageCount = 0;
  let completedPackageCount = 0;
  let blockedPackageCount = 0;
  let latestActivityMs = 0;
  for (const item of items) {
    const dispatchPackage = item.dispatchPackage;
    if (!dispatchPackage) continue;
    dispatchPackageCount += 1;
    dispatchCounts[dispatchPackage.status] += 1;
    if (dispatchPackage.status === 'completed') completedPackageCount += 1;
    if (dispatchPackage.status === 'blocked') blockedPackageCount += 1;
    latestActivityMs = Math.max(
      latestActivityMs,
      timestampValue(dispatchPackage.updatedAt) ?? 0,
      timestampValue(item.updatedAt) ?? 0,
    );
    const execution = dispatchPackage.execution;
    if (!execution) continue;
    linkedPackageCount += 1;
    executionCounts[execution.status] += 1;
    if (execution.status === 'completed') completedPackageCount += 1;
    if (execution.status === 'blocked') blockedPackageCount += 1;
    latestActivityMs = Math.max(latestActivityMs, timestampValue(execution.updatedAt) ?? 0);
  }
  return {
    dispatchPackageCount,
    linkedPackageCount,
    completedPackageCount,
    blockedPackageCount,
    dispatchCounts,
    executionCounts,
    latestActivityLabel: latestActivityMs > 0 ? formatDateTime(latestActivityMs) : undefined,
  };
}

export function buildHandoffQueueSummary(
  items: readonly Pick<HandoffArtifactLibraryItem, 'dispatchPackage' | 'completion' | 'review'>[],
  agents: readonly HandoffExecutorAgentSnapshot[] = [],
): HandoffQueueSummary {
  const summary: HandoffQueueSummary = {
    totalPackages: 0,
    needsDispatch: 0,
    activeWaiting: 0,
    blocked: 0,
    reportReady: 0,
    done: 0,
  };
  for (const item of items) {
    if (!item.dispatchPackage) continue;
    summary.totalPackages += 1;
    const group = handoffQueueGroupForItem(item, agents);
    if (group === 'needs_dispatch') summary.needsDispatch += 1;
    if (group === 'active_waiting') summary.activeWaiting += 1;
    if (group === 'blocked') summary.blocked += 1;
    if (group === 'report_ready') summary.reportReady += 1;
    if (group === 'done') summary.done += 1;
  }
  return summary;
}

export function buildHandoffQueueOperatorSummary(
  items: readonly Pick<HandoffArtifactLibraryItem, 'dispatchPackage' | 'completion' | 'review'>[],
  agents: readonly HandoffExecutorAgentSnapshot[] = [],
): HandoffQueueOperatorSummary {
  const summary = buildHandoffQueueSummary(items, agents);
  if (summary.totalPackages === 0) {
    return {
      status: 'idle',
      label: 'No package-backed handoffs yet',
      detail: 'Create work packages to start queue supervision.',
      targetGroup: 'all',
      actionLabel: '',
    };
  }
  if (summary.blocked > 0) {
    return {
      status: 'warning',
      label:
        summary.blocked === 1
          ? '1 blocked package needs attention'
          : `${summary.blocked} blocked packages need attention`,
      detail: 'Open blockers before dispatching more work.',
      targetGroup: 'blocked',
      actionLabel: 'Show blocked',
    };
  }
  if (summary.reportReady > 0) {
    return {
      status: 'ready',
      label:
        summary.reportReady === 1
          ? '1 report ready for review'
          : `${summary.reportReady} reports ready for review`,
      detail: 'Inspect executor reports before closing handoffs.',
      targetGroup: 'report_ready',
      actionLabel: 'Show report ready',
    };
  }
  if (summary.activeWaiting > 0) {
    return {
      status: 'active',
      label:
        summary.activeWaiting === 1
          ? '1 package active, waiting, or unknown'
          : `${summary.activeWaiting} packages active, waiting, or unknown`,
      detail:
        'Check executor state, stale links, or terminal prompts before dispatching more work.',
      targetGroup: 'active_waiting',
      actionLabel: 'Show active / waiting / unknown',
    };
  }
  if (summary.needsDispatch > 0) {
    return {
      status: 'idle',
      label:
        summary.needsDispatch === 1
          ? '1 package needs dispatch'
          : `${summary.needsDispatch} packages need dispatch`,
      detail: 'Launch or link an executor to move the queue forward.',
      targetGroup: 'needs_dispatch',
      actionLabel: 'Show needs dispatch',
    };
  }
  if (summary.done > 0) {
    return {
      status: 'done',
      label: summary.done === 1 ? '1 package done' : `${summary.done} packages done`,
      detail: 'No active handoff queue attention needed.',
      targetGroup: 'done',
      actionLabel: 'Show done',
    };
  }
  return {
    status: 'idle',
    label: `${summary.totalPackages} packages queued`,
    detail: 'Pick a queue group to inspect package state.',
    targetGroup: 'all',
    actionLabel: 'Show all',
  };
}

export function buildHandoffExecutorStateModel(
  item: Pick<HandoffArtifactLibraryItem, 'dispatchPackage' | 'completion' | 'review'>,
  agents: readonly HandoffExecutorAgentSnapshot[] = [],
): HandoffExecutorStateModel {
  const dispatchPackage = item.dispatchPackage;
  const execution = dispatchPackage?.execution;
  const canRefreshCompletion = !!dispatchPackage?.packageRelativePath;
  const canOpenReport = item.completion?.reportExists === true;
  const reportReady =
    canOpenReport ||
    item.review?.report !== undefined ||
    item.review?.status === 'needs_review' ||
    item.review?.status === 'ready_to_merge';
  const base = {
    canRefreshCompletion,
    canOpenReport,
    reportReady,
  };

  if (!dispatchPackage) {
    return {
      ...base,
      state: 'not_started',
      label: 'No work package',
      detail: 'Create a work package before launching an executor.',
      tone: 'neutral',
      recommendedAction: 'Create work package',
      nextActionKind: 'create_work_package',
      shouldInspectTerminal: false,
      linkedAgentVisible: false,
    };
  }

  if (item.review?.status === 'blocked') {
    return {
      ...base,
      state: 'blocked',
      label: 'Blocked',
      detail: reportReady
        ? 'Completion review found a blocker in the executor report.'
        : 'Executor review is blocked and no report is ready yet.',
      tone: 'danger',
      recommendedAction: canOpenReport ? 'Open report' : 'Inspect terminal',
      nextActionKind: canOpenReport ? 'open_report' : 'inspect_terminal',
      shouldInspectTerminal: !canOpenReport,
      linkedAgentVisible: linkedExecutorAgent(execution, agents) !== undefined,
      ...executorIdentity(execution, agents),
    };
  }

  if (item.review?.status === 'merged') {
    return {
      ...base,
      state: 'completed',
      label: 'Completed',
      detail: 'Branch is merged into main.',
      tone: 'success',
      recommendedAction: 'Mark reviewed',
      nextActionKind: 'mark_reviewed',
      shouldInspectTerminal: false,
      linkedAgentVisible: linkedExecutorAgent(execution, agents) !== undefined,
      ...executorIdentity(execution, agents),
    };
  }

  if (
    item.review?.status === 'needs_review' ||
    item.review?.status === 'ready_to_merge' ||
    canOpenReport
  ) {
    return {
      ...base,
      state: 'report_ready',
      label: 'Report ready',
      detail:
        item.review?.status === 'ready_to_merge'
          ? 'Report and branch signals are ready for supervisor inspection.'
          : 'Executor report exists and is ready for supervisor review.',
      tone: 'ready',
      recommendedAction: canOpenReport ? 'Open report' : 'Refresh completion',
      nextActionKind: canOpenReport ? 'open_report' : 'refresh_completion',
      shouldInspectTerminal: false,
      linkedAgentVisible: linkedExecutorAgent(execution, agents) !== undefined,
      ...executorIdentity(execution, agents),
    };
  }

  if (dispatchPackage.status === 'blocked' || execution?.status === 'blocked') {
    return {
      ...base,
      state: 'blocked',
      label: 'Blocked',
      detail: 'Package or execution metadata is marked blocked.',
      tone: 'danger',
      recommendedAction: canOpenReport ? 'Open report' : 'Inspect terminal',
      nextActionKind: canOpenReport ? 'open_report' : 'inspect_terminal',
      shouldInspectTerminal: !canOpenReport,
      linkedAgentVisible: linkedExecutorAgent(execution, agents) !== undefined,
      ...executorIdentity(execution, agents),
    };
  }

  if (dispatchPackage.status === 'completed' || execution?.status === 'completed') {
    return {
      ...base,
      state: 'completed',
      label: 'Completed',
      detail: reportReady
        ? 'Execution is marked complete and report signals are available.'
        : 'Execution is marked complete; refresh completion to load report signals.',
      tone: 'success',
      recommendedAction: reportReady ? 'Open report' : 'Refresh completion',
      nextActionKind: reportReady ? 'open_report' : 'refresh_completion',
      shouldInspectTerminal: false,
      linkedAgentVisible: linkedExecutorAgent(execution, agents) !== undefined,
      ...executorIdentity(execution, agents),
    };
  }

  if (!execution) {
    if (dispatchPackage.status === 'dispatched') {
      return {
        ...base,
        state: 'stale_unknown',
        label: 'Stale / unknown',
        detail: 'Package is dispatched but no executor metadata is linked.',
        tone: 'warning',
        recommendedAction: 'Link executor or refresh completion',
        nextActionKind: 'inspect_terminal',
        shouldInspectTerminal: true,
        linkedAgentVisible: false,
      };
    }
    return {
      ...base,
      state: 'not_started',
      label: 'Ready to launch',
      detail: 'Work package exists but no executor is linked yet.',
      tone: 'neutral',
      recommendedAction: 'Launch or link executor',
      nextActionKind: 'launch',
      shouldInspectTerminal: false,
      linkedAgentVisible: false,
    };
  }

  const linkedAgent = linkedExecutorAgent(execution, agents);
  const identity = executorIdentity(execution, agents);
  if (!linkedAgent) {
    return {
      ...base,
      state: 'stale_unknown',
      label: 'Stale / unknown',
      detail: 'Execution metadata points to an agent that is not visible.',
      tone: 'warning',
      recommendedAction: 'Inspect terminal or refresh completion',
      nextActionKind: 'inspect_terminal',
      shouldInspectTerminal: true,
      linkedAgentVisible: false,
      ...identity,
    };
  }

  if (linkedAgent.isPaused || linkedAgent.statusGroup === 'paused') {
    return {
      ...base,
      state: 'waiting',
      label: 'Waiting for input',
      detail: `${executorAgentDisplayName(linkedAgent)} is paused.`,
      tone: 'warning',
      recommendedAction: 'Inspect terminal',
      nextActionKind: 'inspect_terminal',
      shouldInspectTerminal: true,
      linkedAgentVisible: true,
      ...identity,
    };
  }

  if (
    linkedAgent.statusGroup === 'needs_me' ||
    (linkedAgent.statusGroup === 'waiting' && execution.status === 'waiting')
  ) {
    return {
      ...base,
      state: 'waiting',
      label: 'Waiting for approval',
      detail: executorLiveDetail(linkedAgent, 'Executor is waiting for user input or approval.'),
      tone: 'warning',
      recommendedAction: 'Inspect terminal',
      nextActionKind: 'inspect_terminal',
      shouldInspectTerminal: true,
      linkedAgentVisible: true,
      ...identity,
    };
  }

  if (linkedAgent.statusGroup === 'error') {
    return {
      ...base,
      state: 'blocked',
      label: 'Blocked',
      detail: executorLiveDetail(linkedAgent, 'Visible executor reports an error.'),
      tone: 'danger',
      recommendedAction: canOpenReport ? 'Open report' : 'Inspect terminal',
      nextActionKind: canOpenReport ? 'open_report' : 'inspect_terminal',
      shouldInspectTerminal: !canOpenReport,
      linkedAgentVisible: true,
      ...identity,
    };
  }

  if (linkedAgent.statusGroup === 'active' || linkedAgent.statusGroup === 'delegating') {
    return {
      ...base,
      state: 'active',
      label: 'Active',
      detail: executorLiveDetail(linkedAgent, 'Visible executor is working.'),
      tone: 'active',
      recommendedAction: 'Refresh completion later',
      nextActionKind: 'refresh_completion',
      shouldInspectTerminal: false,
      linkedAgentVisible: true,
      ...identity,
    };
  }

  if (execution.status === 'active' || execution.status === 'linked') {
    return {
      ...base,
      state: 'stale_unknown',
      label: 'Stale / unknown',
      detail: executorLiveDetail(
        linkedAgent,
        'Linked executor is visible but idle while metadata still says active.',
      ),
      tone: 'warning',
      recommendedAction: 'Inspect terminal or refresh completion',
      nextActionKind: 'inspect_terminal',
      shouldInspectTerminal: true,
      linkedAgentVisible: true,
      ...identity,
    };
  }

  return {
    ...base,
    state: 'stale_unknown',
    label: 'Stale / unknown',
    detail: executorLiveDetail(linkedAgent, 'Executor state is unclear from local signals.'),
    tone: 'warning',
    recommendedAction: 'Inspect terminal or refresh completion',
    nextActionKind: 'inspect_terminal',
    shouldInspectTerminal: true,
    linkedAgentVisible: true,
    ...identity,
  };
}

function linkedExecutorAgent(
  execution: HandoffExecutionMetadata | undefined,
  agents: readonly HandoffExecutorAgentSnapshot[],
): HandoffExecutorAgentSnapshot | undefined {
  return execution?.agentId !== undefined
    ? agents.find((agent) => agent.id === execution.agentId)
    : undefined;
}

function executorIdentity(
  execution: HandoffExecutionMetadata | undefined,
  agents: readonly HandoffExecutorAgentSnapshot[],
): Pick<HandoffExecutorStateModel, 'agentLabel' | 'providerLabel'> {
  const linkedAgent = linkedExecutorAgent(execution, agents);
  const agentLabel =
    (linkedAgent ? executorAgentDisplayName(linkedAgent) : undefined) ??
    safeDisplayStringValue(execution?.agentName) ??
    (execution?.agentId !== undefined ? `Agent #${execution.agentId}` : undefined);
  const providerLabel = executorProviderLabel(linkedAgent?.providerId ?? execution?.providerId);
  return {
    ...(agentLabel ? { agentLabel } : {}),
    ...(providerLabel ? { providerLabel } : {}),
  };
}

function executorAgentDisplayName(agent: HandoffExecutorAgentSnapshot): string | undefined {
  return safeDisplayStringValue(agent.name) ?? `Agent #${agent.id}`;
}

function executorProviderLabel(providerId: string | undefined): string | undefined {
  const safeProviderId = safeDisplayStringValue(providerId);
  if (!safeProviderId) return undefined;
  if (safeProviderId.toLowerCase() === 'codex') return 'Codex';
  if (safeProviderId.toLowerCase() === 'claude') return 'Claude';
  return safeProviderId;
}

function executorLiveDetail(agent: HandoffExecutorAgentSnapshot, fallback: string): string {
  const name = executorAgentDisplayName(agent);
  const provider = executorProviderLabel(agent.providerId);
  const activity = safeDisplayStringValue(agent.activity);
  const detail = safeDisplayStringValue(agent.detail);
  const liveParts = [name, provider, activity, detail].filter(Boolean);
  return liveParts.length > 0 ? liveParts.join(' / ') : fallback;
}

export function filterHandoffQueueItems(
  items: readonly HandoffArtifactLibraryItem[],
  group: HandoffQueueGroup,
  agents: readonly HandoffExecutorAgentSnapshot[] = [],
): HandoffArtifactLibraryItem[] {
  return items
    .filter((item) => !!item.dispatchPackage)
    .filter((item) => group === 'all' || handoffQueueGroupForItem(item, agents) === group)
    .sort(compareHandoffQueueItems);
}

export function handoffQueueGroupLabel(group: HandoffQueueGroup): string {
  if (group === 'needs_dispatch') return 'Needs dispatch';
  if (group === 'active_waiting') return 'Active / waiting / unknown';
  if (group === 'blocked') return 'Blocked';
  if (group === 'report_ready') return 'Report ready';
  if (group === 'done') return 'Done';
  return 'All packages';
}

export function handoffQueueGroupForItem(
  item: Pick<HandoffArtifactLibraryItem, 'dispatchPackage' | 'completion' | 'review'>,
  agents: readonly HandoffExecutorAgentSnapshot[] = [],
): Exclude<HandoffQueueGroup, 'all'> {
  const executorState = buildHandoffExecutorStateModel(item, agents);
  if (executorState.state === 'blocked') return 'blocked';
  if (executorState.state === 'completed') return 'done';
  if (executorState.state === 'report_ready') return 'report_ready';
  if (
    executorState.state === 'active' ||
    executorState.state === 'waiting' ||
    executorState.state === 'stale_unknown'
  ) {
    return 'active_waiting';
  }
  return 'needs_dispatch';
}

export function buildHandoffReviewChecklist(
  item: Pick<HandoffArtifactLibraryItem, 'completion' | 'review'>,
): HandoffReviewChecklistItem[] {
  const review = item.review;
  const report = review?.report;
  const warnings = review?.warnings ?? [];
  return [
    booleanReviewCue('summary', 'Summary', report?.hasSummary),
    booleanReviewCue('files_changed', 'Files', report?.hasFilesChanged),
    booleanReviewCue('validation', 'Validation', report?.hasValidation),
    {
      id: 'warnings',
      label: 'Warnings',
      state: review ? (warnings.length > 0 ? 'warning' : 'ok') : 'unknown',
      detail: review
        ? `${warnings.length} ${pluralize(warnings.length, 'warning')}`
        : 'not checked',
    },
    branchReviewCue(review?.git, item.completion),
  ];
}

export function buildHandoffReviewRecommendedAction(
  item: Pick<
    HandoffArtifactLibraryItem,
    | 'artifactId'
    | 'completion'
    | 'dispatchPackage'
    | 'metadataRelativePath'
    | 'relativePath'
    | 'review'
    | 'status'
  >,
): HandoffReviewRecommendedAction {
  if (!item.dispatchPackage) {
    return {
      kind: 'create_work_package',
      label: 'Create work package',
      disabled: !canCreateHandoffWorkPackage(item),
      detail: 'Package-backed handoffs can be reviewed after dispatch.',
    };
  }
  const review = item.review;
  if (!review) {
    return {
      kind: 'refresh_completion',
      label: 'Refresh completion',
      disabled: !canUseHandoffWorkPackage(item),
      detail: 'Scan the executor report and branch status.',
    };
  }
  if (review.status === 'merged') {
    const reviewedAction = handoffArtifactStatusActions(item).find(
      (action) => action.nextStatus === 'reviewed',
    );
    return {
      kind: 'mark_reviewed',
      label: 'Mark reviewed',
      disabled: reviewedAction?.disabled ?? true,
      detail: 'Branch is merged; close the local handoff review.',
    };
  }
  if (review.status === 'ready_to_merge') {
    return {
      kind: 'open_report',
      label: 'Inspect branch / open report',
      disabled: item.completion?.reportExists !== true,
      detail: 'Report is ready; inspect the branch manually before merge.',
    };
  }
  if (review.status === 'needs_review') {
    return {
      kind: 'open_report',
      label: 'Open report',
      disabled: item.completion?.reportExists !== true,
      detail: 'Review executor notes, validation, and changed-file cues.',
    };
  }
  if (review.status === 'blocked') {
    const hasReport = item.completion?.reportExists === true;
    return {
      kind: hasReport ? 'open_report' : 'wait_for_report',
      label: hasReport ? 'Open report' : 'Report missing',
      disabled: !hasReport,
      detail: hasReport
        ? 'Read the blocker before marking stale or re-dispatching.'
        : 'No executor report is available yet.',
    };
  }
  if (review.status === 'needs_report') {
    return {
      kind: 'wait_for_report',
      label: 'Report missing',
      disabled: true,
      detail: 'Refresh after the executor writes its report.',
    };
  }
  if (review.status === 'active' || review.status === 'unknown') {
    return {
      kind: 'refresh_completion',
      label: 'Refresh completion',
      disabled: !canUseHandoffWorkPackage(item),
      detail:
        review.status === 'active'
          ? 'Executor appears active; refresh when work may be done.'
          : 'Completion state is unclear; refresh the local scan.',
    };
  }
  return {
    kind: 'none',
    label: review.nextActionLabel,
    disabled: true,
    detail: 'No review action is available yet.',
  };
}

export function buildHandoffMergeReadiness(
  item: Pick<HandoffArtifactLibraryItem, 'completion' | 'dispatchPackage' | 'review'>,
): HandoffMergeReadiness {
  const review = item.review;
  const report = review?.report;
  const warningCount = review?.warnings.length ?? 0;
  const branchStatus = mergeReadinessBranchStatus(review?.git, item.completion);
  const reportStatus = mergeReadinessReportStatus(item.completion, review);
  const validationStatus =
    report?.hasValidation === true
      ? 'validation present'
      : report?.hasValidation === false
        ? 'validation missing'
        : 'validation unknown';
  const base = {
    branchStatus,
    reportStatus,
    validationStatus,
    warningCount,
    canCopyChecklist: !!item.dispatchPackage,
  };
  if (!item.dispatchPackage) {
    return {
      ...base,
      status: 'unknown',
      label: 'No work package',
      detail: 'Create a work package before checking merge readiness.',
      recommendedStep: 'Create a handoff work package first.',
      canCopyChecklist: false,
    };
  }
  if (!review) {
    const status: HandoffMergeReadinessStatus =
      item.completion?.reportExists === false ? 'needs_report' : 'unknown';
    return {
      ...base,
      status,
      label: status === 'needs_report' ? 'Needs report' : 'Unknown',
      detail:
        status === 'needs_report'
          ? 'Executor report is missing.'
          : 'Completion review has not been loaded yet.',
      recommendedStep:
        status === 'needs_report'
          ? 'Wait for the executor report, then refresh completion.'
          : 'Refresh completion before deciding.',
    };
  }
  if (review.status === 'merged') {
    return {
      ...base,
      status: 'already_merged',
      label: 'Already merged',
      detail: 'Branch is merged into main.',
      recommendedStep: 'Mark the handoff reviewed after confirming the local status.',
    };
  }
  if (review.status === 'ready_to_merge') {
    return {
      ...base,
      status: 'ready_to_inspect',
      label: 'Ready to inspect',
      detail: 'Report and branch signals are ready for a manual merge decision.',
      recommendedStep:
        'Open the report, inspect the branch manually, then merge outside Pixel Agents.',
    };
  }
  if (review.status === 'needs_review') {
    return {
      ...base,
      status: 'needs_review',
      label: 'Needs review',
      detail: 'Executor report is ready but still needs supervisor review.',
      recommendedStep: 'Open the report and inspect validation plus changed-file cues.',
    };
  }
  if (review.status === 'needs_report') {
    return {
      ...base,
      status: 'needs_report',
      label: 'Needs report',
      detail: 'Executor report is missing.',
      recommendedStep: 'Wait for the executor report, then refresh completion.',
    };
  }
  if (review.status === 'blocked') {
    return {
      ...base,
      status: 'blocked',
      label: 'Blocked',
      detail: 'Executor completion review found a blocker.',
      recommendedStep: 'Open the report if available, then mark stale or re-dispatch manually.',
    };
  }
  if (review.status === 'active') {
    return {
      ...base,
      status: 'active',
      label: 'Active',
      detail: 'Executor appears active or waiting.',
      recommendedStep: 'Refresh completion later; do not merge yet.',
    };
  }
  return {
    ...base,
    status: 'unknown',
    label: 'Unknown',
    detail: 'Merge readiness is unclear from local signals.',
    recommendedStep: 'Refresh completion and inspect the report if it exists.',
  };
}

export function buildHandoffManualMergeChecklist(
  item: Pick<
    HandoffArtifactLibraryItem,
    'completion' | 'dispatchPackage' | 'displayTitle' | 'relativePath' | 'review'
  >,
): string | undefined {
  return buildHandoffChecklistCopyModel(item).text;
}

export function buildHandoffChecklistCopyModel(
  item: Pick<
    HandoffArtifactLibraryItem,
    'completion' | 'dispatchPackage' | 'displayTitle' | 'relativePath' | 'review'
  >,
): HandoffChecklistCopyModel {
  const readiness = buildHandoffMergeReadiness(item);
  const copyConfig = handoffChecklistCopyConfig(readiness.status);
  const title = `${copyConfig.titlePrefix}: ${item.displayTitle}`;
  const dispatchPackage = item.dispatchPackage;
  if (!dispatchPackage) {
    return {
      kind: copyConfig.kind,
      actionLabel: copyConfig.actionLabel,
      copiedLabel: copyConfig.copiedLabel,
      title,
      disabled: true,
      canCopy: false,
    };
  }
  return {
    kind: copyConfig.kind,
    actionLabel: copyConfig.actionLabel,
    copiedLabel: copyConfig.copiedLabel,
    title,
    text: buildHandoffChecklistCopyText({ ...item, dispatchPackage }, readiness, copyConfig, title),
    disabled: false,
    canCopy: true,
  };
}

function buildHandoffChecklistCopyText(
  item: Pick<
    HandoffArtifactLibraryItem,
    'completion' | 'dispatchPackage' | 'displayTitle' | 'relativePath' | 'review'
  > & { dispatchPackage: HandoffDispatchPackage },
  readiness: HandoffMergeReadiness,
  copyConfig: HandoffChecklistCopyConfig,
  title: string,
): string {
  const checklist = buildHandoffReviewChecklist(item);
  const reportPath = item.review?.reportRelativePath ?? item.completion?.reportRelativePath;
  const branchName = item.review?.branchName ?? item.dispatchPackage.branchName;
  const lines = [
    `# ${title}`,
    '',
    `Status: ${readiness.label}`,
    `Recommended next step: ${readiness.recommendedStep}`,
    '',
    `Handoff: ${item.relativePath}`,
    `Work package: ${item.dispatchPackage.packageRelativePath}`,
    `Executor report: ${reportPath ?? item.dispatchPackage.reportRelativePath}`,
    `Branch: ${branchName}`,
    '',
    'Signals:',
    `- Branch: ${readiness.branchStatus}`,
    `- Report: ${readiness.reportStatus}`,
    `- Validation: ${readiness.validationStatus}`,
    `- Warnings: ${readiness.warningCount}`,
    ...checklist.map((cue) => `- ${cue.label}: ${cue.detail}`),
    '',
    `${copyConfig.sectionTitle}:`,
    ...copyConfig.steps,
    '',
    'Safety:',
    '- Pixel Agents does not run git checkout, merge, push, rebase, reset, stash, or clean from this checklist.',
    '- This checklist references repo-relative artifacts only and does not include report bodies, transcripts, tool output, credentials, or absolute paths.',
  ];
  return lines.join('\n');
}

interface HandoffChecklistCopyConfig {
  kind: HandoffChecklistCopyKind;
  actionLabel: string;
  copiedLabel: string;
  titlePrefix: string;
  sectionTitle: string;
  steps: string[];
}

function handoffChecklistCopyConfig(
  status: HandoffMergeReadinessStatus,
): HandoffChecklistCopyConfig {
  if (status === 'ready_to_inspect') {
    return {
      kind: 'merge',
      actionLabel: 'Copy merge checklist',
      copiedLabel: 'Merge checklist copied.',
      titlePrefix: 'Manual Merge Checklist',
      sectionTitle: 'Manual merge review',
      steps: [
        '- Open the executor report and inspect the summarized validation and changed-file cues.',
        '- Inspect the executor branch manually outside Pixel Agents.',
        '- Run any required validation locally before merging.',
        '- If approved, merge outside Pixel Agents; then refresh completion and mark reviewed.',
      ],
    };
  }
  if (status === 'needs_review') {
    return {
      kind: 'review',
      actionLabel: 'Copy review checklist',
      copiedLabel: 'Review checklist copied.',
      titlePrefix: 'Manual Review Checklist',
      sectionTitle: 'Manual review',
      steps: [
        '- Open the executor report and review summary, validation, changed-file, and risk cues.',
        '- Inspect the executor branch manually outside Pixel Agents.',
        '- Run any required validation locally before making a merge decision.',
        '- If review passes, refresh completion so the handoff can move to ready to inspect.',
      ],
    };
  }
  if (status === 'blocked') {
    return {
      kind: 'blocker',
      actionLabel: 'Copy blocker checklist',
      copiedLabel: 'Blocker checklist copied.',
      titlePrefix: 'Manual Blocker Checklist',
      sectionTitle: 'Manual blocker review',
      steps: [
        '- Open the executor report if available and confirm the blocker.',
        '- Inspect branch and status cues manually outside Pixel Agents before deciding next ownership.',
        '- Mark stale or re-dispatch manually only after the blocker is understood.',
        '- Do not merge until the blocker is resolved and completion is refreshed.',
      ],
    };
  }
  if (status === 'already_merged') {
    return {
      kind: 'closeout',
      actionLabel: 'Copy closeout checklist',
      copiedLabel: 'Closeout checklist copied.',
      titlePrefix: 'Manual Closeout Checklist',
      sectionTitle: 'Manual closeout',
      steps: [
        '- Confirm the branch is merged into main using local tools outside Pixel Agents.',
        '- Open the report if needed to verify final validation and changed-file cues.',
        '- Mark the handoff reviewed after the local status is confirmed.',
        '- Do not run another merge from this checklist.',
      ],
    };
  }
  return {
    kind: 'status',
    actionLabel: 'Copy status checklist',
    copiedLabel: 'Status checklist copied.',
    titlePrefix: 'Manual Status Checklist',
    sectionTitle: 'Manual status review',
    steps: [
      '- Refresh completion when the executor status may have changed.',
      '- Wait for the executor report or active work to settle before reviewing.',
      '- Inspect any available report and branch/status cues manually outside Pixel Agents.',
      '- Do not merge until the handoff reaches ready to inspect.',
    ],
  };
}

export function handoffExecutionActionStatusLabel(
  status: HandoffExecutionActionStatus,
  agentLabel: string,
  packageRelativePath: string,
  error: string,
): string {
  if (status === 'linking') return 'Linking handoff package to visible agent...';
  if (status === 'linked') {
    return `Execution linked: ${agentLabel || 'visible agent'} / ${
      packageRelativePath || 'handoff work package'
    }`;
  }
  if (status === 'updating') return 'Updating handoff execution status...';
  if (status === 'updated') {
    return `Execution status updated: ${packageRelativePath || 'handoff work package'}`;
  }
  if (status === 'launching') return 'Launching executor from handoff work package...';
  if (status === 'launched') {
    return `Executor launched: ${agentLabel || 'new agent'} / ${
      packageRelativePath || 'handoff work package'
    }`;
  }
  if (status === 'refreshing') return 'Refreshing report and branch completion signals...';
  if (status === 'refreshed') {
    return `Completion refreshed: ${packageRelativePath || 'handoff work package'}`;
  }
  if (status === 'opening_report') return 'Opening executor report in VS Code...';
  if (status === 'report_opened') {
    return `Opened report: ${packageRelativePath || 'executor report'}`;
  }
  if (status === 'failed') {
    return `Execution action failed: ${error || 'Could not update handoff execution.'}`;
  }
  return 'Execution links use visible agents only; live hints do not overwrite metadata.';
}

export function handoffWorkPackageStatusLabel(
  status: HandoffWorkPackageStatus,
  packageRelativePath: string,
  branchName: string,
  reportRelativePath: string,
  error: string,
): string {
  if (status === 'creating') return 'Creating repo-local work package...';
  if (status === 'created') {
    return `Work package created: ${packageRelativePath || 'handoff work package'}`;
  }
  if (status === 'opening') return 'Opening handoff work package in VS Code...';
  if (status === 'opened') {
    return `Opened work package: ${packageRelativePath || 'handoff work package'}`;
  }
  if (status === 'copying') return 'Creating work-package prompt...';
  if (status === 'copied') {
    return `Work-package prompt copied: ${branchName || 'executor branch'} / ${
      reportRelativePath || 'executor report'
    }`;
  }
  if (status === 'updating') return 'Updating handoff work-package status...';
  if (status === 'updated') {
    return `Work-package status updated: ${packageRelativePath || 'handoff work package'}`;
  }
  if (status === 'failed') {
    return `Work-package action failed: ${error || 'Could not update the handoff work package.'}`;
  }
  return 'Work packages are repo-local Markdown instructions derived from handoff metadata.';
}

export function shouldRefreshHandoffArtifactsForMessage(message: Record<string, unknown>): boolean {
  return (
    message.type === 'handoffDraftWritten' ||
    message.type === 'handoffArtifactStatusUpdated' ||
    message.type === 'handoffWorkPackageCreated' ||
    message.type === 'handoffDispatchStatusUpdated' ||
    message.type === 'handoffExecutionLinked' ||
    message.type === 'handoffExecutionStatusUpdated' ||
    message.type === 'handoffExecutorLaunched' ||
    message.type === 'handoffCompletionRefreshed'
  );
}

function handoffArtifactStatusActionLabel(status: HandoffArtifactLocalStatus): string {
  if (status === 'reviewed') return 'Mark reviewed';
  if (status === 'stale') return 'Mark stale';
  return 'Reset draft';
}

function handoffDispatchStatusActionLabel(status: HandoffDispatchStatus): string {
  if (status === 'ready') return 'Mark ready';
  if (status === 'dispatched') return 'Mark dispatched';
  if (status === 'completed') return 'Mark completed';
  if (status === 'blocked') return 'Mark blocked';
  return 'Reset draft';
}

function handoffExecutionStatusActionLabel(status: HandoffExecutionStatus): string {
  if (status === 'active') return 'Mark active';
  if (status === 'waiting') return 'Mark waiting';
  if (status === 'completed') return 'Mark completed';
  if (status === 'blocked') return 'Mark blocked';
  if (status === 'unknown') return 'Reset unknown';
  return 'Mark linked';
}

function booleanReviewCue(
  id: Exclude<HandoffReviewChecklistId, 'warnings' | 'branch'>,
  label: string,
  value: boolean | undefined,
): HandoffReviewChecklistItem {
  if (value === true) {
    return { id, label, state: 'ok', detail: 'present' };
  }
  if (value === false) {
    return { id, label, state: 'missing', detail: 'missing' };
  }
  return { id, label, state: 'unknown', detail: 'not checked' };
}

function branchReviewCue(
  git: HandoffCompletionReviewGit | undefined,
  completion: HandoffCompletionStatus | undefined,
): HandoffReviewChecklistItem {
  const branchExists = git?.branchExists ?? completion?.branchExists;
  const branchMergedToMain = git?.branchMergedToMain ?? completion?.branchMergedToMain;
  if (branchExists === false) {
    return { id: 'branch', label: 'Branch', state: 'missing', detail: 'missing' };
  }
  if (branchMergedToMain === true) {
    return { id: 'branch', label: 'Branch', state: 'ok', detail: 'merged' };
  }
  if (branchMergedToMain === false) {
    const ahead = git?.aheadCount !== undefined ? ` / ahead ${git.aheadCount}` : '';
    const behind = git?.behindCount !== undefined ? ` / behind ${git.behindCount}` : '';
    return {
      id: 'branch',
      label: 'Branch',
      state: 'warning',
      detail: `not merged${ahead}${behind}`,
    };
  }
  if (branchExists === true) {
    return { id: 'branch', label: 'Branch', state: 'unknown', detail: 'merge unknown' };
  }
  return { id: 'branch', label: 'Branch', state: 'unknown', detail: 'unknown' };
}

function mergeReadinessBranchStatus(
  git: HandoffCompletionReviewGit | undefined,
  completion: HandoffCompletionStatus | undefined,
): string {
  const branchExists = git?.branchExists ?? completion?.branchExists;
  const branchMergedToMain = git?.branchMergedToMain ?? completion?.branchMergedToMain;
  if (branchExists === false) return 'branch missing';
  if (branchMergedToMain === true) return 'merged';
  if (branchMergedToMain === false) {
    const ahead = git?.aheadCount !== undefined ? ` / ahead ${git.aheadCount}` : '';
    const behind = git?.behindCount !== undefined ? ` / behind ${git.behindCount}` : '';
    return `not merged${ahead}${behind}`;
  }
  if (branchExists === true) return 'branch exists / merge unknown';
  return 'branch unknown';
}

function mergeReadinessReportStatus(
  completion: HandoffCompletionStatus | undefined,
  review: HandoffCompletionReview | undefined,
): string {
  if (completion?.reportExists === true || review?.report) {
    return 'report ready';
  }
  if (completion?.reportExists === false || review?.status === 'needs_report') {
    return 'report missing';
  }
  return 'report unknown';
}

function pluralize(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function isLocalHandoffArtifactStatus(value: unknown): value is HandoffArtifactLocalStatus {
  return value === 'draft' || value === 'reviewed' || value === 'stale';
}

function isHandoffDispatchStatus(value: unknown): value is HandoffDispatchStatus {
  return (
    value === 'draft' ||
    value === 'ready' ||
    value === 'dispatched' ||
    value === 'completed' ||
    value === 'blocked'
  );
}

function isHandoffExecutionStatus(value: unknown): value is HandoffExecutionStatus {
  return (
    value === 'linked' ||
    value === 'active' ||
    value === 'waiting' ||
    value === 'completed' ||
    value === 'blocked' ||
    value === 'unknown'
  );
}

function handoffCompletionReviewStatus(value: unknown): HandoffCompletionReviewStatus | undefined {
  if (
    value === 'not_ready' ||
    value === 'active' ||
    value === 'blocked' ||
    value === 'needs_report' ||
    value === 'needs_review' ||
    value === 'ready_to_merge' ||
    value === 'merged' ||
    value === 'unknown'
  ) {
    return value;
  }
  return undefined;
}

function handoffArtifactItemFromUnknown(value: unknown): HandoffArtifactLibraryItem | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const relativePath = stringValue(record.relativePath);
  const filename = stringValue(record.filename);
  const modifiedAt = numberValue(record.modifiedAt);
  const sizeBytes = numberValue(record.sizeBytes);
  if (!relativePath || !filename || modifiedAt === undefined || sizeBytes === undefined) {
    return undefined;
  }
  const title = stringValue(record.title);
  const status = stringValue(record.status);
  const createdAt = stringValue(record.createdAt);
  const updatedAt = stringValue(record.updatedAt);
  const artifactId = stringValue(record.artifactId);
  const artifactType = stringValue(record.artifactType);
  const metadataRelativePath = stringValue(record.metadataRelativePath);
  const providerId = stringValue(record.providerId);
  const projectName = stringValue(record.projectName);
  const agentName = stringValue(record.agentName);
  const sessionId = stringValue(record.sessionId);
  const runId = stringValue(record.runId);
  const dispatchPackage = handoffDispatchPackageFromUnknown(record.dispatchPackage);
  const completion = handoffCompletionStatusFromUnknown(record.completion);
  const review = handoffCompletionReviewFromUnknown(record.review);
  const statusLabel = handoffStatusLabel(status);
  const dispatchDetail = dispatchPackage
    ? ` / package ${dispatchPackage.statusLabel}${
        dispatchPackage.execution ? ` / execution ${dispatchPackage.execution.statusLabel}` : ''
      } / ${dispatchPackage.packageRelativePath}`
    : '';
  const completionDetail = completion ? ` / ${completion.statusLabel}` : '';
  const reviewDetail = review
    ? ` / review ${review.statusLabel} / next ${review.nextActionLabel}`
    : '';
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : undefined;
  const updatedLabel =
    updatedAtMs !== undefined && Number.isFinite(updatedAtMs)
      ? `updated ${formatDateTime(updatedAtMs)}`
      : formatDateTime(modifiedAt);
  return {
    relativePath,
    filename,
    modifiedAt,
    sizeBytes,
    title,
    artifactId,
    artifactType,
    metadataRelativePath,
    status,
    createdAt,
    updatedAt,
    providerId,
    projectName,
    agentName,
    sessionId,
    runId,
    dispatchPackage,
    completion,
    review,
    displayTitle: title ?? filename,
    displayDetail: `${statusLabel}${dispatchDetail}${completionDetail}${reviewDetail} / ${filename} / ${formatBytes(
      sizeBytes,
    )} / ${updatedLabel}`,
    statusLabel,
  };
}

function handoffCompletionStatusFromUnknown(value: unknown): HandoffCompletionStatus | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const reportExists = booleanValue(record.reportExists);
  const reportRelativePath = stringValue(record.reportRelativePath);
  const branchName = stringValue(record.branchName);
  const checkedAt = stringValue(record.checkedAt);
  if (reportExists === undefined || !reportRelativePath || !branchName || !checkedAt) {
    return undefined;
  }
  const branchExists = booleanValue(record.branchExists);
  const branchMergedToMain = booleanValue(record.branchMergedToMain);
  return {
    reportExists,
    reportRelativePath,
    reportModifiedAt: numberValue(record.reportModifiedAt),
    reportSizeBytes: numberValue(record.reportSizeBytes),
    branchName,
    branchExists,
    branchMergedToMain,
    checkedAt,
    statusLabel: handoffCompletionStatusLabel(reportExists, branchExists, branchMergedToMain),
  };
}

function handoffCompletionReviewFromUnknown(value: unknown): HandoffCompletionReview | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const status = handoffCompletionReviewStatus(record.status);
  const statusLabel = safeDisplayStringValue(record.statusLabel);
  const nextActionLabel = safeDisplayStringValue(record.nextActionLabel);
  const checkedAt = stringValue(record.checkedAt);
  if (!status || !statusLabel || !nextActionLabel || !checkedAt) return undefined;
  const report = handoffCompletionReviewReportFromUnknown(record.report);
  const git = handoffCompletionReviewGitFromUnknown(record.git);
  return {
    status,
    statusLabel,
    nextActionLabel,
    ...(safeReportRelativePath(record.reportRelativePath)
      ? { reportRelativePath: safeReportRelativePath(record.reportRelativePath) }
      : {}),
    ...(safeBranchName(record.branchName) ? { branchName: safeBranchName(record.branchName) } : {}),
    ...(report ? { report } : {}),
    ...(git ? { git } : {}),
    warnings: stringArrayValue(record.warnings)
      .map((line) => safeDisplayStringValue(line))
      .filter((line): line is string => line !== undefined),
    checkedAt,
  };
}

function handoffCompletionReviewReportFromUnknown(
  value: unknown,
): HandoffCompletionReviewReport | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const hasSummary = booleanValue(record.hasSummary);
  const hasFilesChanged = booleanValue(record.hasFilesChanged);
  const hasValidation = booleanValue(record.hasValidation);
  const hasAcceptanceCriteria = booleanValue(record.hasAcceptanceCriteria);
  const hasDeviations = booleanValue(record.hasDeviations);
  const truncated = booleanValue(record.truncated);
  if (
    hasSummary === undefined ||
    hasFilesChanged === undefined ||
    hasValidation === undefined ||
    hasAcceptanceCriteria === undefined ||
    hasDeviations === undefined ||
    truncated === undefined
  ) {
    return undefined;
  }
  return {
    title: safeDisplayStringValue(record.title),
    hasSummary,
    hasFilesChanged,
    hasValidation,
    hasAcceptanceCriteria,
    hasDeviations,
    validationLines: stringArrayValue(record.validationLines)
      .map((line) => safeDisplayStringValue(line))
      .filter((line): line is string => line !== undefined),
    changedFileLines: stringArrayValue(record.changedFileLines)
      .map((line) => safeDisplayStringValue(line))
      .filter((line): line is string => line !== undefined),
    riskLines: stringArrayValue(record.riskLines)
      .map((line) => safeDisplayStringValue(line))
      .filter((line): line is string => line !== undefined),
    truncated,
  };
}

function handoffCompletionReviewGitFromUnknown(
  value: unknown,
): HandoffCompletionReviewGit | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const git: HandoffCompletionReviewGit = {};
  const branchExists = booleanValue(record.branchExists);
  const branchMergedToMain = booleanValue(record.branchMergedToMain);
  const branchHeadSha = safeGitSha(record.branchHeadSha);
  const mainHeadSha = safeGitSha(record.mainHeadSha);
  const aheadCount = nonNegativeIntegerValue(record.aheadCount);
  const behindCount = nonNegativeIntegerValue(record.behindCount);
  if (branchExists !== undefined) git.branchExists = branchExists;
  if (branchMergedToMain !== undefined) git.branchMergedToMain = branchMergedToMain;
  if (branchHeadSha) git.branchHeadSha = branchHeadSha;
  if (mainHeadSha) git.mainHeadSha = mainHeadSha;
  if (aheadCount !== undefined) git.aheadCount = aheadCount;
  if (behindCount !== undefined) git.behindCount = behindCount;
  return Object.keys(git).length > 0 ? git : undefined;
}

function handoffDispatchPackageFromUnknown(value: unknown): HandoffDispatchPackage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const packageRelativePath = stringValue(record.packageRelativePath);
  const branchName = stringValue(record.branchName);
  const reportRelativePath = stringValue(record.reportRelativePath);
  const status = isHandoffDispatchStatus(record.status) ? record.status : undefined;
  const createdAt = stringValue(record.createdAt);
  const updatedAt = stringValue(record.updatedAt);
  const execution = handoffExecutionMetadataFromUnknown(record.execution);
  if (
    !packageRelativePath ||
    !branchName ||
    !reportRelativePath ||
    !status ||
    !createdAt ||
    !updatedAt
  ) {
    return undefined;
  }
  return {
    packageRelativePath,
    branchName,
    reportRelativePath,
    status,
    createdAt,
    updatedAt,
    execution,
    statusLabel: handoffDispatchStatusLabel(status),
  };
}

function handoffExecutionMetadataFromUnknown(value: unknown): HandoffExecutionMetadata | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const status = isHandoffExecutionStatus(record.status) ? record.status : undefined;
  const linkedAt = stringValue(record.linkedAt);
  const updatedAt = stringValue(record.updatedAt);
  if (!status || !linkedAt || !updatedAt) return undefined;
  const agentId = safeAgentId(numberValue(record.agentId));
  return {
    agentId,
    agentName: safeDisplayStringValue(record.agentName),
    providerId: safeDisplayStringValue(record.providerId),
    projectName: safeDisplayStringValue(record.projectName),
    sessionId: safeDisplayStringValue(record.sessionId),
    runId: safeDisplayStringValue(record.runId),
    linkedAt,
    updatedAt,
    status,
    statusLabel: handoffExecutionStatusLabel(status),
  };
}

function handoffStatusLabel(status: string | undefined): string {
  if (status === 'published') return 'Published';
  if (status === 'reviewed') return 'Reviewed';
  if (status === 'stale') return 'Stale';
  if (status === 'draft') return 'Draft';
  return 'Markdown only';
}

function handoffDispatchStatusLabel(status: HandoffDispatchStatus): string {
  if (status === 'ready') return 'Ready';
  if (status === 'dispatched') return 'Dispatched';
  if (status === 'completed') return 'Completed';
  if (status === 'blocked') return 'Blocked';
  return 'Draft package';
}

function handoffExecutionStatusLabel(status: HandoffExecutionStatus): string {
  if (status === 'linked') return 'Linked';
  if (status === 'active') return 'Active';
  if (status === 'waiting') return 'Waiting';
  if (status === 'completed') return 'Completed';
  if (status === 'blocked') return 'Blocked';
  return 'Unknown';
}

function formatBytes(value: number): string {
  if (value < 1024) return `${Math.max(0, Math.round(value))} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function timestampValue(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function safeAgentId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeDisplayStringValue(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const safe = text
    .replace(/(^|[\s(["'`])\/(?!\/)(?:[A-Za-z0-9._-]+\/){2,}[^\s)]+/g, '$1[redacted path]')
    .replace(/\\\\\?\\[^\s)]+/g, '[redacted path]')
    .replace(/[A-Za-z]:\\[^\s)]+/g, '[redacted path]')
    .replace(/\\\\[^\s)]+/g, '[redacted path]')
    .replace(
      /(^|[\s(["'])\/(?:Users|home|var|tmp|private|mnt|Volumes)\/[^\s)]+/g,
      '$1[redacted path]',
    )
    .replace(
      /\b(?:raw prompt|tool output|transcript text|credential|secret|api[_-]?key)\s*[:=].*$/gi,
      '[redacted content]',
    )
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
    .trim();
  return safe || undefined;
}

function safeReportRelativePath(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text || text.includes('\\') || /^[A-Za-z]:/.test(text) || text.includes('..')) {
    return undefined;
  }
  if (
    !text.startsWith('docs/roadmap/supervision/reports/') ||
    !text.toLowerCase().endsWith('.md')
  ) {
    return undefined;
  }
  return text;
}

function safeBranchName(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text || !/^product\/handoff-[a-z0-9][a-z0-9._-]{0,127}$/.test(text)) {
    return undefined;
  }
  return text;
}

function safeGitSha(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text || !/^[0-9a-f]{7,40}$/i.test(text)) return undefined;
  return text.toLowerCase();
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
}

function nonNegativeIntegerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function handoffCompletionStatusLabel(
  reportExists: boolean,
  branchExists?: boolean,
  branchMergedToMain?: boolean,
): string {
  const report = reportExists ? 'Report ready' : 'Report missing';
  const branch =
    branchExists === undefined
      ? 'branch unknown'
      : branchExists
        ? 'branch exists'
        : 'branch missing';
  const merged =
    branchMergedToMain === undefined
      ? 'merge unknown'
      : branchMergedToMain
        ? 'merged'
        : 'not merged';
  return `${report} / ${branch} / ${merged}`;
}

function compareHandoffQueueItems(
  a: Pick<HandoffArtifactLibraryItem, 'completion' | 'dispatchPackage' | 'modifiedAt' | 'review'>,
  b: Pick<HandoffArtifactLibraryItem, 'completion' | 'dispatchPackage' | 'modifiedAt' | 'review'>,
): number {
  const groupRank = (
    item: Pick<HandoffArtifactLibraryItem, 'completion' | 'dispatchPackage' | 'review'>,
  ) => {
    const group = handoffQueueGroupForItem(item);
    if (group === 'blocked') return 0;
    if (group === 'report_ready') return 1;
    if (group === 'active_waiting') return 2;
    if (group === 'needs_dispatch') return 3;
    return 4;
  };
  const rankDiff = groupRank(a) - groupRank(b);
  if (rankDiff !== 0) return rankDiff;
  const aUpdated = timestampValue(a.dispatchPackage?.updatedAt) ?? a.modifiedAt;
  const bUpdated = timestampValue(b.dispatchPackage?.updatedAt) ?? b.modifiedAt;
  return bUpdated - aUpdated;
}
