import * as path from 'path';

import type { TokenRateLimitSnapshot, TokenUsageDetails } from './tokenUsage.js';
import type { AgentState } from './types.js';
import {
  appendUsageRecord,
  createArtifactEstimateRecord,
  createRateLimitSnapshotRecord,
  createUsageDeltaRecord,
  type UsageRecordBaseInput,
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

const usageIngestionStates = new Map<string, UsageIngestionState>();

export function ingestAgentUsageSnapshot(
  input: UsageIngestionSnapshotInput,
): UsageIngestionSnapshotResult {
  const key = usageSnapshotKey(input.agent);
  const previous = usageIngestionStates.get(key);
  const currentProviderCounts = providerCountsFromSnapshot(input);
  const currentProviderTotal = providerTotal(currentProviderCounts);
  const currentArtifactTokens = tokenCount(input.artifactOutputTokens);
  const records: UsageRecordV1[] = [];

  const providerDelta = providerDeltaCounts(currentProviderCounts, currentProviderTotal, previous);
  if (providerDelta && providerTotal(providerDelta) > 0) {
    records.push(
      createUsageDeltaRecord({
        ...recordBaseInput(input),
        usage: providerDelta,
        tokenSource:
          input.estimated === true || input.details?.estimated === true
            ? UsageTokenSource.ESTIMATED_TRANSCRIPT
            : UsageTokenSource.EXACT_PROVIDER,
        isDeltaFromSnapshot: input.isDeltaFromSnapshot === true,
      }),
    );
  }

  const previousArtifactTokens = previous?.artifactOutputTokens ?? 0;
  const artifactDelta = Math.max(0, currentArtifactTokens - previousArtifactTokens);
  if (artifactDelta > 0) {
    records.push(
      createArtifactEstimateRecord({
        ...recordBaseInput(input),
        artifactOutputTokens: artifactDelta,
      }),
    );
  }

  const rateLimitSignature = rateLimitsSignature(input.rateLimits);
  if (rateLimitSignature && rateLimitSignature !== previous?.rateLimitSignature) {
    records.push(
      createRateLimitSnapshotRecord({
        ...recordBaseInput(input),
        rateLimits: input.rateLimits ?? [],
      }),
    );
  }

  usageIngestionStates.set(
    key,
    nextUsageIngestionState(previous, {
      providerCounts: currentProviderCounts,
      providerTotal: currentProviderTotal,
      artifactOutputTokens: currentArtifactTokens,
      rateLimitSignature: rateLimitSignature ?? previous?.rateLimitSignature,
    }),
  );

  for (const record of records) {
    appendUsageRecordBestEffort(
      record,
      input.appendRecord ?? appendUsageRecord,
      input.storeOptions,
    );
  }

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

function nextUsageIngestionState(
  previous: UsageIngestionState | undefined,
  current: UsageIngestionState,
): UsageIngestionState {
  const previousProviderTotal = previous?.providerTotal ?? 0;
  return {
    providerCounts:
      current.providerTotal >= previousProviderTotal
        ? current.providerCounts
        : (previous?.providerCounts ?? current.providerCounts),
    providerTotal: Math.max(previousProviderTotal, current.providerTotal),
    artifactOutputTokens: Math.max(
      previous?.artifactOutputTokens ?? 0,
      current.artifactOutputTokens,
    ),
    rateLimitSignature: current.rateLimitSignature,
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

function rateLimitsSignature(rateLimits: TokenRateLimitSnapshot[] | undefined): string | undefined {
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
): void {
  try {
    appendRecord(record, storeOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Pixel Agents] Usage ingestion: failed to append ${record.recordKind} for agent ${record.agent.id}: ${message}`,
    );
  }
}

function usageSnapshotKey(agent: UsageIngestionSnapshotInput['agent']): string {
  return [
    agent.providerId ?? 'claude',
    agent.id,
    agent.sessionId ?? '',
    normalizeKeyPath(agent.jsonlFile),
  ].join('|');
}

function normalizeKeyPath(value: string | undefined): string {
  if (!value) return '';
  return path.normalize(value).toLowerCase();
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
