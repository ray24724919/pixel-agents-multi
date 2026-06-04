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
  displayTitle: string;
  displayDetail: string;
  statusLabel: string;
}

export type HandoffDispatchStatus = 'draft' | 'ready' | 'dispatched' | 'completed' | 'blocked';

export interface HandoffDispatchPackage {
  packageRelativePath: string;
  branchName: string;
  reportRelativePath: string;
  status: HandoffDispatchStatus;
  createdAt: string;
  updatedAt: string;
  statusLabel: string;
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

export interface HandoffDispatchStatusAction {
  nextStatus: HandoffDispatchStatus;
  label: string;
  disabled: boolean;
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
    message.type === 'handoffDispatchStatusUpdated'
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
  const statusLabel = handoffStatusLabel(status);
  const dispatchDetail = dispatchPackage
    ? ` / package ${dispatchPackage.statusLabel} / ${dispatchPackage.packageRelativePath}`
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
    displayTitle: title ?? filename,
    displayDetail: `${statusLabel}${dispatchDetail} / ${filename} / ${formatBytes(
      sizeBytes,
    )} / ${updatedLabel}`,
    statusLabel,
  };
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
    statusLabel: handoffDispatchStatusLabel(status),
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

function formatBytes(value: number): string {
  if (value < 1024) return `${Math.max(0, Math.round(value))} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
