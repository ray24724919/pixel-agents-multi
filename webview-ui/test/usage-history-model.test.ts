import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUsageHistoryModel,
  usageHistoryAccuracyLabel,
  type UsageHistoryRecordRateLimit,
  type UsageHistoryRecordV1,
  type UsageHistoryTokenSource,
} from '../src/components/usageHistoryModel.ts';

const NOW_MS = new Date(2026, 5, 2, 12, 0, 0, 0).getTime();
const TODAY_START_MS = new Date(2026, 5, 2, 0, 0, 0, 0).getTime();
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

interface RecordOptions {
  id?: string;
  providerId?: string;
  providerLabel?: string;
  modelId?: string;
  modelLabel?: string;
  projectName?: string;
  projectDir?: string;
  projectDirHash?: string;
  agentId?: number;
  agentName?: string;
  teamName?: string;
  roleName?: string;
  sessionId?: string;
  threadId?: string;
  transcriptPath?: string;
  occurredAtMs?: number;
  capturedAtMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningOutputTokens?: number;
  artifactOutputTokens?: number;
  tokenSource?: UsageHistoryTokenSource;
  recordKind?: UsageHistoryRecordV1['recordKind'];
  apiProxyEstimateUsd?: number;
  rateLimits?: UsageHistoryRecordRateLimit[];
}

function record(options: RecordOptions = {}): UsageHistoryRecordV1 {
  const inputTokens = options.inputTokens ?? 100;
  const outputTokens = options.outputTokens ?? 50;
  const cacheReadTokens = options.cacheReadTokens ?? 0;
  const cacheWriteTokens = options.cacheWriteTokens ?? 0;
  const reasoningOutputTokens = options.reasoningOutputTokens ?? 0;
  const artifactOutputTokens = options.artifactOutputTokens ?? 0;
  const providerInputTotal = inputTokens + cacheReadTokens + cacheWriteTokens;
  const providerOutputTotal = outputTokens + reasoningOutputTokens;
  const providerTotal = providerInputTotal + providerOutputTotal;
  const tokenSource = options.tokenSource ?? 'exact_provider';
  const recordKind = options.recordKind ?? 'usage_delta';

  return {
    schemaVersion: 1,
    id: options.id ?? 'record-1',
    recordKind,
    capturedAtMs: options.capturedAtMs ?? options.occurredAtMs ?? NOW_MS,
    occurredAtMs: options.occurredAtMs ?? NOW_MS,
    bucketDateLocal: '2026-06-02',
    provider: {
      id: options.providerId ?? 'codex',
      label: options.providerLabel ?? 'Codex',
    },
    model: {
      id: options.modelId ?? 'gpt-5-codex',
      displayName: options.modelLabel ?? 'GPT-5 Codex',
      source: 'provider',
    },
    project: {
      name: options.projectName ?? 'pixel-agents-multi',
      dir: options.projectDir ?? 'C:\\private\\pixel-agents-multi',
      dirHash: options.projectDirHash ?? 'sha256:pixel',
    },
    agent: {
      id: options.agentId ?? 1,
      name: options.agentName ?? 'Agent One',
      teamName: options.teamName,
      roleName: options.roleName,
    },
    session: {
      id: options.sessionId ?? 'session-1',
      threadId: options.threadId,
      transcriptPath: options.transcriptPath ?? 'C:\\private\\transcripts\\session-1.jsonl',
    },
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningOutputTokens,
      artifactOutputTokens,
    },
    totals: {
      providerInputTotal,
      providerOutputTotal,
      providerTotal,
      displayTotal: providerTotal,
    },
    accuracy: {
      tokenSource,
      artifactSource: artifactOutputTokens > 0 ? 'estimated_tool_payload' : 'none',
      isDeltaFromSnapshot: false,
    },
    apiProxyEstimate:
      options.apiProxyEstimateUsd === undefined
        ? undefined
        : {
            currency: 'USD',
            inputRatePerMillion: 5,
            outputRatePerMillion: 30,
            inputProxy: options.apiProxyEstimateUsd / 2,
            outputProxy: options.apiProxyEstimateUsd / 2,
            totalProxy: options.apiProxyEstimateUsd,
            rateSource: 'default',
            nonBillingLabel: 'API proxy estimate only',
            nonBillingNote: 'Not actual subscription billing',
          },
    rateLimits: options.rateLimits,
  };
}

test('usage history aggregates provider, project, model, and session groups', () => {
  const model = buildUsageHistoryModel(
    [
      record({ id: 'codex-1', inputTokens: 200, outputTokens: 100, sessionId: 's1' }),
      record({ id: 'codex-2', inputTokens: 50, outputTokens: 50, sessionId: 's1' }),
      record({
        id: 'claude-1',
        providerId: 'claude',
        providerLabel: 'Claude',
        modelId: 'claude-sonnet',
        modelLabel: 'Claude Sonnet',
        projectName: 'docs',
        projectDirHash: 'sha256:docs',
        sessionId: 's2',
        inputTokens: 75,
        outputTokens: 25,
      }),
    ],
    { nowMs: NOW_MS },
  );

  assert.equal(model.totals.providerTokens, 500);
  assert.equal(
    model.providers.find((provider) => provider.providerId === 'codex')?.providerTokens,
    400,
  );
  assert.equal(
    model.projects.find((project) => project.projectName === 'docs')?.providerTokens,
    100,
  );
  assert.equal(
    model.models.find((summary) => summary.modelId === 'claude-sonnet')?.label,
    'Claude Sonnet',
  );
  assert.equal(model.sessions.find((session) => session.sessionId === 's1')?.providerTokens, 400);
});

test('usage history rolls exact and estimated records into mixed accuracy', () => {
  const model = buildUsageHistoryModel(
    [
      record({ id: 'exact', inputTokens: 100, outputTokens: 100, tokenSource: 'exact_provider' }),
      record({
        id: 'estimated',
        inputTokens: 50,
        outputTokens: 50,
        tokenSource: 'estimated_transcript',
      }),
    ],
    { nowMs: NOW_MS },
  );

  assert.equal(model.totals.accuracy, 'mixed');
  assert.equal(model.providers[0]?.accuracy, 'mixed');
  assert.equal(model.totals.exactRecordCount, 1);
  assert.equal(model.totals.estimatedRecordCount, 1);
  assert.equal(usageHistoryAccuracyLabel(model.totals.accuracy), 'Mixed exact/estimated');
});

test('usage history keeps artifact estimates outside provider and API proxy totals', () => {
  const model = buildUsageHistoryModel(
    [
      record({
        id: 'provider',
        inputTokens: 100,
        outputTokens: 200,
        apiProxyEstimateUsd: 0.42,
      }),
      record({
        id: 'artifact',
        recordKind: 'artifact_estimate',
        inputTokens: 0,
        outputTokens: 0,
        artifactOutputTokens: 900,
        tokenSource: 'estimated_transcript',
      }),
    ],
    { nowMs: NOW_MS },
  );

  assert.equal(model.totals.providerTokens, 300);
  assert.equal(model.totals.artifactOutputTokens, 900);
  assert.equal(model.totals.displayTokens, 1_200);
  assert.equal(model.totals.apiProxyEstimateUsd, 0.42);
  assert.equal(model.exportData.nonBillingLabel, 'API proxy estimate only');
  assert.equal(model.exportData.nonBillingNote, 'Not actual subscription billing');
});

test('usage history totals cache read, cache write, and reasoning categories', () => {
  const model = buildUsageHistoryModel(
    [
      record({
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 30,
        cacheWriteTokens: 20,
        reasoningOutputTokens: 50,
      }),
    ],
    { nowMs: NOW_MS },
  );

  assert.equal(model.totals.inputTokens, 100);
  assert.equal(model.totals.outputTokens, 200);
  assert.equal(model.totals.cacheReadTokens, 30);
  assert.equal(model.totals.cacheWriteTokens, 20);
  assert.equal(model.totals.cacheTokens, 50);
  assert.equal(model.totals.reasoningOutputTokens, 50);
  assert.equal(model.totals.providerTokens, 400);
});

test('usage history builds ordered today and last seven day trend buckets', () => {
  const model = buildUsageHistoryModel(
    [
      record({
        id: 'today-hour-one',
        occurredAtMs: TODAY_START_MS + HOUR_MS,
        inputTokens: 10,
        outputTokens: 0,
      }),
      record({
        id: 'yesterday',
        occurredAtMs: TODAY_START_MS - DAY_MS,
        inputTokens: 20,
        outputTokens: 0,
      }),
    ],
    { nowMs: NOW_MS },
  );

  assert.equal(model.trends.today.length, 24);
  assert.equal(model.trends.today[0]?.label, '2026-06-02 00:00');
  assert.equal(model.trends.today[1]?.providerTokens, 10);
  assert.equal(model.trends.last7Days.length, 7);
  assert.deepEqual(
    model.trends.last7Days.map((bucket) => bucket.label),
    [
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-05-30',
      '2026-05-31',
      '2026-06-01',
      '2026-06-02',
    ],
  );
  assert.equal(model.trends.last7Days[5]?.providerTokens, 20);
  assert.equal(model.trends.last7Days[6]?.providerTokens, 10);
});

test('usage history exposes the latest rate-limit snapshot per provider', () => {
  const model = buildUsageHistoryModel(
    [
      record({
        id: 'old-quota',
        recordKind: 'rate_limit_snapshot',
        occurredAtMs: NOW_MS - HOUR_MS,
        inputTokens: 0,
        outputTokens: 0,
        rateLimits: [{ name: 'primary', usedPercent: 40, source: 'provider_exact' }],
      }),
      record({
        id: 'new-quota',
        recordKind: 'rate_limit_snapshot',
        occurredAtMs: NOW_MS,
        inputTokens: 0,
        outputTokens: 0,
        rateLimits: [
          { name: 'primary', usedPercent: 91, resetAfterSeconds: 600, source: 'provider_exact' },
        ],
      }),
    ],
    { nowMs: NOW_MS },
  );

  assert.equal(model.latestRateLimits.length, 1);
  assert.equal(model.latestRateLimits[0]?.recordId, 'new-quota');
  assert.equal(model.latestRateLimits[0]?.usedPercent, 91);
  assert.equal(model.providers[0]?.latestRateLimits[0]?.resetAfterSeconds, 600);
});

test('usage history reports an all-filtered-out state with active filters', () => {
  const model = buildUsageHistoryModel([record({ providerId: 'codex' })], {
    nowMs: NOW_MS,
    filters: { providerIds: ['claude'] },
  });

  assert.equal(model.filteredRecordCount, 0);
  assert.equal(model.emptyState?.kind, 'all_filtered_out');
  assert.deepEqual(model.emptyState?.activeFilters, ['provider:claude']);
});

test('usage history redacts export paths by default', () => {
  const model = buildUsageHistoryModel(
    [
      record({
        projectDir: 'C:\\Users\\User\\secret-project',
        projectDirHash: 'sha256:secret',
        transcriptPath: 'C:\\Users\\User\\.Codex\\projects\\secret\\session.jsonl',
      }),
    ],
    { nowMs: NOW_MS },
  );

  assert.equal(model.exportData.redacted, true);
  assert.equal(model.exportData.rows[0]?.project_hash, 'sha256:secret');
  assert.equal(model.exportData.rows[0]?.project_dir, '');
  assert.equal(model.exportData.rows[0]?.transcript_path, '');
  assert.equal(model.exportData.csv.includes('secret-project'), false);
  assert.equal(model.exportData.csv.includes('session.jsonl'), false);
});

test('usage history includes raw export paths only when requested', () => {
  const model = buildUsageHistoryModel(
    [
      record({
        projectDir: 'C:\\Users\\User\\raw-project',
        transcriptPath: 'C:\\Users\\User\\.Codex\\projects\\raw\\session.jsonl',
      }),
    ],
    { nowMs: NOW_MS, includeRawPaths: true },
  );

  assert.equal(model.exportData.redacted, false);
  assert.equal(model.exportData.rows[0]?.project_dir, 'C:\\Users\\User\\raw-project');
  assert.equal(
    model.exportData.rows[0]?.transcript_path,
    'C:\\Users\\User\\.Codex\\projects\\raw\\session.jsonl',
  );
  assert.equal(model.projects[0]?.projectDir, 'C:\\Users\\User\\raw-project');
});

test('usage history filters by provider, model, project, agent, session, and time window', () => {
  const records = [
    record({
      id: 'match',
      providerId: 'codex',
      modelId: 'gpt-5-codex',
      projectName: 'pixel',
      projectDirHash: 'sha256:pixel',
      agentId: 7,
      sessionId: 'target-session',
      occurredAtMs: TODAY_START_MS + HOUR_MS,
      inputTokens: 90,
      outputTokens: 10,
    }),
    record({
      id: 'miss',
      providerId: 'claude',
      modelId: 'claude-sonnet',
      projectName: 'other',
      projectDirHash: 'sha256:other',
      agentId: 8,
      sessionId: 'other-session',
      occurredAtMs: TODAY_START_MS - DAY_MS,
      inputTokens: 1_000,
      outputTokens: 1_000,
    }),
  ];

  const model = buildUsageHistoryModel(records, {
    nowMs: NOW_MS,
    filters: {
      providerIds: ['codex'],
      modelIds: ['gpt-5-codex'],
      projectNames: ['pixel'],
      projectDirHashes: ['sha256:pixel'],
      agentIds: [7],
      sessionIds: ['target-session'],
      fromMs: TODAY_START_MS,
      toMs: TODAY_START_MS + 2 * HOUR_MS,
    },
  });

  assert.equal(model.filteredRecordCount, 1);
  assert.equal(model.totals.providerTokens, 100);
  assert.equal(model.ledgerRows[0]?.agentId, 7);
  assert.equal(model.sessions[0]?.sessionId, 'target-session');
});

test('usage history sorts ledger rows by display tokens then provider tokens', () => {
  const model = buildUsageHistoryModel(
    [
      record({
        id: 'artifact-heavy',
        agentId: 1,
        agentName: 'Artifact worker',
        sessionId: 'a',
        inputTokens: 0,
        outputTokens: 0,
        artifactOutputTokens: 500,
        recordKind: 'artifact_estimate',
      }),
      record({
        id: 'provider-heavy',
        agentId: 2,
        agentName: 'Provider worker',
        sessionId: 'b',
        inputTokens: 200,
        outputTokens: 200,
      }),
      record({
        id: 'mixed-display',
        agentId: 3,
        agentName: 'Mixed worker',
        sessionId: 'c',
        inputTokens: 150,
        outputTokens: 150,
        artifactOutputTokens: 100,
      }),
    ],
    { nowMs: NOW_MS },
  );

  assert.deepEqual(
    model.ledgerRows.map((row) => row.agentId),
    [1, 2, 3],
  );
  assert.equal(model.ledgerRows[1]?.displayTokens, 400);
  assert.equal(model.ledgerRows[1]?.providerTokens, 400);
  assert.equal(model.ledgerRows[2]?.providerTokens, 300);
});

test('usage history keeps useful no-records state and empty trend shells', () => {
  const model = buildUsageHistoryModel([], { nowMs: NOW_MS });

  assert.equal(model.emptyState?.kind, 'no_records');
  assert.equal(model.totals.accuracy, 'none');
  assert.equal(model.trends.today.length, 24);
  assert.equal(model.trends.last7Days.length, 7);
  assert.equal(model.exportData.rows.length, 0);
  assert.equal(
    model.exportData.csv,
    'occurred_at,provider,provider_label,model,project,project_hash,project_dir,agent_id,agent_name,team,role,session_id,thread_id,transcript_path,input_tokens,output_tokens,provider_input_tokens,provider_output_tokens,provider_tokens,cache_read_tokens,cache_write_tokens,reasoning_output_tokens,artifact_output_tokens,display_tokens,token_source,artifact_source,api_proxy_estimate_usd,non_billing_label,non_billing_note,last_activity',
  );
});
