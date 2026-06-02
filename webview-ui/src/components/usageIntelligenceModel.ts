import type { TokenRateLimitSnapshot, TokenUsageDetails } from '../office/types.js';

export type UsageAccuracy = 'none' | 'exact' | 'estimated' | 'mixed';
export type UsageInsightSeverity = 'info' | 'warning' | 'error';

export interface UsageIntelligenceAgent {
  id: number;
  name: string;
  providerId: string;
  project: string;
  projectDir?: string;
  status: string;
  teamName?: string;
  roleName?: string;
  sessionId?: string;
  updatedAt?: number;
  inputTokens: number;
  outputTokens: number;
  artifactOutputTokens: number;
  tokenUsageEstimated: boolean;
  tokenUsageDetails?: TokenUsageDetails;
  codexRateLimit?: TokenRateLimitSnapshot;
}

export interface UsageTotals {
  agentCount: number;
  meteredAgentCount: number;
  inputTokens: number;
  outputTokens: number;
  providerTokens: number;
  artifactOutputTokens: number;
  displayTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheTokens: number;
  reasoningTokens: number;
  exactCount: number;
  estimatedCount: number;
  accuracy: UsageAccuracy;
}

export interface UsageProviderSummary extends UsageTotals {
  providerId: string;
  label: string;
  share: number;
  codexRateLimit?: TokenRateLimitSnapshot;
}

export interface UsageProjectSummary extends UsageTotals {
  project: string;
  projectDir?: string;
  providerIds: string[];
  topAgentName?: string;
  topAgentTokens: number;
  updatedAt?: number;
}

export interface UsageLedgerRow {
  id: number;
  name: string;
  providerId: string;
  project: string;
  teamName?: string;
  roleName?: string;
  sessionId?: string;
  status: string;
  updatedAt?: number;
  inputTokens: number;
  outputTokens: number;
  providerTokens: number;
  artifactOutputTokens: number;
  displayTokens: number;
  cacheTokens: number;
  reasoningTokens: number;
  accuracy: UsageAccuracy;
}

export interface UsageCategorySummary {
  id: 'input' | 'output' | 'cache' | 'reasoning' | 'artifact';
  label: string;
  value: number;
  total: number;
  detail: string;
  tone: 'provider' | 'detail' | 'artifact';
}

export interface UsageInsight {
  id: string;
  severity: UsageInsightSeverity;
  title: string;
  detail: string;
}

export interface UsageIntelligenceDashboard {
  totals: UsageTotals;
  providers: UsageProviderSummary[];
  projects: UsageProjectSummary[];
  ledgerRows: UsageLedgerRow[];
  categories: UsageCategorySummary[];
  insights: UsageInsight[];
}

const DEFAULT_PROVIDER_ORDER = ['codex', 'claude'];
const RATE_LIMIT_WARN_USED_PERCENT = 80;
const RATE_LIMIT_ERROR_USED_PERCENT = 95;
const TOP_AGENT_SHARE_WARN = 0.6;
const TOP_AGENT_MIN_PROVIDER_TOKENS = 1_000;
const REASONING_SHARE_WARN = 0.35;

export function buildUsageIntelligenceDashboard(
  agents: readonly UsageIntelligenceAgent[],
): UsageIntelligenceDashboard {
  const totals = createUsageTotals();
  const providers = new Map<string, UsageProviderSummary>();
  const projects = new Map<string, UsageProjectSummary>();
  const ledgerRows: UsageLedgerRow[] = [];

  for (const providerId of DEFAULT_PROVIDER_ORDER) {
    providers.set(providerId, createProviderSummary(providerId));
  }

  for (const agent of agents) {
    const agentTotals = getAgentUsageTotals(agent);
    const ledgerRow = createLedgerRow(agent, agentTotals);
    ledgerRows.push(ledgerRow);
    addUsageTotals(totals, agentTotals);

    const provider = providers.get(agent.providerId) ?? createProviderSummary(agent.providerId);
    addUsageTotals(provider, agentTotals);
    provider.agentCount += 1;
    if (agent.codexRateLimit) provider.codexRateLimit = agent.codexRateLimit;
    providers.set(agent.providerId, provider);

    const project = projects.get(agent.project) ?? createProjectSummary(agent);
    addUsageTotals(project, agentTotals);
    project.agentCount += 1;
    if (!project.projectDir && agent.projectDir) project.projectDir = agent.projectDir;
    if (!project.providerIds.includes(agent.providerId)) project.providerIds.push(agent.providerId);
    if (ledgerRow.displayTokens > project.topAgentTokens) {
      project.topAgentName = agent.name;
      project.topAgentTokens = ledgerRow.displayTokens;
    }
    if (agent.updatedAt !== undefined) {
      project.updatedAt = Math.max(project.updatedAt ?? 0, agent.updatedAt);
    }
    projects.set(agent.project, project);
  }

  totals.agentCount = agents.length;
  finalizeUsageTotals(totals);

  const providerSummaries = [...providers.values()]
    .map((provider) => {
      finalizeUsageTotals(provider);
      return { ...provider, share: shareOf(provider.providerTokens, totals.providerTokens) };
    })
    .sort(compareProviders);

  const projectSummaries = [...projects.values()]
    .map((project) => {
      finalizeUsageTotals(project);
      project.providerIds.sort(compareProviderIds);
      return project;
    })
    .sort((a, b) => b.displayTokens - a.displayTokens || compareText(a.project, b.project));

  ledgerRows.sort(
    (a, b) =>
      b.displayTokens - a.displayTokens ||
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0) ||
      compareText(a.name, b.name),
  );

  return {
    totals,
    providers: providerSummaries,
    projects: projectSummaries,
    ledgerRows,
    categories: buildCategorySummaries(totals),
    insights: buildUsageInsights(totals, providerSummaries, ledgerRows),
  };
}

export function usageAccuracyLabel(accuracy: UsageAccuracy): string {
  if (accuracy === 'exact') return 'Exact provider-reported';
  if (accuracy === 'estimated') return 'Estimated only';
  if (accuracy === 'mixed') return 'Mixed exact/estimated';
  return 'No usage yet';
}

function createUsageTotals(): UsageTotals {
  return {
    agentCount: 0,
    meteredAgentCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    providerTokens: 0,
    artifactOutputTokens: 0,
    displayTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheTokens: 0,
    reasoningTokens: 0,
    exactCount: 0,
    estimatedCount: 0,
    accuracy: 'none',
  };
}

function createProviderSummary(providerId: string): UsageProviderSummary {
  return {
    ...createUsageTotals(),
    providerId,
    label: providerLabel(providerId),
    share: 0,
  };
}

function createProjectSummary(agent: UsageIntelligenceAgent): UsageProjectSummary {
  return {
    ...createUsageTotals(),
    project: agent.project,
    projectDir: agent.projectDir,
    providerIds: [],
    topAgentTokens: 0,
    updatedAt: agent.updatedAt,
  };
}

function getAgentUsageTotals(agent: UsageIntelligenceAgent): UsageTotals {
  const totals = createUsageTotals();
  totals.agentCount = 1;
  totals.inputTokens = agent.inputTokens;
  totals.outputTokens = agent.outputTokens;
  totals.providerTokens = agent.inputTokens + agent.outputTokens;
  totals.artifactOutputTokens = agent.artifactOutputTokens;
  totals.displayTokens = totals.providerTokens + totals.artifactOutputTokens;
  totals.cacheReadTokens = agent.tokenUsageDetails?.cacheRead ?? 0;
  totals.cacheWriteTokens = agent.tokenUsageDetails?.cacheWrite ?? 0;
  totals.cacheTokens = totals.cacheReadTokens + totals.cacheWriteTokens;
  totals.reasoningTokens = agent.tokenUsageDetails?.reasoningOutput ?? 0;
  if (totals.displayTokens > 0) {
    totals.meteredAgentCount = 1;
    if (agent.tokenUsageEstimated || agent.tokenUsageDetails?.estimated === true) {
      totals.estimatedCount = 1;
    } else {
      totals.exactCount = 1;
    }
  }
  finalizeUsageTotals(totals);
  return totals;
}

function createLedgerRow(agent: UsageIntelligenceAgent, totals: UsageTotals): UsageLedgerRow {
  return {
    id: agent.id,
    name: agent.name,
    providerId: agent.providerId,
    project: agent.project,
    teamName: agent.teamName,
    roleName: agent.roleName,
    sessionId: agent.sessionId,
    status: agent.status,
    updatedAt: agent.updatedAt,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    providerTokens: totals.providerTokens,
    artifactOutputTokens: totals.artifactOutputTokens,
    displayTokens: totals.displayTokens,
    cacheTokens: totals.cacheTokens,
    reasoningTokens: totals.reasoningTokens,
    accuracy: totals.accuracy,
  };
}

function addUsageTotals(target: UsageTotals, source: UsageTotals): void {
  target.meteredAgentCount += source.meteredAgentCount;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.providerTokens += source.providerTokens;
  target.artifactOutputTokens += source.artifactOutputTokens;
  target.displayTokens += source.displayTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.cacheTokens += source.cacheTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.exactCount += source.exactCount;
  target.estimatedCount += source.estimatedCount;
}

function finalizeUsageTotals(totals: UsageTotals): void {
  totals.accuracy = getUsageAccuracy(totals.exactCount, totals.estimatedCount);
}

function getUsageAccuracy(exactCount: number, estimatedCount: number): UsageAccuracy {
  if (exactCount === 0 && estimatedCount === 0) return 'none';
  if (exactCount > 0 && estimatedCount > 0) return 'mixed';
  if (estimatedCount > 0) return 'estimated';
  return 'exact';
}

function buildCategorySummaries(totals: UsageTotals): UsageCategorySummary[] {
  const providerTotal = Math.max(totals.providerTokens, 1);
  return [
    {
      id: 'input',
      label: 'Input',
      value: totals.inputTokens,
      total: providerTotal,
      detail: 'Provider input total, including split cache when supplied.',
      tone: 'provider',
    },
    {
      id: 'output',
      label: 'Output',
      value: totals.outputTokens,
      total: providerTotal,
      detail: 'Provider output total, including reasoning when supplied.',
      tone: 'provider',
    },
    {
      id: 'cache',
      label: 'Cache',
      value: totals.cacheTokens,
      total: Math.max(totals.inputTokens, totals.cacheTokens, 1),
      detail: 'Cache read/write detail from provider metadata.',
      tone: 'detail',
    },
    {
      id: 'reasoning',
      label: 'Reasoning',
      value: totals.reasoningTokens,
      total: Math.max(totals.outputTokens, totals.reasoningTokens, 1),
      detail: 'Reasoning output detail from provider metadata.',
      tone: 'detail',
    },
    {
      id: 'artifact',
      label: 'Artifact est.',
      value: totals.artifactOutputTokens,
      total: Math.max(totals.displayTokens, 1),
      detail: 'Generated code or patch estimate; not priced in the API proxy.',
      tone: 'artifact',
    },
  ];
}

function buildUsageInsights(
  totals: UsageTotals,
  providers: UsageProviderSummary[],
  ledgerRows: UsageLedgerRow[],
): UsageInsight[] {
  const insights: UsageInsight[] = [];

  if (totals.agentCount === 0) {
    insights.push({
      id: 'no-agents',
      severity: 'info',
      title: 'No live agents in scope',
      detail: 'Usage appears after an agent starts, is restored, or hidden agents are shown.',
    });
    return insights;
  }

  if (totals.displayTokens === 0) {
    insights.push({
      id: 'no-usage',
      severity: 'info',
      title: 'No usage recorded yet',
      detail: 'Provider rows stay visible, but no live session has reported tokens in this view.',
    });
    return insights;
  }

  if (totals.accuracy === 'estimated') {
    insights.push({
      id: 'estimated-only',
      severity: 'warning',
      title: 'Estimated-only usage',
      detail: 'All metered live agents in this scope are using transcript-derived estimates.',
    });
  } else if (totals.accuracy === 'mixed') {
    insights.push({
      id: 'mixed-accuracy',
      severity: 'info',
      title: 'Mixed exact and estimated usage',
      detail: `${totals.exactCount} exact and ${totals.estimatedCount} estimated metered agents are included.`,
    });
  }

  const topAgent = ledgerRows[0];
  if (
    topAgent &&
    ledgerRows.length > 1 &&
    totals.providerTokens >= TOP_AGENT_MIN_PROVIDER_TOKENS &&
    shareOf(topAgent.providerTokens, totals.providerTokens) >= TOP_AGENT_SHARE_WARN
  ) {
    insights.push({
      id: 'top-agent-concentration',
      severity: 'warning',
      title: 'Usage concentrated in one agent',
      detail: `${topAgent.name} accounts for ${Math.round(
        shareOf(topAgent.providerTokens, totals.providerTokens) * 100,
      )}% of provider tokens in the live scope.`,
    });
  }

  if (
    totals.reasoningTokens > 0 &&
    shareOf(totals.reasoningTokens, totals.outputTokens) >= REASONING_SHARE_WARN
  ) {
    insights.push({
      id: 'reasoning-heavy',
      severity: 'info',
      title: 'Reasoning-heavy output',
      detail: `${Math.round(
        shareOf(totals.reasoningTokens, totals.outputTokens) * 100,
      )}% of output detail is reasoning tokens.`,
    });
  }

  if (totals.artifactOutputTokens > totals.providerTokens && totals.artifactOutputTokens > 0) {
    insights.push({
      id: 'artifact-heavy',
      severity: 'info',
      title: 'Artifact estimate dominates the view',
      detail:
        'Generated code or patch estimates exceed provider token totals; they remain separate from proxy cost.',
    });
  }

  for (const provider of providers) {
    const rateLimitInsight = getRateLimitInsight(provider);
    if (rateLimitInsight) insights.push(rateLimitInsight);
  }

  if (insights.length === 0) {
    insights.push({
      id: 'usage-steady',
      severity: 'info',
      title: 'No unusual live usage signals',
      detail: 'The current live scope has token data and no local threshold-style warnings.',
    });
  }

  return insights;
}

function getRateLimitInsight(provider: UsageProviderSummary): UsageInsight | undefined {
  if (!provider.codexRateLimit) return undefined;
  const usedPercent =
    provider.codexRateLimit.usedPercent ??
    (provider.codexRateLimit.remainingPercent !== undefined
      ? 100 - provider.codexRateLimit.remainingPercent
      : undefined);
  if (usedPercent === undefined || usedPercent < RATE_LIMIT_WARN_USED_PERCENT) return undefined;
  const severity: UsageInsightSeverity =
    usedPercent >= RATE_LIMIT_ERROR_USED_PERCENT ? 'error' : 'warning';
  return {
    id: `${provider.providerId}-rate-limit`,
    severity,
    title: `${provider.label} quota signal`,
    detail: `${Math.round(usedPercent)}% quota used in the latest live snapshot.`,
  };
}

function compareProviders(a: UsageProviderSummary, b: UsageProviderSummary): number {
  const providerOrder = compareProviderIds(a.providerId, b.providerId);
  if (providerOrder !== 0) return providerOrder;
  return b.providerTokens - a.providerTokens;
}

function compareProviderIds(a: string, b: string): number {
  const aIndex = DEFAULT_PROVIDER_ORDER.indexOf(a);
  const bIndex = DEFAULT_PROVIDER_ORDER.indexOf(b);
  if (aIndex !== -1 || bIndex !== -1) {
    return (
      (aIndex === -1 ? DEFAULT_PROVIDER_ORDER.length : aIndex) -
      (bIndex === -1 ? DEFAULT_PROVIDER_ORDER.length : bIndex)
    );
  }
  return compareText(a, b);
}

function compareText(a: string | undefined, b: string | undefined): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base', numeric: true });
}

function providerLabel(providerId: string): string {
  if (providerId === 'codex') return 'Codex';
  if (providerId === 'claude') return 'Claude';
  return providerId;
}

function shareOf(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}
