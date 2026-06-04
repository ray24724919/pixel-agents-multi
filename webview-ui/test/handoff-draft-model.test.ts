import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHandoffDraft,
  buildHandoffUsageSummaryFromHistoryModel,
  type HandoffUsageSummaryInput,
  sanitizeHandoffText,
} from '../src/components/handoffDraftModel.ts';
import type { TimelinePageItem } from '../src/components/timelinePageModel.ts';
import type { UsageHistoryModel } from '../src/components/usageHistoryModel.ts';

const BASE_MS = Date.UTC(2026, 0, 2, 3, 4, 5);

function item(overrides: Partial<TimelinePageItem> = {}): TimelinePageItem {
  return {
    id: 'event-1',
    agentId: 7,
    agentName: 'Codex Lead',
    providerId: 'codex',
    project: 'pixel-agents',
    timestamp: BASE_MS,
    title: 'Tool started',
    summary: 'Began safe normalized work',
    severity: 'info',
    kind: 'tool.started',
    source: 'tool',
    statusAfter: 'tool_running',
    sessionId: 'session-1',
    runId: 'run-1',
    category: 'tool',
    isActionLike: false,
    isDelegationLike: false,
    ...overrides,
  };
}

test('handoff draft generates structured markdown and metadata from timeline events', () => {
  const draft = buildHandoffDraft({
    timelineEvents: [
      item({ id: 'tool-started', timestamp: BASE_MS, kind: 'tool.started' }),
      item({
        id: 'delegation-done',
        timestamp: BASE_MS + 1000,
        title: 'Delegation completed',
        kind: 'delegation.completed',
        category: 'delegation',
        isActionLike: true,
        isDelegationLike: true,
        statusAfter: 'completed',
      }),
      item({
        id: 'run-complete',
        timestamp: BASE_MS + 2000,
        title: 'Run completed',
        summary: 'All checks are ready to review',
        kind: 'run.completed',
        category: 'run',
        statusAfter: 'completed',
      }),
    ],
  });

  assert.match(draft.markdown, /^# Handoff Draft - pixel-agents/);
  assert.match(draft.markdown, /## Scope/);
  assert.match(draft.markdown, /Project: pixel-agents/);
  assert.match(draft.markdown, /Agent: Codex Lead #7/);
  assert.match(draft.markdown, /## Important Timeline Events/);
  assert.match(draft.markdown, /Delegation completed/);
  assert.match(draft.markdown, /Run completed/);
  assert.match(draft.markdown, /## Action \/ Decision Summary/);
  assert.match(draft.markdown, /## Privacy Note/);
  assert.equal(draft.metadata.project, 'pixel-agents');
  assert.equal(draft.metadata.providerId, 'codex');
  assert.equal(draft.metadata.currentStatus, 'completed');
  assert.equal(draft.metadata.eventCount, 3);
  assert.deepEqual(draft.metadata.importantEventIds, ['delegation-done', 'run-complete']);
});

test('handoff draft handles empty timeline input with safe placeholders', () => {
  const draft = buildHandoffDraft({});

  assert.match(draft.markdown, /^# Handoff Draft - Unknown project/);
  assert.match(draft.markdown, /No timeline events were supplied/);
  assert.match(draft.markdown, /Provider: unknown/);
  assert.match(draft.markdown, /Time window: Not supplied/);
  assert.equal(draft.metadata.eventCount, 0);
  assert.equal(draft.metadata.includedEventCount, 0);
  assert.equal(draft.metadata.currentStatus, 'unknown');
});

test('handoff draft includes supplied usage summary with cache and reasoning fields', () => {
  const usageSummary: HandoffUsageSummaryInput = {
    recordCount: 5,
    usageRecordCount: 4,
    providerLabel: 'Codex',
    modelLabel: 'gpt-5',
    displayTokens: 4321,
    providerTokens: 4000,
    inputTokens: 1800,
    outputTokens: 900,
    cacheReadTokens: 700,
    cacheWriteTokens: 50,
    reasoningOutputTokens: 550,
    artifactOutputTokens: 321,
    accuracyLabel: 'Mixed exact/estimated',
    apiProxyEstimateUsd: 0.1234,
    rateLimitSummary: 'Codex primary: 42% used',
  };

  const draft = buildHandoffDraft({
    timelineEvents: [item({ kind: 'run.completed', category: 'run', statusAfter: 'completed' })],
    usageSummary,
  });

  assert.match(draft.markdown, /## Usage Summary/);
  assert.match(draft.markdown, /Records: 5 total \/ 4 usage records/);
  assert.match(draft.markdown, /Tokens: 4,321 display, 4,000 provider, 1,800 input, 900 output/);
  assert.match(draft.markdown, /700 cache read, 50 cache write, 550 reasoning output/);
  assert.match(draft.markdown, /Artifact estimate: 321 tokens/);
  assert.match(draft.markdown, /API proxy estimate: \$0\.1234/);
  assert.match(draft.markdown, /Not actual subscription billing/);
  assert.equal(draft.metadata.hasUsageSummary, true);
});

test('handoff usage helper maps usage history model totals into a safe summary', () => {
  const summary = buildHandoffUsageSummaryFromHistoryModel({
    totals: {
      recordCount: 2,
      usageRecordCount: 2,
      displayTokens: 1000,
      providerTokens: 900,
      inputTokens: 400,
      outputTokens: 300,
      cacheReadTokens: 100,
      cacheWriteTokens: 25,
      reasoningOutputTokens: 75,
      artifactOutputTokens: 100,
      apiProxyEstimateUsd: 0.03,
      accuracy: 'mixed',
    },
    providers: [{ label: 'Codex' }],
    models: [{ label: 'gpt-5' }],
    latestRateLimits: [
      {
        providerId: 'codex',
        providerLabel: 'Codex',
        recordId: 'rate-1',
        capturedAtMs: BASE_MS,
        name: 'primary',
        usedPercent: 42,
        resetAtMs: BASE_MS + 1000,
        source: 'provider_exact',
      },
    ],
  } as UsageHistoryModel);

  assert.equal(summary.providerLabel, 'Codex');
  assert.equal(summary.modelLabel, 'gpt-5');
  assert.equal(summary.accuracyLabel, 'Mixed exact/estimated');
  assert.equal(
    summary.rateLimitSummary,
    'Codex primary: 42% used, resets 2026-01-02T03:04:06.000Z',
  );
});

test('handoff draft redacts absolute local paths from all visible identity and event fields', () => {
  const windowsPath = 'C:\\Users\\User\\Documents\\raychen\\pixel-agents-multi\\session.jsonl';
  const namespacedPath =
    '\\\\?\\C:\\Users\\User\\Documents\\raychen\\pixel-agents-multi\\trace.jsonl';
  const posixPath = '/Users/user/private/pixel-agents/session.jsonl';
  const draft = buildHandoffDraft({
    project: windowsPath,
    sessionId: namespacedPath,
    timelineEvents: [
      item({
        title: `Read ${posixPath}`,
        summary: `Transcript was stored at ${windowsPath}`,
      }),
    ],
  });

  assert.doesNotMatch(draft.markdown, /C:\\Users\\User/);
  assert.doesNotMatch(draft.markdown, /\\\\\?\\C:\\Users\\User/);
  assert.doesNotMatch(draft.markdown, /\/Users\/user\/private/);
  assert.match(draft.markdown, /\[redacted path\]/);
  assert.equal(draft.metadata.project, '[redacted path]');
  assert.equal(draft.metadata.sessionId, '[redacted path]');
});

test('handoff draft redacts unsafe-looking raw prompts tool output and credentials', () => {
  const draft = buildHandoffDraft({
    agentName: 'Lead OPENAI_API_KEY=sk-secret',
    timelineEvents: [
      item({
        title: 'Raw prompt: ship the hidden customer details',
        summary: 'tool output: Authorization: Bearer private-token and stdout: hidden output',
      }),
    ],
  });

  assert.doesNotMatch(draft.markdown, /ship the hidden customer details/);
  assert.doesNotMatch(draft.markdown, /private-token/);
  assert.doesNotMatch(draft.markdown, /hidden output/);
  assert.doesNotMatch(draft.markdown, /sk-secret/);
  assert.match(draft.markdown, /\[redacted content\]/);
  assert.match(draft.markdown, /\[redacted secret\]/);
  assert.equal(sanitizeHandoffText('ANTHROPIC_API_KEY=secret-value'), '[redacted secret]');
});
