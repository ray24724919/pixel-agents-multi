import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  USAGE_PATH_HASH_LENGTH,
  USAGE_PATH_HASH_PREFIX,
  USAGE_RECORD_SCHEMA_VERSION,
  USAGE_STORE_FILE_DIR,
  USAGE_STORE_FILE_NAME,
  USAGE_STORE_SUBDIR,
} from './constants.js';

export const UsageRecordKind = {
  USAGE_DELTA: 'usage_delta',
  ARTIFACT_ESTIMATE: 'artifact_estimate',
  RATE_LIMIT_SNAPSHOT: 'rate_limit_snapshot',
  SESSION_SUMMARY: 'session_summary',
} as const;
export type UsageRecordKind = (typeof UsageRecordKind)[keyof typeof UsageRecordKind];

export const UsageTokenSource = {
  EXACT_PROVIDER: 'exact_provider',
  ESTIMATED_TRANSCRIPT: 'estimated_transcript',
  MIXED: 'mixed',
} as const;
export type UsageTokenSource = (typeof UsageTokenSource)[keyof typeof UsageTokenSource];

export const UsageArtifactSource = {
  ESTIMATED_TOOL_PAYLOAD: 'estimated_tool_payload',
  NONE: 'none',
} as const;
export type UsageArtifactSource =
  (typeof UsageArtifactSource)[keyof typeof UsageArtifactSource];

export const UsageModelSource = {
  PROVIDER: 'provider',
  TRANSCRIPT: 'transcript',
  UNKNOWN: 'unknown',
} as const;
export type UsageModelSource = (typeof UsageModelSource)[keyof typeof UsageModelSource];

export const UsageProxyRateSource = {
  CONFIGURED: 'configured',
  DEFAULT: 'default',
} as const;
export type UsageProxyRateSource =
  (typeof UsageProxyRateSource)[keyof typeof UsageProxyRateSource];

export const UsageRateLimitSource = {
  PROVIDER_EXACT: 'provider_exact',
  ESTIMATED_WINDOW: 'estimated_window',
} as const;
export type UsageRateLimitSource =
  (typeof UsageRateLimitSource)[keyof typeof UsageRateLimitSource];

export const UsageDisplayLabel = {
  EXACT_PROVIDER: 'Exact provider usage',
  ESTIMATED: 'Estimated usage',
  MIXED: 'Mixed exact/estimated usage',
  API_PROXY: 'API proxy estimate only',
  NON_BILLING: 'Not actual subscription billing',
  ARTIFACT: 'Artifact estimate; not provider token usage',
} as const;

export type UsageTokenSourceLabel =
  | typeof UsageDisplayLabel.EXACT_PROVIDER
  | typeof UsageDisplayLabel.ESTIMATED
  | typeof UsageDisplayLabel.MIXED;
export type UsageApiProxyLabel = typeof UsageDisplayLabel.API_PROXY;
export type UsageNonBillingLabel = typeof UsageDisplayLabel.NON_BILLING;
export type UsageArtifactLabel = typeof UsageDisplayLabel.ARTIFACT;

export interface UsageProviderRef {
  id: string;
  label: string;
}

export interface UsageModelRef {
  id?: string;
  displayName?: string;
  source: UsageModelSource;
}

export interface UsageProjectRef {
  name: string;
  dir?: string;
  dirHash?: string;
  redactedDir?: string;
}

export interface UsageAgentRef {
  id: number;
  name: string;
  teamName?: string;
  roleName?: string;
  leadAgentId?: number;
  hidden?: boolean;
  archived?: boolean;
}

export interface UsageSessionRef {
  id?: string;
  transcriptPath?: string;
  transcriptPathHash?: string;
  redactedTranscriptPath?: string;
  threadId?: string;
  turnId?: string;
}

export interface UsageTokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningOutputTokens: number;
  artifactOutputTokens: number;
}

export interface UsageTotals {
  providerInputTotal: number;
  providerOutputTotal: number;
  providerTotal: number;
  displayTotal: number;
}

export interface UsageAccuracy {
  tokenSource: UsageTokenSource;
  artifactSource: UsageArtifactSource;
  isDeltaFromSnapshot: boolean;
  evidence?: string;
}

export interface UsageApiProxyEstimate {
  currency: 'USD';
  inputRatePerMillion: number;
  outputRatePerMillion: number;
  inputProxy: number;
  outputProxy: number;
  totalProxy: number;
  rateSource: UsageProxyRateSource;
  nonBillingLabel: UsageApiProxyLabel;
  subscriptionBillingLabel: UsageNonBillingLabel;
}

export interface UsageRateLimitSnapshot {
  name: 'primary' | 'secondary';
  usedPercent?: number;
  remainingPercent?: number;
  resetAtMs?: number;
  resetAfterSeconds?: number;
  source: UsageRateLimitSource;
}

export interface UsageRecordLabels {
  tokenSource: UsageTokenSourceLabel;
  apiProxy: UsageApiProxyLabel;
  nonBilling: UsageNonBillingLabel;
  artifact?: UsageArtifactLabel;
}

export interface UsageRecordV1 {
  schemaVersion: typeof USAGE_RECORD_SCHEMA_VERSION;
  id: string;
  recordKind: UsageRecordKind;
  capturedAtMs: number;
  occurredAtMs?: number;
  bucketDateLocal?: string;
  provider: UsageProviderRef;
  model?: UsageModelRef;
  project: UsageProjectRef;
  agent: UsageAgentRef;
  session: UsageSessionRef;
  usage: UsageTokenCounts;
  totals: UsageTotals;
  accuracy: UsageAccuracy;
  labels: UsageRecordLabels;
  apiProxyEstimate?: UsageApiProxyEstimate;
  rateLimits?: UsageRateLimitSnapshot[];
}

export interface UsageStoreOptions {
  homeDir?: string;
  storePath?: string;
}

export interface UsagePathRedaction {
  hash: string;
  redacted: string;
}

export interface UsageProviderRefInput {
  id: string;
  label?: string;
}

export interface UsageModelRefInput {
  id?: string;
  displayName?: string;
  source?: UsageModelSource;
}

export interface UsageProjectRefInput {
  name: string;
  dir?: string;
}

export interface UsageAgentRefInput {
  id: number;
  name: string;
  teamName?: string;
  roleName?: string;
  leadAgentId?: number;
  hidden?: boolean;
  archived?: boolean;
}

export interface UsageSessionRefInput {
  id?: string;
  transcriptPath?: string;
  threadId?: string;
  turnId?: string;
}

export interface UsageProxyRatesInput {
  inputRatePerMillion: number;
  outputRatePerMillion: number;
  rateSource?: UsageProxyRateSource;
}

export interface UsageRecordBaseInput {
  id?: string;
  capturedAtMs?: number;
  occurredAtMs?: number;
  bucketDateLocal?: string;
  provider: UsageProviderRefInput;
  model?: UsageModelRefInput;
  project: UsageProjectRefInput;
  agent: UsageAgentRefInput;
  session?: UsageSessionRefInput;
  includeRawPaths?: boolean;
  evidence?: string;
}

export interface CreateUsageDeltaRecordInput extends UsageRecordBaseInput {
  usage: Partial<Omit<UsageTokenCounts, 'artifactOutputTokens'>>;
  tokenSource: UsageTokenSource;
  isDeltaFromSnapshot?: boolean;
  proxyRates?: UsageProxyRatesInput;
}

export interface CreateArtifactEstimateRecordInput extends UsageRecordBaseInput {
  artifactOutputTokens: number;
}

export interface CreateRateLimitSnapshotRecordInput extends UsageRecordBaseInput {
  rateLimits: Array<Omit<UsageRateLimitSnapshot, 'source'> & { source?: UsageRateLimitSource }>;
}

export function getUsageStorePath(homeDir = os.homedir()): string {
  return path.join(
    homeDir,
    USAGE_STORE_FILE_DIR,
    USAGE_STORE_SUBDIR,
    USAGE_STORE_FILE_NAME,
  );
}

export function ensureUsageStoreDir(options: UsageStoreOptions = {}): string {
  const storePath = resolveUsageStorePath(options);
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function appendUsageRecord(
  record: UsageRecordV1,
  options: UsageStoreOptions = {},
): void {
  const storePath = resolveUsageStorePath(options);
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.appendFileSync(storePath, `${JSON.stringify(record)}\n`, 'utf8');
}

export function readUsageRecords(options: UsageStoreOptions = {}): UsageRecordV1[] {
  const storePath = resolveUsageStorePath(options);
  if (!fs.existsSync(storePath)) return [];
  const records: UsageRecordV1[] = [];
  const lines = fs.readFileSync(storePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isUsageRecordV1(parsed)) {
        records.push(parsed);
      }
    } catch {
      /* Ignore malformed historical lines and keep reading the append-only store. */
    }
  }
  return records;
}

export function createUsageRecordId(): string {
  return randomUUID();
}

export function normalizeUsagePathForHash(value: string): string {
  const normalized = path.normalize(value.trim()).replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.replace(/^([A-Z]):/, (drive) => drive.toLowerCase());
}

export function hashUsagePath(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const hash = createHash('sha256')
    .update(normalizeUsagePathForHash(value))
    .digest('hex')
    .slice(0, USAGE_PATH_HASH_LENGTH);
  return `${USAGE_PATH_HASH_PREFIX}${hash}`;
}

export function redactUsagePath(
  value: string | undefined,
  label: 'project' | 'transcript' = 'project',
): UsagePathRedaction | undefined {
  const hash = hashUsagePath(value);
  if (!hash) return undefined;
  return { hash, redacted: `${label}:${hash}` };
}

export function createUsageDeltaRecord(input: CreateUsageDeltaRecordInput): UsageRecordV1 {
  const usage = normalizeUsage({
    ...input.usage,
    artifactOutputTokens: 0,
  });
  const totals = usageTotals(usage);
  return createBaseRecord(input, {
    recordKind: UsageRecordKind.USAGE_DELTA,
    usage,
    totals,
    accuracy: {
      tokenSource: input.tokenSource,
      artifactSource: UsageArtifactSource.NONE,
      isDeltaFromSnapshot: input.isDeltaFromSnapshot === true,
      evidence: input.evidence,
    },
    apiProxyEstimate: input.proxyRates
      ? createApiProxyEstimate(totals, input.proxyRates)
      : undefined,
  });
}

export function createArtifactEstimateRecord(
  input: CreateArtifactEstimateRecordInput,
): UsageRecordV1 {
  const usage = normalizeUsage({ artifactOutputTokens: input.artifactOutputTokens });
  return createBaseRecord(input, {
    recordKind: UsageRecordKind.ARTIFACT_ESTIMATE,
    usage,
    totals: usageTotals(usage),
    accuracy: {
      tokenSource: UsageTokenSource.ESTIMATED_TRANSCRIPT,
      artifactSource: UsageArtifactSource.ESTIMATED_TOOL_PAYLOAD,
      isDeltaFromSnapshot: false,
      evidence: input.evidence,
    },
  });
}

export function createRateLimitSnapshotRecord(
  input: CreateRateLimitSnapshotRecordInput,
): UsageRecordV1 {
  const usage = normalizeUsage({});
  return createBaseRecord(input, {
    recordKind: UsageRecordKind.RATE_LIMIT_SNAPSHOT,
    usage,
    totals: usageTotals(usage),
    accuracy: {
      tokenSource: UsageTokenSource.EXACT_PROVIDER,
      artifactSource: UsageArtifactSource.NONE,
      isDeltaFromSnapshot: false,
      evidence: input.evidence,
    },
    rateLimits: input.rateLimits.map((limit) => ({
      ...limit,
      source: limit.source ?? UsageRateLimitSource.PROVIDER_EXACT,
    })),
  });
}

function createBaseRecord(
  input: UsageRecordBaseInput,
  values: {
    recordKind: UsageRecordKind;
    usage: UsageTokenCounts;
    totals: UsageTotals;
    accuracy: UsageAccuracy;
    apiProxyEstimate?: UsageApiProxyEstimate;
    rateLimits?: UsageRateLimitSnapshot[];
  },
): UsageRecordV1 {
  const record: UsageRecordV1 = {
    schemaVersion: USAGE_RECORD_SCHEMA_VERSION,
    id: input.id ?? createUsageRecordId(),
    recordKind: values.recordKind,
    capturedAtMs: input.capturedAtMs ?? Date.now(),
    provider: {
      id: input.provider.id,
      label: input.provider.label ?? input.provider.id,
    },
    project: createProjectRef(input.project, input.includeRawPaths === true),
    agent: input.agent,
    session: createSessionRef(input.session, input.includeRawPaths === true),
    usage: values.usage,
    totals: values.totals,
    accuracy: values.accuracy,
    labels: createLabels(values.accuracy),
  };
  if (input.occurredAtMs !== undefined) record.occurredAtMs = input.occurredAtMs;
  if (input.bucketDateLocal !== undefined) record.bucketDateLocal = input.bucketDateLocal;
  if (input.model) {
    record.model = {
      id: input.model.id,
      displayName: input.model.displayName,
      source: input.model.source ?? UsageModelSource.UNKNOWN,
    };
  }
  if (values.apiProxyEstimate) record.apiProxyEstimate = values.apiProxyEstimate;
  if (values.rateLimits) record.rateLimits = values.rateLimits;
  return record;
}

function createProjectRef(input: UsageProjectRefInput, includeRawPath: boolean): UsageProjectRef {
  const redaction = redactUsagePath(input.dir, 'project');
  return {
    name: input.name,
    dir: includeRawPath ? input.dir : undefined,
    dirHash: redaction?.hash,
    redactedDir: redaction?.redacted,
  };
}

function createSessionRef(
  input: UsageSessionRefInput | undefined,
  includeRawPath: boolean,
): UsageSessionRef {
  const redaction = redactUsagePath(input?.transcriptPath, 'transcript');
  return {
    id: input?.id,
    transcriptPath: includeRawPath ? input?.transcriptPath : undefined,
    transcriptPathHash: redaction?.hash,
    redactedTranscriptPath: redaction?.redacted,
    threadId: input?.threadId,
    turnId: input?.turnId,
  };
}

function normalizeUsage(input: Partial<UsageTokenCounts>): UsageTokenCounts {
  return {
    inputTokens: tokenCount(input.inputTokens),
    outputTokens: tokenCount(input.outputTokens),
    cacheReadTokens: tokenCount(input.cacheReadTokens),
    cacheWriteTokens: tokenCount(input.cacheWriteTokens),
    reasoningOutputTokens: tokenCount(input.reasoningOutputTokens),
    artifactOutputTokens: tokenCount(input.artifactOutputTokens),
  };
}

function usageTotals(usage: UsageTokenCounts): UsageTotals {
  const providerInputTotal =
    usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const providerOutputTotal = usage.outputTokens + usage.reasoningOutputTokens;
  const providerTotal = providerInputTotal + providerOutputTotal;
  return {
    providerInputTotal,
    providerOutputTotal,
    providerTotal,
    displayTotal: providerTotal,
  };
}

function createApiProxyEstimate(
  totals: UsageTotals,
  rates: UsageProxyRatesInput,
): UsageApiProxyEstimate {
  const inputRatePerMillion = Math.max(0, rates.inputRatePerMillion);
  const outputRatePerMillion = Math.max(0, rates.outputRatePerMillion);
  const inputProxy = (totals.providerInputTotal / 1_000_000) * inputRatePerMillion;
  const outputProxy = (totals.providerOutputTotal / 1_000_000) * outputRatePerMillion;
  return {
    currency: 'USD',
    inputRatePerMillion,
    outputRatePerMillion,
    inputProxy,
    outputProxy,
    totalProxy: inputProxy + outputProxy,
    rateSource: rates.rateSource ?? UsageProxyRateSource.DEFAULT,
    nonBillingLabel: UsageDisplayLabel.API_PROXY,
    subscriptionBillingLabel: UsageDisplayLabel.NON_BILLING,
  };
}

function createLabels(accuracy: UsageAccuracy): UsageRecordLabels {
  return {
    tokenSource: tokenSourceLabel(accuracy.tokenSource),
    apiProxy: UsageDisplayLabel.API_PROXY,
    nonBilling: UsageDisplayLabel.NON_BILLING,
    artifact:
      accuracy.artifactSource === UsageArtifactSource.ESTIMATED_TOOL_PAYLOAD
        ? UsageDisplayLabel.ARTIFACT
        : undefined,
  };
}

function tokenSourceLabel(source: UsageTokenSource): UsageTokenSourceLabel {
  if (source === UsageTokenSource.EXACT_PROVIDER) return UsageDisplayLabel.EXACT_PROVIDER;
  if (source === UsageTokenSource.MIXED) return UsageDisplayLabel.MIXED;
  return UsageDisplayLabel.ESTIMATED;
}

function tokenCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function resolveUsageStorePath(options: UsageStoreOptions): string {
  return options.storePath ?? getUsageStorePath(options.homeDir);
}

function isUsageRecordV1(value: unknown): value is UsageRecordV1 {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<UsageRecordV1>;
  return (
    record.schemaVersion === USAGE_RECORD_SCHEMA_VERSION &&
    typeof record.id === 'string' &&
    isUsageRecordKind(record.recordKind) &&
    typeof record.capturedAtMs === 'number' &&
    record.provider !== undefined &&
    record.project !== undefined &&
    record.agent !== undefined &&
    record.session !== undefined &&
    record.usage !== undefined &&
    record.totals !== undefined &&
    record.accuracy !== undefined
  );
}

function isUsageRecordKind(value: unknown): value is UsageRecordKind {
  return (
    value === UsageRecordKind.USAGE_DELTA ||
    value === UsageRecordKind.ARTIFACT_ESTIMATE ||
    value === UsageRecordKind.RATE_LIMIT_SNAPSHOT ||
    value === UsageRecordKind.SESSION_SUMMARY
  );
}
