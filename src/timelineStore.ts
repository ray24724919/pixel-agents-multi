import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  JSONL_STORE_COMPACT_KEEP_MULTIPLIER,
  JSONL_STORE_SIZE_THRESHOLD_BYTES,
  JSONL_STORE_TAIL_READ_BYTES,
  TIMELINE_HISTORY_MAX_RECORDS,
  TIMELINE_RECORD_SCHEMA_VERSION,
  TIMELINE_STORE_FILE_DIR,
  TIMELINE_STORE_FILE_NAME,
  TIMELINE_STORE_SUBDIR,
} from './constants.js';
import {
  markJsonlStoreCompacted,
  readJsonlStoreLines,
  rewriteJsonlStore,
  shouldCompactJsonlStore,
} from './jsonlStoreIo.js';
import type { AgentLifecycleStatus } from './lifecycleStatus.js';

export type TimelineRecordSeverity = 'info' | 'success' | 'warning' | 'error';
export type TimelineRecordSource = 'user' | 'agent' | 'tool' | 'system';
export type TimelineRecordVisibility = 'default' | 'verbose' | 'debug';

export interface TimelineRecordV1 {
  schemaVersion: typeof TIMELINE_RECORD_SCHEMA_VERSION;
  id: string;
  agentId: number;
  providerId?: string;
  projectName?: string;
  sessionId?: string;
  runId?: string;
  artifactId?: string;
  artifactStatus?: string;
  previousStatus?: string;
  nextStatus?: string;
  dispatchStatus?: string;
  executionStatus?: string;
  packageRelativePath?: string;
  reportRelativePath?: string;
  branchName?: string;
  reportExists?: boolean;
  branchExists?: boolean;
  branchMergedToMain?: boolean;
  linkedAgentId?: number;
  linkedAgentName?: string;
  linkedAgentProviderId?: string;
  linkedAgentProjectName?: string;
  linkedAgentSessionId?: string;
  timestamp: number;
  kind: string;
  title: string;
  summary?: string;
  statusAfter?: AgentLifecycleStatus;
  severity?: TimelineRecordSeverity;
  source?: TimelineRecordSource;
  visibility: TimelineRecordVisibility;
}

export interface TimelineStoreOptions {
  homeDir?: string;
  storePath?: string;
  maxRecords?: number;
  /** Test seam: file size above which appends compact and loads tail-read. */
  sizeThresholdBytes?: number;
  /** Test seam: how many bytes a tail-read loads from the end of an oversized store. */
  tailReadBytes?: number;
}

export interface TimelineRecordInput {
  id?: unknown;
  agentId?: unknown;
  providerId?: unknown;
  projectName?: unknown;
  sessionId?: unknown;
  runId?: unknown;
  artifactId?: unknown;
  artifactStatus?: unknown;
  previousStatus?: unknown;
  nextStatus?: unknown;
  dispatchStatus?: unknown;
  executionStatus?: unknown;
  packageRelativePath?: unknown;
  reportRelativePath?: unknown;
  branchName?: unknown;
  reportExists?: unknown;
  branchExists?: unknown;
  branchMergedToMain?: unknown;
  linkedAgentId?: unknown;
  linkedAgentName?: unknown;
  linkedAgentProviderId?: unknown;
  linkedAgentProjectName?: unknown;
  linkedAgentSessionId?: unknown;
  timestamp?: unknown;
  kind?: unknown;
  title?: unknown;
  summary?: unknown;
  statusAfter?: unknown;
  severity?: unknown;
  source?: unknown;
  visibility?: unknown;
}

export function getTimelineStorePath(homeDir = os.homedir()): string {
  return path.join(
    homeDir,
    TIMELINE_STORE_FILE_DIR,
    TIMELINE_STORE_SUBDIR,
    TIMELINE_STORE_FILE_NAME,
  );
}

export function ensureTimelineStoreDir(options: TimelineStoreOptions = {}): string {
  const storePath = resolveTimelineStorePath(options);
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function appendTimelineRecord(
  input: TimelineRecordInput,
  options: TimelineStoreOptions = {},
): TimelineRecordV1 | undefined {
  const record = createTimelineRecord(input);
  if (!record) return undefined;
  const storePath = resolveTimelineStorePath(options);
  ensureTimelineStoreDir(options);
  fs.appendFileSync(storePath, `${JSON.stringify(record)}\n`, 'utf8');
  compactTimelineStoreIfNeeded(storePath, options);
  return record;
}

export function readTimelineRecords(options: TimelineStoreOptions = {}): TimelineRecordV1[] {
  const storePath = resolveTimelineStorePath(options);
  if (!fs.existsSync(storePath)) return [];

  const lines = readJsonlStoreLines(
    storePath,
    options.sizeThresholdBytes ?? JSONL_STORE_SIZE_THRESHOLD_BYTES,
    options.tailReadBytes ?? JSONL_STORE_TAIL_READ_BYTES,
  );
  const maxRecords = options.maxRecords ?? TIMELINE_HISTORY_MAX_RECORDS;
  return dedupeNewestFirst(parseTimelineLines(lines)).slice(0, maxRecords);
}

function parseTimelineLines(lines: string[]): TimelineRecordV1[] {
  const records: TimelineRecordV1[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isTimelineRecordV1(parsed)) {
        records.push(parsed);
      }
    } catch {
      /* Ignore malformed historical lines and keep reading the append-only store. */
    }
  }
  return records;
}

function dedupeNewestFirst(records: TimelineRecordV1[]): TimelineRecordV1[] {
  const deduped = new Map<string, TimelineRecordV1>();
  for (const record of records.sort(compareNewestFirst)) {
    if (!deduped.has(record.id)) {
      deduped.set(record.id, record);
    }
  }
  return [...deduped.values()];
}

/**
 * Once the store file passes the size threshold, rewrite it down to the newest
 * maxRecords × JSONL_STORE_COMPACT_KEEP_MULTIPLIER records (newest by the same
 * ordering the reader uses), written oldest-first so appends stay chronological.
 * Compaction must never lose data: any failure keeps the original file as-is.
 */
function compactTimelineStoreIfNeeded(storePath: string, options: TimelineStoreOptions): void {
  const thresholdBytes = options.sizeThresholdBytes ?? JSONL_STORE_SIZE_THRESHOLD_BYTES;
  if (!shouldCompactJsonlStore(storePath, thresholdBytes)) return;
  try {
    const maxRecords = options.maxRecords ?? TIMELINE_HISTORY_MAX_RECORDS;
    const keepRecords = maxRecords * JSONL_STORE_COMPACT_KEEP_MULTIPLIER;
    const lines = fs.readFileSync(storePath, 'utf8').split(/\r?\n/);
    const newestFirst = dedupeNewestFirst(parseTimelineLines(lines));
    if (newestFirst.length > keepRecords) {
      const kept = newestFirst.slice(0, keepRecords).reverse();
      rewriteJsonlStore(
        storePath,
        kept.map((record) => JSON.stringify(record)),
      );
    }
    markJsonlStoreCompacted(storePath);
  } catch {
    /* Keep the original file untouched; the next append re-evaluates. */
  }
}

export function createTimelineRecord(input: TimelineRecordInput): TimelineRecordV1 | undefined {
  const id = stringValue(input.id);
  const agentId = numberValue(input.agentId);
  const timestamp = numberValue(input.timestamp);
  const kind = stringValue(input.kind);
  const title = stringValue(input.title);
  if (!id || agentId === undefined || timestamp === undefined || !kind || !title) {
    return undefined;
  }

  const record: TimelineRecordV1 = {
    schemaVersion: TIMELINE_RECORD_SCHEMA_VERSION,
    id,
    agentId,
    timestamp,
    kind,
    title,
    visibility: timelineVisibility(input.visibility) ?? 'default',
  };
  const providerId = stringValue(input.providerId);
  const projectName = stringValue(input.projectName);
  const sessionId = stringValue(input.sessionId);
  const runId = stringValue(input.runId);
  const artifactId = stringValue(input.artifactId);
  const artifactStatus = stringValue(input.artifactStatus);
  const previousStatus = stringValue(input.previousStatus);
  const nextStatus = stringValue(input.nextStatus);
  const dispatchStatus = stringValue(input.dispatchStatus);
  const executionStatus = stringValue(input.executionStatus);
  const packageRelativePath = stringValue(input.packageRelativePath);
  const reportRelativePath = stringValue(input.reportRelativePath);
  const branchName = stringValue(input.branchName);
  const reportExists = booleanValue(input.reportExists);
  const branchExists = booleanValue(input.branchExists);
  const branchMergedToMain = booleanValue(input.branchMergedToMain);
  const linkedAgentId = numberValue(input.linkedAgentId);
  const linkedAgentName = stringValue(input.linkedAgentName);
  const linkedAgentProviderId = stringValue(input.linkedAgentProviderId);
  const linkedAgentProjectName = stringValue(input.linkedAgentProjectName);
  const linkedAgentSessionId = stringValue(input.linkedAgentSessionId);
  const summary = stringValue(input.summary);
  const statusAfter = lifecycleStatus(input.statusAfter);
  const severity = timelineSeverity(input.severity);
  const source = timelineSource(input.source);

  if (providerId) record.providerId = providerId;
  if (projectName) record.projectName = projectName;
  if (sessionId) record.sessionId = sessionId;
  if (runId) record.runId = runId;
  if (artifactId) record.artifactId = artifactId;
  if (artifactStatus) record.artifactStatus = artifactStatus;
  if (previousStatus) record.previousStatus = previousStatus;
  if (nextStatus) record.nextStatus = nextStatus;
  if (dispatchStatus) record.dispatchStatus = dispatchStatus;
  if (executionStatus) record.executionStatus = executionStatus;
  if (packageRelativePath) record.packageRelativePath = packageRelativePath;
  if (reportRelativePath) record.reportRelativePath = reportRelativePath;
  if (branchName) record.branchName = branchName;
  if (reportExists !== undefined) record.reportExists = reportExists;
  if (branchExists !== undefined) record.branchExists = branchExists;
  if (branchMergedToMain !== undefined) record.branchMergedToMain = branchMergedToMain;
  if (linkedAgentId !== undefined) record.linkedAgentId = linkedAgentId;
  if (linkedAgentName) record.linkedAgentName = linkedAgentName;
  if (linkedAgentProviderId) record.linkedAgentProviderId = linkedAgentProviderId;
  if (linkedAgentProjectName) record.linkedAgentProjectName = linkedAgentProjectName;
  if (linkedAgentSessionId) record.linkedAgentSessionId = linkedAgentSessionId;
  if (summary) record.summary = summary;
  if (statusAfter) record.statusAfter = statusAfter;
  if (severity) record.severity = severity;
  if (source) record.source = source;
  return record;
}

function resolveTimelineStorePath(options: TimelineStoreOptions): string {
  return options.storePath ?? getTimelineStorePath(options.homeDir);
}

function compareNewestFirst(a: TimelineRecordV1, b: TimelineRecordV1): number {
  if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
  return b.id.localeCompare(a.id);
}

function isTimelineRecordV1(value: unknown): value is TimelineRecordV1 {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<TimelineRecordV1>;
  return (
    record.schemaVersion === TIMELINE_RECORD_SCHEMA_VERSION &&
    typeof record.id === 'string' &&
    typeof record.agentId === 'number' &&
    Number.isFinite(record.agentId) &&
    typeof record.timestamp === 'number' &&
    Number.isFinite(record.timestamp) &&
    typeof record.kind === 'string' &&
    typeof record.title === 'string' &&
    timelineVisibility(record.visibility) !== undefined &&
    (record.artifactId === undefined || typeof record.artifactId === 'string') &&
    (record.artifactStatus === undefined || typeof record.artifactStatus === 'string') &&
    (record.previousStatus === undefined || typeof record.previousStatus === 'string') &&
    (record.nextStatus === undefined || typeof record.nextStatus === 'string') &&
    (record.dispatchStatus === undefined || typeof record.dispatchStatus === 'string') &&
    (record.executionStatus === undefined || typeof record.executionStatus === 'string') &&
    (record.packageRelativePath === undefined || typeof record.packageRelativePath === 'string') &&
    (record.reportRelativePath === undefined || typeof record.reportRelativePath === 'string') &&
    (record.branchName === undefined || typeof record.branchName === 'string') &&
    (record.reportExists === undefined || typeof record.reportExists === 'boolean') &&
    (record.branchExists === undefined || typeof record.branchExists === 'boolean') &&
    (record.branchMergedToMain === undefined || typeof record.branchMergedToMain === 'boolean') &&
    (record.linkedAgentId === undefined ||
      (typeof record.linkedAgentId === 'number' && Number.isFinite(record.linkedAgentId))) &&
    (record.linkedAgentName === undefined || typeof record.linkedAgentName === 'string') &&
    (record.linkedAgentProviderId === undefined ||
      typeof record.linkedAgentProviderId === 'string') &&
    (record.linkedAgentProjectName === undefined ||
      typeof record.linkedAgentProjectName === 'string') &&
    (record.linkedAgentSessionId === undefined ||
      typeof record.linkedAgentSessionId === 'string') &&
    (record.severity === undefined || timelineSeverity(record.severity) !== undefined) &&
    (record.source === undefined || timelineSource(record.source) !== undefined) &&
    (record.statusAfter === undefined || lifecycleStatus(record.statusAfter) !== undefined)
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function timelineSeverity(value: unknown): TimelineRecordSeverity | undefined {
  if (value === 'info' || value === 'success' || value === 'warning' || value === 'error') {
    return value;
  }
  return undefined;
}

function timelineSource(value: unknown): TimelineRecordSource | undefined {
  if (value === 'user' || value === 'agent' || value === 'tool' || value === 'system') {
    return value;
  }
  return undefined;
}

function timelineVisibility(value: unknown): TimelineRecordVisibility | undefined {
  if (value === 'default' || value === 'verbose' || value === 'debug') {
    return value;
  }
  return undefined;
}

function lifecycleStatus(value: unknown): AgentLifecycleStatus | undefined {
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
