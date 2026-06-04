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
  displayTitle: string;
  displayDetail: string;
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

export function shouldRefreshHandoffArtifactsForMessage(message: Record<string, unknown>): boolean {
  return message.type === 'handoffDraftWritten';
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
  const statusLabel = handoffStatusLabel(status);
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
    displayTitle: title ?? filename,
    displayDetail: `${statusLabel} / ${filename} / ${formatBytes(sizeBytes)} / ${updatedLabel}`,
    statusLabel,
  };
}

function handoffStatusLabel(status: string | undefined): string {
  if (status === 'published') return 'Published';
  if (status === 'reviewed') return 'Reviewed';
  if (status === 'stale') return 'Stale';
  if (status === 'draft') return 'Draft';
  return 'Markdown only';
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
