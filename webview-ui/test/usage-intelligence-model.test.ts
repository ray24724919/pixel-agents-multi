import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUsageIntelligenceDashboard,
  usageAccuracyLabel,
  type UsageIntelligenceAgent,
} from '../src/components/usageIntelligenceModel.ts';

function agent(overrides: Partial<UsageIntelligenceAgent>): UsageIntelligenceAgent {
  return {
    id: 1,
    name: 'Agent One',
    providerId: 'codex',
    project: 'repo',
    status: 'waiting',
    inputTokens: 0,
    outputTokens: 0,
    artifactOutputTokens: 0,
    tokenUsageEstimated: false,
    ...overrides,
  };
}

test('usage intelligence aggregates provider totals, category detail, and accuracy', () => {
  const dashboard = buildUsageIntelligenceDashboard([
    agent({
      id: 1,
      providerId: 'codex',
      inputTokens: 1_000,
      outputTokens: 2_000,
      artifactOutputTokens: 300,
      tokenUsageDetails: {
        input: 850,
        output: 1_600,
        reasoningOutput: 400,
        cacheRead: 100,
        cacheWrite: 50,
        artifactEstimate: 300,
        estimated: false,
      },
    }),
    agent({
      id: 2,
      providerId: 'claude',
      inputTokens: 500,
      outputTokens: 100,
      tokenUsageEstimated: true,
      tokenUsageDetails: {
        input: 500,
        output: 100,
        reasoningOutput: 0,
        cacheRead: 0,
        cacheWrite: 0,
        artifactEstimate: 0,
        estimated: true,
      },
    }),
  ]);

  assert.equal(dashboard.totals.providerTokens, 3_600);
  assert.equal(dashboard.totals.displayTokens, 3_900);
  assert.equal(dashboard.totals.artifactOutputTokens, 300);
  assert.equal(dashboard.totals.cacheTokens, 150);
  assert.equal(dashboard.totals.reasoningTokens, 400);
  assert.equal(dashboard.totals.exactCount, 1);
  assert.equal(dashboard.totals.estimatedCount, 1);
  assert.equal(dashboard.totals.accuracy, 'mixed');
  assert.equal(usageAccuracyLabel(dashboard.totals.accuracy), 'Mixed exact/estimated');
  assert.equal(dashboard.categories.find((item) => item.id === 'artifact')?.value, 300);
});

test('usage intelligence ranks projects and ledger rows by display tokens', () => {
  const dashboard = buildUsageIntelligenceDashboard([
    agent({
      id: 1,
      name: 'Small helper',
      providerId: 'claude',
      project: 'alpha',
      inputTokens: 100,
      outputTokens: 100,
      artifactOutputTokens: 0,
      updatedAt: 20,
    }),
    agent({
      id: 2,
      name: 'Large worker',
      providerId: 'codex',
      project: 'beta',
      inputTokens: 1_000,
      outputTokens: 1_000,
      artifactOutputTokens: 500,
      updatedAt: 10,
    }),
    agent({
      id: 3,
      name: 'Beta reviewer',
      providerId: 'claude',
      project: 'beta',
      inputTokens: 400,
      outputTokens: 100,
      artifactOutputTokens: 0,
      updatedAt: 30,
    }),
  ]);

  assert.deepEqual(
    dashboard.ledgerRows.map((row) => row.id),
    [2, 3, 1],
  );
  assert.deepEqual(
    dashboard.projects.map((project) => project.project),
    ['beta', 'alpha'],
  );
  assert.equal(dashboard.projects[0]?.topAgentName, 'Large worker');
  assert.deepEqual(dashboard.projects[0]?.providerIds, ['codex', 'claude']);
});

test('usage intelligence emits local live signals for concentration, reasoning, and quota', () => {
  const dashboard = buildUsageIntelligenceDashboard([
    agent({
      id: 1,
      name: 'Main worker',
      providerId: 'codex',
      inputTokens: 5_000,
      outputTokens: 5_000,
      tokenUsageDetails: {
        input: 5_000,
        output: 2_000,
        reasoningOutput: 3_000,
        cacheRead: 0,
        cacheWrite: 0,
        artifactEstimate: 0,
        estimated: false,
      },
      codexRateLimit: { name: 'primary', usedPercent: 96 },
    }),
    agent({
      id: 2,
      name: 'Small helper',
      providerId: 'claude',
      inputTokens: 250,
      outputTokens: 250,
    }),
  ]);

  const insightIds = dashboard.insights.map((insight) => insight.id);
  assert.equal(insightIds.includes('top-agent-concentration'), true);
  assert.equal(insightIds.includes('reasoning-heavy'), true);
  assert.equal(insightIds.includes('codex-rate-limit'), true);
  assert.equal(
    dashboard.insights.find((insight) => insight.id === 'codex-rate-limit')?.severity,
    'error',
  );
});

test('usage intelligence keeps useful empty and zero-usage states', () => {
  const empty = buildUsageIntelligenceDashboard([]);
  assert.equal(empty.totals.accuracy, 'none');
  assert.deepEqual(
    empty.providers.map((provider) => provider.providerId),
    ['codex', 'claude'],
  );
  assert.equal(empty.insights[0]?.id, 'no-agents');

  const zero = buildUsageIntelligenceDashboard([agent({ id: 3, providerId: 'claude' })]);
  assert.equal(zero.totals.agentCount, 1);
  assert.equal(zero.totals.meteredAgentCount, 0);
  assert.equal(zero.totals.accuracy, 'none');
  assert.equal(zero.insights[0]?.id, 'no-usage');
});
