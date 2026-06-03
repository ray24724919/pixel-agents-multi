import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  UsageHistoryRecordRateLimit,
  UsageHistoryRecordV1,
  UsageHistoryTokenSource,
} from '../src/components/usageHistoryModel.ts';
import {
  buildUsageHistoryPageModel,
  DEFAULT_USAGE_HISTORY_PAGE_FILTERS,
  usageHistoryTimeFilterLabel,
  usageHistoryUnavailableMessage,
} from '../src/components/usageHistoryPageModel.ts';

const NOW_MS = new Date(2026, 5, 3, 12, 0, 0, 0).getTime();
const TODAY_START_MS = new Date(2026, 5, 3, 0, 0, 0, 0).getTime();
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

interface RecordOptions {
  id?: string;
  recordKind?: UsageHistoryRecordV1['recordKind'];
  providerId?: string;
  providerLabel?: string;
  modelId?: string;
  modelLabel?: string;
  projectName?: string;
  projectDir?: string;
  projectDirHash?: string;
  agentId?: number;
  agentName?: string;
  sessionId?: string;
  transcriptPath?: string;
  occurredAtMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  tokenSource?: UsageHistoryTokenSource;
  apiProxyEstimateUsd?: number;
  rateLimits?: UsageHistoryRecordRateLimit[];
}

function record(options: RecordOptions = {}): UsageHistoryRecordV1 {
  const inputTokens = options.inputTokens ?? 100;
  const outputTokens = options.outputTokens ?? 50;
  const providerInputTotal = inputTokens;
  const providerOutputTotal = outputTokens;
  const providerTotal = providerInputTotal + providerOutputTotal;

  return {
    schemaVersion: 1,
    id: options.id ?? 'record-1',
    recordKind: options.recordKind ?? 'usage_delta',
    capturedAtMs: options.occurredAtMs ?? NOW_MS,
    occurredAtMs: options.occurredAtMs ?? NOW_MS,
    bucketDateLocal: '2026-06-03',
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
    },
    session: {
      id: options.sessionId ?? 'session-1',
      transcriptPath: options.transcriptPath ?? 'C:\\private\\transcripts\\session-1.jsonl',
    },
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningOutputTokens: 0,
      artifactOutputTokens: 0,
    },
    totals: {
      providerInputTotal,
      providerOutputTotal,
      providerTotal,
      displayTotal: providerTotal,
    },
    accuracy: {
      tokenSource: options.tokenSource ?? 'exact_provider',
      artifactSource: 'none',
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

test('usage history page model exposes provider, project, model, and quota summaries', () => {
  const pageModel = buildUsageHistoryPageModel(
    [
      record({
        id: 'codex-usage',
        inputTokens: 200,
        outputTokens: 100,
        apiProxyEstimateUsd: 0.12,
      }),
      record({
        id: 'claude-usage',
        providerId: 'claude',
        providerLabel: 'Claude',
        modelId: 'claude-sonnet',
        modelLabel: 'Claude Sonnet',
        projectName: 'docs',
        projectDirHash: 'sha256:docs',
        agentId: 2,
        sessionId: 'session-2',
        inputTokens: 25,
        outputTokens: 75,
        tokenSource: 'estimated_transcript',
      }),
      record({
        id: 'codex-quota',
        recordKind: 'rate_limit_snapshot',
        inputTokens: 0,
        outputTokens: 0,
        rateLimits: [{ name: 'primary', usedPercent: 80, source: 'provider_exact' }],
      }),
    ],
    DEFAULT_USAGE_HISTORY_PAGE_FILTERS,
    NOW_MS,
  );

  assert.equal(pageModel.filtered.totals.providerTokens, 400);
  assert.equal(pageModel.filtered.totals.apiProxyEstimateUsd, 0.12);
  assert.equal(pageModel.filtered.providers.length, 2);
  assert.equal(
    pageModel.filtered.projects.find((project) => project.projectName === 'docs')?.providerTokens,
    100,
  );
  assert.equal(
    pageModel.filtered.models.find((model) => model.modelId === 'claude-sonnet')?.label,
    'Claude Sonnet',
  );
  assert.equal(pageModel.filtered.latestRateLimits[0]?.usedPercent, 80);
  assert.equal(
    pageModel.providerOptions.find((option) => option.value === 'codex')?.label,
    'Codex',
  );
  assert.equal(
    pageModel.projectOptions.find((option) => option.label === 'docs')?.detail,
    'sha256:docs',
  );
});

test('usage history page filters change historical totals by provider, project, and time window', () => {
  const records = [
    record({
      id: 'codex-today',
      occurredAtMs: TODAY_START_MS + HOUR_MS,
      inputTokens: 90,
      outputTokens: 10,
    }),
    record({
      id: 'codex-old',
      occurredAtMs: TODAY_START_MS - 8 * DAY_MS,
      inputTokens: 1_000,
      outputTokens: 0,
    }),
    record({
      id: 'claude-docs',
      providerId: 'claude',
      providerLabel: 'Claude',
      projectName: 'docs',
      projectDirHash: 'sha256:docs',
      occurredAtMs: TODAY_START_MS + 2 * HOUR_MS,
      inputTokens: 20,
      outputTokens: 30,
    }),
  ];
  const sourcePage = buildUsageHistoryPageModel(
    records,
    DEFAULT_USAGE_HISTORY_PAGE_FILTERS,
    NOW_MS,
  );
  const docsProject = sourcePage.projectOptions.find((option) => option.label === 'docs')?.value;
  assert.ok(docsProject);

  const todayCodex = buildUsageHistoryPageModel(
    records,
    {
      providerId: 'codex',
      projectKey: DEFAULT_USAGE_HISTORY_PAGE_FILTERS.projectKey,
      timeWindow: 'today',
    },
    NOW_MS,
  );
  const docsOnly = buildUsageHistoryPageModel(
    records,
    {
      providerId: DEFAULT_USAGE_HISTORY_PAGE_FILTERS.providerId,
      projectKey: docsProject,
      timeWindow: DEFAULT_USAGE_HISTORY_PAGE_FILTERS.timeWindow,
    },
    NOW_MS,
  );

  assert.equal(todayCodex.filtered.filteredRecordCount, 1);
  assert.equal(todayCodex.filtered.totals.providerTokens, 100);
  assert.equal(docsOnly.filtered.filteredRecordCount, 1);
  assert.equal(docsOnly.filtered.totals.providerTokens, 50);
  assert.equal(todayCodex.hasFilters, true);
  assert.equal(usageHistoryTimeFilterLabel('last_7_days'), 'Last 7 days');
});

test('usage history page exposes no-records, all-filtered, and unavailable states', () => {
  const emptyPage = buildUsageHistoryPageModel([], DEFAULT_USAGE_HISTORY_PAGE_FILTERS, NOW_MS);
  const filteredPage = buildUsageHistoryPageModel(
    [record({ providerId: 'codex' })],
    {
      providerId: 'claude',
      projectKey: DEFAULT_USAGE_HISTORY_PAGE_FILTERS.projectKey,
      timeWindow: DEFAULT_USAGE_HISTORY_PAGE_FILTERS.timeWindow,
    },
    NOW_MS,
  );
  const unavailable = usageHistoryUnavailableMessage(true, 'EACCES: permission denied');

  assert.equal(emptyPage.filtered.emptyState?.kind, 'no_records');
  assert.equal(filteredPage.filtered.emptyState?.kind, 'all_filtered_out');
  assert.deepEqual(filteredPage.filtered.emptyState?.activeFilters, ['provider:claude']);
  assert.equal(unavailable?.title, 'Usage history unavailable');
  assert.equal(unavailable?.detail, 'EACCES: permission denied');
  assert.equal(usageHistoryUnavailableMessage(false, undefined), undefined);
});

test('usage history page exports the filtered scope with redacted paths by default', () => {
  const pageModel = buildUsageHistoryPageModel(
    [
      record({
        id: 'secret',
        projectDir: 'C:\\Users\\User\\secret-project',
        projectDirHash: 'sha256:secret',
        transcriptPath: 'C:\\Users\\User\\.Codex\\projects\\secret\\session.jsonl',
      }),
    ],
    DEFAULT_USAGE_HISTORY_PAGE_FILTERS,
    NOW_MS,
  );

  assert.equal(pageModel.exportRowCount, 1);
  assert.equal(pageModel.filtered.exportData.redacted, true);
  assert.equal(pageModel.filtered.exportData.rows[0]?.project_hash, 'sha256:secret');
  assert.equal(pageModel.filtered.exportData.rows[0]?.project_dir, '');
  assert.equal(pageModel.filtered.exportData.rows[0]?.transcript_path, '');
  assert.equal(pageModel.exportCsv.includes('secret-project'), false);
  assert.equal(pageModel.exportCsv.includes('session.jsonl'), false);
});
