import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUsageHistoryModel,
  type UsageHistoryRecordRateLimit,
  type UsageHistoryRecordV1,
  type UsageHistoryTokenSource,
} from '../src/components/usageHistoryModel.ts';
import {
  buildUsageIntelligenceDashboard,
  type UsageIntelligenceAgent,
} from '../src/components/usageIntelligenceModel.ts';
import { buildUsageOverviewDashboard } from '../src/components/usageOverviewDashboardModel.ts';

const NOW_MS = new Date(2026, 5, 8, 12, 0, 0, 0).getTime();
const TODAY_START_MS = new Date(2026, 5, 8, 0, 0, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1_000;

interface RecordOptions {
  id?: string;
  providerId?: string;
  providerLabel?: string;
  projectName?: string;
  projectDirHash?: string;
  agentId?: number;
  agentName?: string;
  sessionId?: string;
  occurredAtMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  artifactOutputTokens?: number;
  tokenSource?: UsageHistoryTokenSource;
  recordKind?: UsageHistoryRecordV1['recordKind'];
  rateLimits?: UsageHistoryRecordRateLimit[];
}

function historyRecord(options: RecordOptions = {}): UsageHistoryRecordV1 {
  const inputTokens = options.inputTokens ?? 100;
  const outputTokens = options.outputTokens ?? 50;
  const artifactOutputTokens = options.artifactOutputTokens ?? 0;
  const providerTotal = inputTokens + outputTokens;

  return {
    schemaVersion: 1,
    id: options.id ?? 'record-1',
    recordKind: options.recordKind ?? 'usage_delta',
    capturedAtMs: options.occurredAtMs ?? NOW_MS,
    occurredAtMs: options.occurredAtMs ?? NOW_MS,
    bucketDateLocal: '2026-06-08',
    provider: {
      id: options.providerId ?? 'codex',
      label: options.providerLabel ?? 'Codex',
    },
    model: {
      id: options.providerId === 'claude' ? 'claude-sonnet' : 'gpt-5-codex',
      displayName: options.providerId === 'claude' ? 'Claude Sonnet' : 'GPT-5 Codex',
      source: 'provider',
    },
    project: {
      name: options.projectName ?? 'pixel-agents-multi',
      dirHash: options.projectDirHash ?? 'sha256:pixel',
    },
    agent: {
      id: options.agentId ?? 1,
      name: options.agentName ?? 'Agent One',
    },
    session: {
      id: options.sessionId ?? 'session-1',
    },
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningOutputTokens: 0,
      artifactOutputTokens,
    },
    totals: {
      providerInputTotal: inputTokens,
      providerOutputTotal: outputTokens,
      providerTotal,
      displayTotal: providerTotal + artifactOutputTokens,
    },
    accuracy: {
      tokenSource: options.tokenSource ?? 'exact_provider',
      artifactSource: artifactOutputTokens > 0 ? 'estimated_tool_payload' : 'none',
      isDeltaFromSnapshot: false,
    },
    rateLimits: options.rateLimits,
  };
}

function liveAgent(overrides: Partial<UsageIntelligenceAgent>): UsageIntelligenceAgent {
  return {
    id: 1,
    name: 'Live Agent',
    providerId: 'codex',
    project: 'pixel-agents-multi',
    status: 'active',
    inputTokens: 0,
    outputTokens: 0,
    artifactOutputTokens: 0,
    tokenUsageEstimated: false,
    ...overrides,
  };
}

test('usage overview combines live, today, last seven days, provider, and project totals', () => {
  const records = [
    historyRecord({
      id: 'codex-today',
      occurredAtMs: TODAY_START_MS + 60_000,
      inputTokens: 500,
      outputTokens: 500,
    }),
    historyRecord({
      id: 'claude-yesterday',
      providerId: 'claude',
      providerLabel: 'Claude',
      projectName: 'docs',
      projectDirHash: 'sha256:docs',
      occurredAtMs: TODAY_START_MS - DAY_MS,
      inputTokens: 100,
      outputTokens: 50,
      tokenSource: 'estimated_transcript',
    }),
    historyRecord({
      id: 'old-codex',
      occurredAtMs: TODAY_START_MS - 8 * DAY_MS,
      inputTokens: 2_000,
      outputTokens: 0,
    }),
  ];
  const live = buildUsageIntelligenceDashboard([
    liveAgent({ id: 1, inputTokens: 250, outputTokens: 250 }),
  ]);
  const history = buildUsageHistoryModel(records, { nowMs: NOW_MS });

  const overview = buildUsageOverviewDashboard({
    live,
    history,
    historyRecords: records,
    nowMs: NOW_MS,
  });

  assert.equal(overview.metrics.find((metric) => metric.id === 'live')?.value, 500);
  assert.equal(overview.metrics.find((metric) => metric.id === 'today')?.value, 1_000);
  assert.equal(overview.metrics.find((metric) => metric.id === 'last7')?.value, 1_150);
  assert.equal(
    overview.providerRows.find((row) => row.providerId === 'codex')?.todayDisplayTokens,
    1_000,
  );
  assert.equal(
    overview.providerRows.find((row) => row.providerId === 'claude')?.last7DaysDisplayTokens,
    150,
  );
  assert.equal(overview.projectRows[0]?.projectName, 'pixel-agents-multi');
  assert.equal(overview.trendBuckets.length, 7);
});

test('usage overview emits supervision insights for quota, estimates, and artifacts', () => {
  const records = [
    historyRecord({
      id: 'artifact',
      recordKind: 'artifact_estimate',
      inputTokens: 0,
      outputTokens: 0,
      artifactOutputTokens: 1_500,
      tokenSource: 'estimated_transcript',
    }),
    historyRecord({
      id: 'quota',
      recordKind: 'rate_limit_snapshot',
      inputTokens: 0,
      outputTokens: 0,
      rateLimits: [{ name: 'primary', usedPercent: 92, source: 'provider_exact' }],
    }),
  ];
  const live = buildUsageIntelligenceDashboard([
    liveAgent({
      id: 1,
      inputTokens: 100,
      outputTokens: 100,
      tokenUsageEstimated: true,
    }),
  ]);
  const history = buildUsageHistoryModel(records, { nowMs: NOW_MS });

  const overview = buildUsageOverviewDashboard({
    live,
    history,
    historyRecords: records,
    nowMs: NOW_MS,
  });
  const insightIds = overview.insights.map((insight) => insight.id);

  assert.equal(insightIds.includes('estimate-heavy'), true);
  assert.equal(insightIds.includes('artifact-heavy'), true);
  assert.equal(insightIds.includes('codex-quota-pressure'), true);
  assert.equal(overview.quotaSignals[0]?.severity, 'warning');
});

test('usage overview keeps a useful no telemetry state', () => {
  const live = buildUsageIntelligenceDashboard([]);
  const history = buildUsageHistoryModel([], { nowMs: NOW_MS });

  const overview = buildUsageOverviewDashboard({
    live,
    history,
    historyRecords: [],
    nowMs: NOW_MS,
  });

  assert.equal(overview.emptyState?.title, 'No usage telemetry yet');
  assert.equal(overview.insights[0]?.id, 'no-usage');
});
