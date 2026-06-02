import * as path from 'path';

import type { TokenRateLimitSnapshot, TokenUsageDetails } from './tokenUsage.js';
import type { AgentState } from './types.js';
import {
  appendUsageRecord,
  createArtifactEstimateRecord,
  createRateLimitSnapshotRecord,
  createUsageDeltaRecord,
  hashUsagePath,
  readUsageRecords,
  type UsageRecordBaseInput,
  UsageRecordKind,
  type UsageRecordV1,
  type UsageStoreOptions,
  UsageTokenSource,
} from './usageStore.js';

export type UsageRecordAppender = (record: UsageRecordV1, options?: UsageStoreOptions) => void;

export interface UsageIngestionSnapshotInput {
  agent: Pick<
    AgentState,
    | 'id'
    | 'providerId'
    | 'projectDir'
    | 'projectName'
    | 'folderName'
    | 'jsonlFile'
    | 'sessionId'
    | 'agentName'
    | 'teamName'
    | 'leadAgentId'
    | 'hidden'
  >;
  details?: TokenUsageDetails;
  inputTokens?: number;
  outputTokens?: number;
  artifactOutputTokens?: number;
  estimated?: boolean;
  rateLimits?: TokenRateLimitSnapshot[];
  capturedAtMs?: number;
  occurredAtMs?: number;
  evidence: string;
  isDeltaFromSnapshot?: boolean;
  appendRecord?: UsageRecordAppender;
  storeOptions?: UsageStoreOptions;
}

export interface UsageIngestionSnapshotResult {
  records: UsageRecordV1[];
}

interface ProviderCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningOutputTokens: number;
}

interface UsageIngestionState {
  providerCounts: ProviderCounts;
  providerTotal: number;
  artifactOutputTokens: number;
  rateLimitSignature?: string;
}

interface UsageSnapshotIdentity {
  providerId: string;
  sessionId?: string;
  threadId?: string;
  transcriptPathHash?: string;
  fallbackAgentId: number;
}

interface RateLimitForSignature {
  name: 'primary' | 'secondary';
  usedPercent?: number;
  remainingPercent?: number;
  resetAtMs?: number;
  resetAfterSeconds?: number;
}

const usageIngestionStates = new Map<string, UsageIngestionState>();

export function ingestAgentUsageSnapshot(
  input: UsageIngestionSnapshotInput,
): UsageIngestionSnapshotResult {
  const key = usageSnapshotKey(usageSnapshotIdentityFromAgent(input.agent));
  const previous =
    usageIngestionStates.get(key) ?? seedUsageIngestionState(key, input.storeOptions);
  const currentProviderCounts = providerCountsFromSnapshot(input);
  const currentProviderTotal = providerTotal(currentProviderCounts);
  const currentArtifactTokens = tokenCount(input.artifactOutputTokens);
  const records: UsageRecordV1[] = [];
  const nextState = previous ? cloneUsageIngestionState(previous) : emptyUsageIngestionState();
  const appendRecord = input.appendRecord ?? appendUsageRecord;

  const providerDelta = providerDeltaCounts(currentProviderCounts, currentProviderTotal, previous);
  if (providerDelta && providerTotal(providerDelta) > 0) {
    const record = createUsageDeltaRecord({
      ...recordBaseInput(input),
      usage: providerDelta,
      tokenSource:
        input.estimated === true || input.details?.estimated === true
          ? UsageTokenSource.ESTIMATED_TRANSCRIPT
          : UsageTokenSource.EXACT_PROVIDER,
      isDeltaFromSnapshot: input.isDeltaFromSnapshot === true,
    });
    records.push(record);
    if (appendUsageRecordBestEffort(record, appendRecord, input.storeOptions)) {
      nextState.providerCounts = currentProviderCounts;
      nextState.providerTotal = currentProviderTotal;
    }
  } else if (currentProviderTotal >= nextState.providerTotal) {
    nextState.providerCounts = currentProviderCounts;
    nextState.providerTotal = Math.max(nextState.providerTotal, currentProviderTotal);
  }

  const previousArtifactTokens = previous?.artifactOutputTokens ?? 0;
  const artifactDelta = Math.max(0, currentArtifactTokens - previousArtifactTokens);
  if (artifactDelta > 0) {
    const record = createArtifactEstimateRecord({
      ...recordBaseInput(input),
      artifactOutputTokens: artifactDelta,
    });
    records.push(record);
    if (appendUsageRecordBestEffort(record, appendRecord, input.storeOptions)) {
      nextState.artifactOutputTokens = Math.max(
        nextState.artifactOutputTokens,
        currentArtifactTokens,
      );
    }
  } else {
    nextState.artifactOutputTokens = Math.max(
      nextState.artifactOutputTokens,
      currentArtifactTokens,
    );
  }

  const rateLimitSignature = rateLimitsSignature(input.rateLimits);
  if (rateLimitSignature && rateLimitSignature !== previous?.rateLimitSignature) {
    const record = createRateLimitSnapshotRecord({
      ...recordBaseInput(input),
      rateLimits: input.rateLimits ?? [],
    });
    records.push(record);
    if (appendUsageRecordBestEffort(record, appendRecord, input.storeOptions)) {
      nextState.rateLimitSignature = rateLimitSignature;
    }
  } else {
    nextState.rateLimitSignature = previous?.rateLimitSignature ?? rateLimitSignature;
  }

  usageIngestionStates.set(key, nextState);
  return { records };
}

export function extractUsageOccurredAtMs(
  record: Record<string, unknown> | null | undefined,
): number | undefined {
  if (!record) return undefined;
  return timestampMs(record.timestamp ?? record.created_at ?? record.createdAt);
}

export function resetUsageIngestionStateForTests(): void {
  usageIngestionStates.clear();
}

function seedUsageIngestionState(
  key: string,
  storeOptions: UsageStoreOptions | undefined,
): UsageIngestionState | undefined {
  let records: UsageRecordV1[];
  try {
    records = readUsageRecords(storeOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Pixel Agents] Usage ingestion: failed to read usage store: ${message}`);
    return undefined;
  }

  let matched = false;
  const seeded = emptyUsageIngestionState();
  for (const record of records) {
    if (usageSnapshotKeyFromRecord(record) !== key) continue;
    matched = true;
    if (record.recordKind === UsageRecordKind.USAGE_DELTA) {
      seeded.providerCounts = addProviderCounts(seeded.providerCounts, {
        inputTokens: tokenCount(record.usage.inputTokens),
        outputTokens: tokenCount(record.usage.outputTokens),
        cacheReadTokens: tokenCount(record.usage.cacheReadTokens),
        cacheWriteTokens: tokenCount(record.usage.cacheWriteTokens),
        reasoningOutputTokens: tokenCount(record.usage.reasoningOutputTokens),
      });
      seeded.providerTotal = providerTotal(seeded.providerCounts);
    } else if (record.recordKind === UsageRecordKind.ARTIFACT_ESTIMATE) {
      seeded.artifactOutputTokens += tokenCount(record.usage.artifactOutputTokens);
    } else if (record.recordKind === UsageRecordKind.RATE_LIMIT_SNAPSHOT) {
      seeded.rateLimitSignature = rateLimitsSignature(record.rateLimits);
    }
  }

  return matched ? seeded : undefined;
}

function recordBaseInput(input: UsageIngestionSnapshotInput): UsageRecordBaseInput {
  const agent = input.agent;
  const providerId = agent.providerId ?? 'claude';
  const providerLabel =
    providerId === 'codex' ? 'Codex' : providerId === 'claude' ? 'Claude' : providerId;
  const projectName =
    agent.projectName ??
    agent.folderName ??
    (agent.projectDir ? path.basename(agent.projectDir) : 'Unknown project');
  return {
    capturedAtMs: input.capturedAtMs,
    occurredAtMs: input.occurredAtMs,
    provider: { id: providerId, label: providerLabel },
    project: { name: projectName, dir: agent.projectDir },
    agent: {
      id: agent.id,
      name: agent.agentName ?? `${providerLabel} #${agent.id}`,
      teamName: agent.teamName,
      roleName: agent.teamName ? agent.agentName : undefined,
      leadAgentId: agent.leadAgentId,
      hidden: agent.hidden,
    },
    session: {
      id: agent.sessionId,
      transcriptPath: agent.jsonlFile,
      threadId: providerId === 'codex' ? agent.sessionId : undefined,
    },
    evidence: input.evidence,
  };
}

function providerCountsFromSnapshot(input: UsageIngestionSnapshotInput): ProviderCounts {
  if (input.details) {
    return {
      inputTokens: tokenCount(input.details.input),
      outputTokens: tokenCount(input.details.output),
      cacheReadTokens: tokenCount(input.details.cacheRead),
      cacheWriteTokens: tokenCount(input.details.cacheWrite),
      reasoningOutputTokens: tokenCount(input.details.reasoningOutput),
    };
  }
  return {
    inputTokens: tokenCount(input.inputTokens),
    outputTokens: tokenCount(input.outputTokens),
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningOutputTokens: 0,
  };
}

function providerDeltaCounts(
  currentCounts: ProviderCounts,
  currentTotal: number,
  previous: UsageIngestionState | undefined,
): ProviderCounts | undefined {
  if (!previous) {
    return currentTotal > 0 ? currentCounts : undefined;
  }

  const totalDelta = Math.max(0, currentTotal - previous.providerTotal);
  if (totalDelta === 0) return undefined;

  const delta = {
    inputTokens: Math.max(0, currentCounts.inputTokens - previous.providerCounts.inputTokens),
    outputTokens: Math.max(0, currentCounts.outputTokens - previous.providerCounts.outputTokens),
    cacheReadTokens: Math.max(
      0,
      currentCounts.cacheReadTokens - previous.providerCounts.cacheReadTokens,
    ),
    cacheWriteTokens: Math.max(
      0,
      currentCounts.cacheWriteTokens - previous.providerCounts.cacheWriteTokens,
    ),
    reasoningOutputTokens: Math.max(
      0,
      currentCounts.reasoningOutputTokens - previous.providerCounts.reasoningOutputTokens,
    ),
  };
  return capProviderDelta(delta, totalDelta);
}

function capProviderDelta(delta: ProviderCounts, totalDelta: number): ProviderCounts {
  let remaining = totalDelta;
  const capped = {
    inputTokens: Math.min(delta.inputTokens, remaining),
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningOutputTokens: 0,
  };
  remaining -= capped.inputTokens;
  capped.outputTokens = Math.min(delta.outputTokens, remaining);
  remaining -= capped.outputTokens;
  capped.cacheReadTokens = Math.min(delta.cacheReadTokens, remaining);
  remaining -= capped.cacheReadTokens;
  capped.cacheWriteTokens = Math.min(delta.cacheWriteTokens, remaining);
  remaining -= capped.cacheWriteTokens;
  capped.reasoningOutputTokens = Math.min(delta.reasoningOutputTokens, remaining);
  return capped;
}

function emptyUsageIngestionState(): UsageIngestionState {
  return {
    providerCounts: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningOutputTokens: 0,
    },
    providerTotal: 0,
    artifactOutputTokens: 0,
  };
}

function cloneUsageIngestionState(state: UsageIngestionState): UsageIngestionState {
  return {
    providerCounts: { ...state.providerCounts },
    providerTotal: state.providerTotal,
    artifactOutputTokens: state.artifactOutputTokens,
    rateLimitSignature: state.rateLimitSignature,
  };
}

function addProviderCounts(a: ProviderCounts, b: ProviderCounts): ProviderCounts {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    reasoningOutputTokens: a.reasoningOutputTokens + b.reasoningOutputTokens,
  };
}

function providerTotal(counts: ProviderCounts): number {
  return (
    counts.inputTokens +
    counts.outputTokens +
    counts.cacheReadTokens +
    counts.cacheWriteTokens +
    counts.reasoningOutputTokens
  );
}

function rateLimitsSignature(rateLimits: RateLimitForSignature[] | undefined): string | undefined {
  if (!rateLimits || rateLimits.length === 0) return undefined;
  return JSON.stringify(
    [...rateLimits]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((limit) => ({
        name: limit.name,
        usedPercent: limit.usedPercent,
        remainingPercent: limit.remainingPercent,
        resetAtMs: limit.resetAtMs,
        resetAfterSeconds: limit.resetAfterSeconds,
      })),
  );
}

function appendUsageRecordBestEffort(
  record: UsageRecordV1,
  appendRecord: UsageRecordAppender,
  storeOptions: UsageStoreOptions | undefined,
): boolean {
  try {
    appendRecord(record, storeOptions);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Pixel Agents] Usage ingestion: failed to append ${record.recordKind} for agent ${record.agent.id}: ${message}`,
    );
    return false;
  }
}

function usageSnapshotIdentityFromAgent(
  agent: UsageIngestionSnapshotInput['agent'],
): UsageSnapshotIdentity {
  const providerId = agent.providerId ?? 'claude';
  return {
    providerId,
    sessionId: cleanIdentityPart(agent.sessionId),
    threadId: providerId === 'codex' ? cleanIdentityPart(agent.sessionId) : undefined,
    transcriptPathHash: hashUsagePath(agent.jsonlFile),
    fallbackAgentId: agent.id,
  };
}

function usageSnapshotKeyFromRecord(record: UsageRecordV1): string {
  return usageSnapshotKey({
    providerId: record.provider.id,
    sessionId: cleanIdentityPart(record.session.id),
    threadId: cleanIdentityPart(record.session.threadId),
    transcriptPathHash:
      cleanIdentityPart(record.session.transcriptPathHash) ??
      hashUsagePath(record.session.transcriptPath),
    fallbackAgentId: record.agent.id,
  });
}

function usageSnapshotKey(identity: UsageSnapshotIdentity): string {
  const stableParts = uniqueStrings([
    identity.sessionId ? `session:${identity.sessionId}` : undefined,
    identity.threadId ? `thread:${identity.threadId}` : undefined,
    identity.transcriptPathHash ? `transcript:${identity.transcriptPathHash}` : undefined,
  ]);
  if (stableParts.length > 0) {
    return [identity.providerId, ...stableParts].join('|');
  }
  return [identity.providerId, `agent:${identity.fallbackAgentId}`].join('|');
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!value || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

function cleanIdentityPart(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function tokenCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value < 10_000_000_000 ? value * 1000 : value;
}
