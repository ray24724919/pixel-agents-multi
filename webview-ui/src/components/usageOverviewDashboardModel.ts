import {
  buildUsageHistoryModel,
  type UsageHistoryAccuracy,
  type UsageHistoryFilters,
  type UsageHistoryModel,
  type UsageHistoryRateLimitSnapshot,
  type UsageHistoryRecordV1,
} from './usageHistoryModel.js';
import type {
  UsageAccuracy,
  UsageInsightSeverity,
  UsageIntelligenceDashboard,
} from './usageIntelligenceModel.js';

export interface UsageOverviewDashboardInput {
  live: UsageIntelligenceDashboard;
  history: UsageHistoryModel;
  historyRecords?: readonly UsageHistoryRecordV1[];
  historyUnavailable?: boolean;
  historyError?: string;
  nowMs?: number;
}

export interface UsageOverviewMetric {
  id: 'live' | 'today' | 'last7' | 'accuracy';
  label: string;
  value: number | string;
  detail: string;
}

export interface UsageOverviewProviderRow {
  providerId: string;
  label: string;
  liveProviderTokens: number;
  todayDisplayTokens: number;
  last7DaysDisplayTokens: number;
  historyDisplayTokens: number;
  combinedDisplayTokens: number;
  share: number;
  accuracy: UsageAccuracy | UsageHistoryAccuracy;
  quotaSignal?: UsageOverviewQuotaSignal;
}

export interface UsageOverviewProjectRow {
  projectName: string;
  providerIds: string[];
  liveDisplayTokens: number;
  historyDisplayTokens: number;
  combinedDisplayTokens: number;
  accuracy: UsageAccuracy | UsageHistoryAccuracy;
  topAgentName?: string;
}

export interface UsageOverviewTrendBucket {
  id: string;
  label: string;
  displayTokens: number;
  total: number;
}

export interface UsageOverviewInsight {
  id: string;
  severity: UsageInsightSeverity;
  title: string;
  detail: string;
}

export interface UsageOverviewQuotaSignal {
  providerId: string;
  label: string;
  usedPercent?: number;
  remainingPercent?: number;
  resetAtMs?: number;
  resetAfterSeconds?: number;
  severity: UsageInsightSeverity;
}

export interface UsageOverviewEmptyState {
  title: string;
  detail: string;
}

export interface UsageOverviewDashboard {
  metrics: UsageOverviewMetric[];
  providerRows: UsageOverviewProviderRow[];
  projectRows: UsageOverviewProjectRow[];
  trendBuckets: UsageOverviewTrendBucket[];
  insights: UsageOverviewInsight[];
  quotaSignals: UsageOverviewQuotaSignal[];
  emptyState?: UsageOverviewEmptyState;
}

const DEFAULT_PROVIDER_ORDER = ['codex', 'claude'];
const QUOTA_WARN_USED_PERCENT = 80;
const QUOTA_ERROR_USED_PERCENT = 95;
const CONCENTRATION_WARN_SHARE = 0.6;
const CONCENTRATION_MIN_DISPLAY_TOKENS = 1_000;
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

export function buildUsageOverviewDashboard({
  live,
  history,
  historyRecords,
  historyUnavailable = false,
  historyError,
  nowMs = Date.now(),
}: UsageOverviewDashboardInput): UsageOverviewDashboard {
  const todayHistory = historyRecords
    ? buildUsageHistoryModel(historyRecords, {
        filters: buildOverviewTimeFilter('today', nowMs),
        nowMs,
      })
    : history;
  const last7DaysHistory = historyRecords
    ? buildUsageHistoryModel(historyRecords, {
        filters: buildOverviewTimeFilter('last_7_days', nowMs),
        nowMs,
      })
    : history;
  const today = history.timeWindows.find((window) => window.id === 'today');
  const last7Days = history.timeWindows.find((window) => window.id === 'last_7_days');
  const quotaSignals = buildQuotaSignals(live, history.latestRateLimits);
  const providerRows = buildProviderRows(
    live,
    history,
    todayHistory,
    last7DaysHistory,
    quotaSignals,
  );
  const projectRows = buildProjectRows(live, history);
  const trendBuckets = buildTrendBuckets(history);
  const metrics: UsageOverviewMetric[] = [
    {
      id: 'live',
      label: 'Active now',
      value: live.totals.providerTokens,
      detail: `${live.totals.meteredAgentCount} metered live agents`,
    },
    {
      id: 'today',
      label: 'Today',
      value: today?.displayTokens ?? 0,
      detail: `${today?.usageRecordCount ?? 0} local usage records`,
    },
    {
      id: 'last7',
      label: 'Last 7 days',
      value: last7Days?.displayTokens ?? 0,
      detail: `${last7Days?.recordCount ?? 0} local records`,
    },
    {
      id: 'accuracy',
      label: 'Reliability',
      value: accuracyOverviewLabel(live.totals.accuracy, history.totals.accuracy),
      detail: accuracyOverviewDetail(live, history),
    },
  ];
  const insights = buildOverviewInsights({
    live,
    history,
    historyUnavailable,
    historyError,
    providerRows,
    projectRows,
    quotaSignals,
  });
  const emptyState = buildEmptyState(live, history, historyUnavailable);

  return {
    metrics,
    providerRows,
    projectRows,
    trendBuckets,
    insights,
    quotaSignals,
    emptyState,
  };
}

function buildProviderRows(
  live: UsageIntelligenceDashboard,
  history: UsageHistoryModel,
  todayHistory: UsageHistoryModel,
  last7DaysHistory: UsageHistoryModel,
  quotaSignals: readonly UsageOverviewQuotaSignal[],
): UsageOverviewProviderRow[] {
  const providerIds = new Set<string>(DEFAULT_PROVIDER_ORDER);
  for (const provider of live.providers) providerIds.add(provider.providerId);
  for (const provider of history.providers) providerIds.add(provider.providerId);

  const rows = [...providerIds].map((providerId) => {
    const liveProvider = live.providers.find((provider) => provider.providerId === providerId);
    const historyProvider = history.providers.find(
      (provider) => provider.providerId === providerId,
    );
    const todayProviderTokens =
      todayHistory.providers.find((provider) => provider.providerId === providerId)
        ?.displayTokens ?? 0;
    const last7ProviderTokens =
      last7DaysHistory.providers.find((provider) => provider.providerId === providerId)
        ?.displayTokens ?? 0;
    const combinedDisplayTokens =
      (liveProvider?.displayTokens ?? 0) + (historyProvider?.displayTokens ?? 0);
    return {
      providerId,
      label: liveProvider?.label ?? historyProvider?.label ?? providerLabel(providerId),
      liveProviderTokens: liveProvider?.providerTokens ?? 0,
      todayDisplayTokens: todayProviderTokens,
      last7DaysDisplayTokens: last7ProviderTokens,
      historyDisplayTokens: historyProvider?.displayTokens ?? 0,
      combinedDisplayTokens,
      share: shareOf(
        combinedDisplayTokens,
        live.totals.displayTokens + history.totals.displayTokens,
      ),
      accuracy: historyProvider?.accuracy ?? liveProvider?.accuracy ?? 'none',
      quotaSignal: quotaSignals.find((signal) => signal.providerId === providerId),
    } satisfies UsageOverviewProviderRow;
  });

  return rows.sort(
    (a, b) =>
      b.combinedDisplayTokens - a.combinedDisplayTokens ||
      compareProviderIds(a.providerId, b.providerId),
  );
}

function buildProjectRows(
  live: UsageIntelligenceDashboard,
  history: UsageHistoryModel,
): UsageOverviewProjectRow[] {
  const projectNames = new Set<string>();
  for (const project of live.projects) projectNames.add(project.project);
  for (const project of history.projects) projectNames.add(project.projectName);

  return [...projectNames]
    .map((projectName) => {
      const liveProject = live.projects.find((project) => project.project === projectName);
      const historyProject = history.projects.find(
        (project) => project.projectName === projectName,
      );
      const providerIds = [
        ...(liveProject?.providerIds ?? []),
        ...(historyProject?.providerIds ?? []),
      ].filter((providerId, index, values) => values.indexOf(providerId) === index);
      return {
        projectName,
        providerIds,
        liveDisplayTokens: liveProject?.displayTokens ?? 0,
        historyDisplayTokens: historyProject?.displayTokens ?? 0,
        combinedDisplayTokens:
          (liveProject?.displayTokens ?? 0) + (historyProject?.displayTokens ?? 0),
        accuracy: historyProject?.accuracy ?? liveProject?.accuracy ?? 'none',
        topAgentName: liveProject?.topAgentName ?? historyProject?.topAgentName,
      } satisfies UsageOverviewProjectRow;
    })
    .sort(
      (a, b) =>
        b.combinedDisplayTokens - a.combinedDisplayTokens ||
        a.projectName.localeCompare(b.projectName, undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
    );
}

function buildTrendBuckets(history: UsageHistoryModel): UsageOverviewTrendBucket[] {
  const total = Math.max(...history.trends.last7Days.map((bucket) => bucket.displayTokens), 1);
  return history.trends.last7Days.map((bucket) => ({
    id: bucket.id,
    label: bucket.label.slice(5),
    displayTokens: bucket.displayTokens,
    total,
  }));
}

function buildQuotaSignals(
  live: UsageIntelligenceDashboard,
  historyRateLimits: readonly UsageHistoryRateLimitSnapshot[],
): UsageOverviewQuotaSignal[] {
  const signals: UsageOverviewQuotaSignal[] = [];
  for (const provider of live.providers) {
    const usedPercent = rateLimitUsedPercent(provider.codexRateLimit);
    if (usedPercent === undefined || usedPercent < QUOTA_WARN_USED_PERCENT) continue;
    signals.push({
      providerId: provider.providerId,
      label: provider.label,
      usedPercent,
      remainingPercent: provider.codexRateLimit?.remainingPercent,
      resetAtMs: provider.codexRateLimit?.resetAtMs,
      resetAfterSeconds: provider.codexRateLimit?.resetAfterSeconds,
      severity: usedPercent >= QUOTA_ERROR_USED_PERCENT ? 'error' : 'warning',
    });
  }

  for (const snapshot of historyRateLimits) {
    const usedPercent = rateLimitUsedPercent(snapshot);
    if (usedPercent === undefined || usedPercent < QUOTA_WARN_USED_PERCENT) continue;
    const existing = signals.find((signal) => signal.providerId === snapshot.providerId);
    if (existing && (existing.usedPercent ?? 0) >= usedPercent) continue;
    const signal = {
      providerId: snapshot.providerId,
      label: snapshot.providerLabel,
      usedPercent,
      remainingPercent: snapshot.remainingPercent,
      resetAtMs: snapshot.resetAtMs,
      resetAfterSeconds: snapshot.resetAfterSeconds,
      severity: usedPercent >= QUOTA_ERROR_USED_PERCENT ? 'error' : 'warning',
    } satisfies UsageOverviewQuotaSignal;
    if (existing) Object.assign(existing, signal);
    else signals.push(signal);
  }

  return signals.sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0));
}

function buildOverviewInsights({
  live,
  history,
  historyUnavailable,
  historyError,
  providerRows,
  projectRows,
  quotaSignals,
}: {
  live: UsageIntelligenceDashboard;
  history: UsageHistoryModel;
  historyUnavailable: boolean;
  historyError?: string;
  providerRows: readonly UsageOverviewProviderRow[];
  projectRows: readonly UsageOverviewProjectRow[];
  quotaSignals: readonly UsageOverviewQuotaSignal[];
}): UsageOverviewInsight[] {
  const insights: UsageOverviewInsight[] = [];
  const combinedDisplayTokens = live.totals.displayTokens + history.totals.displayTokens;

  if (historyUnavailable) {
    insights.push({
      id: 'history-unavailable',
      severity: 'warning',
      title: 'Persisted history unavailable',
      detail: historyError ?? 'Live usage remains visible, but local history could not be read.',
    });
  }

  const topProject = projectRows[0];
  if (
    topProject &&
    combinedDisplayTokens >= CONCENTRATION_MIN_DISPLAY_TOKENS &&
    shareOf(topProject.combinedDisplayTokens, combinedDisplayTokens) >= CONCENTRATION_WARN_SHARE
  ) {
    insights.push({
      id: 'project-concentration',
      severity: 'warning',
      title: 'Usage concentrated in one project',
      detail: `${topProject.projectName} accounts for ${Math.round(
        shareOf(topProject.combinedDisplayTokens, combinedDisplayTokens) * 100,
      )}% of combined live and historical display tokens.`,
    });
  }

  if (
    live.totals.accuracy === 'estimated' ||
    history.totals.accuracy === 'estimated' ||
    live.totals.accuracy === 'mixed' ||
    history.totals.accuracy === 'mixed'
  ) {
    insights.push({
      id: 'estimate-heavy',
      severity: 'info',
      title: 'Exact and estimated data are mixed',
      detail:
        'Use this dashboard for operational supervision; proxy estimates are not provider billing truth.',
    });
  }

  const artifactTokens = live.totals.artifactOutputTokens + history.totals.artifactOutputTokens;
  const providerTokens = live.totals.providerTokens + history.totals.providerTokens;
  if (artifactTokens > 0 && artifactTokens >= providerTokens) {
    insights.push({
      id: 'artifact-heavy',
      severity: 'info',
      title: 'Artifact estimates are prominent',
      detail:
        'Generated code or patch estimates are separated from provider tokens and proxy cost totals.',
    });
  }

  for (const signal of quotaSignals) {
    insights.push({
      id: `${signal.providerId}-quota-pressure`,
      severity: signal.severity,
      title: `${signal.label} quota pressure`,
      detail: `${Math.round(signal.usedPercent ?? 0)}% quota used in the latest local snapshot.`,
    });
  }

  if (insights.length === 0) {
    const hasUsage = providerRows.some((row) => row.combinedDisplayTokens > 0);
    insights.push({
      id: hasUsage ? 'steady' : 'no-usage',
      severity: 'info',
      title: hasUsage ? 'No unusual usage signals' : 'No usage recorded yet',
      detail: hasUsage
        ? 'Combined live and persisted local telemetry has no local warning signals.'
        : 'Start agents or wait for local Usage Store records to populate the dashboard.',
    });
  }

  return insights;
}

function buildEmptyState(
  live: UsageIntelligenceDashboard,
  history: UsageHistoryModel,
  historyUnavailable: boolean,
): UsageOverviewEmptyState | undefined {
  if (live.totals.agentCount > 0 || history.sourceRecordCount > 0 || historyUnavailable) {
    return undefined;
  }
  return {
    title: 'No usage telemetry yet',
    detail:
      'Live usage appears as agents run. Persisted local history appears after usage records are written.',
  };
}

function accuracyOverviewLabel(
  liveAccuracy: UsageAccuracy,
  historyAccuracy: UsageHistoryAccuracy,
): string {
  const combined = new Set([liveAccuracy, historyAccuracy]);
  combined.delete('none');
  if (combined.size === 0) return 'No usage yet';
  if (combined.size === 1) {
    const [value] = [...combined];
    if (value === 'exact') return 'Exact';
    if (value === 'estimated') return 'Estimated';
  }
  return 'Mixed';
}

function accuracyOverviewDetail(
  live: UsageIntelligenceDashboard,
  history: UsageHistoryModel,
): string {
  const exact = live.totals.exactCount + history.totals.exactRecordCount;
  const estimated =
    live.totals.estimatedCount +
    history.totals.estimatedRecordCount +
    history.totals.mixedRecordCount;
  return `${exact} exact / ${estimated} estimated or mixed signals`;
}

function rateLimitUsedPercent(
  snapshot: { usedPercent?: number; remainingPercent?: number } | undefined,
): number | undefined {
  if (!snapshot) return undefined;
  if (typeof snapshot.usedPercent === 'number') return snapshot.usedPercent;
  if (typeof snapshot.remainingPercent === 'number') return 100 - snapshot.remainingPercent;
  return undefined;
}

function buildOverviewTimeFilter(
  window: 'today' | 'last_7_days',
  nowMs: number,
): UsageHistoryFilters {
  const todayStart = startOfLocalDay(nowMs);
  return {
    fromMs: window === 'today' ? todayStart : todayStart - 6 * MS_PER_DAY,
    toMs: todayStart + MS_PER_DAY - 1,
  };
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function providerLabel(providerId: string): string {
  if (providerId === 'codex') return 'Codex';
  if (providerId === 'claude') return 'Claude';
  return providerId;
}

function shareOf(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}
