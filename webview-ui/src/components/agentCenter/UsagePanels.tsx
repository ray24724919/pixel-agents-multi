import { useMemo, useState } from 'react';

import type { UsageHistoryState } from '../../hooks/useExtensionMessages.js';
import type { OfficeState } from '../../office/engine/officeState.js';
import { vscode } from '../../vscodeApi.js';
import { TokenCostSummary } from '../TokenCostSummary.js';
import { Button } from '../ui/Button.js';
import {
  usageHistoryAccuracyLabel,
  type UsageHistoryRateLimitSnapshot,
} from '../usageHistoryModel.js';
import {
  buildUsageHistoryPageModel,
  DEFAULT_USAGE_HISTORY_PAGE_FILTERS,
  type UsageHistoryPageFilters,
  type UsageHistoryPageModel,
  type UsageHistoryPageOption,
  type UsageHistoryTimeFilter,
  usageHistoryTimeFilterLabel,
  usageHistoryUnavailableMessage,
} from '../usageHistoryPageModel.js';
import {
  buildUsageIntelligenceDashboard,
  type UsageAccuracy,
  usageAccuracyLabel,
  type UsageCategorySummary,
  type UsageInsight,
} from '../usageIntelligenceModel.js';
import {
  buildUsageOverviewDashboard,
  type UsageOverviewDashboard as UsageOverviewDashboardModel,
  type UsageOverviewInsight,
  type UsageOverviewProjectRow,
  type UsageOverviewProviderRow,
  type UsageOverviewTrendBucket,
} from '../usageOverviewDashboardModel.js';
import {
  compactNumber,
  copyTextToClipboard,
  formatProxyUsd,
  formatRateLimit,
  formatRelative,
  formatUsageOverviewMetricValue,
  rateLimitResetText,
  usageAccuracyClass,
  usageAccuracyShort,
  usageBarPercent,
  usageInsightClass,
  usageInsightDotClass,
} from './formatters.js';
import { ProviderBadge } from './ProviderBadge.js';
import { SectionHeader } from './SectionHeader.js';
import { SegmentedButtons } from './SegmentedButtons.js';
import type { AgentSummary, UsagePane } from './types.js';

export function UsageDashboard({
  agents,
  visibleAgentIds,
  officeState,
  usageHistory,
}: {
  agents: AgentSummary[];
  visibleAgentIds: number[];
  officeState: OfficeState;
  usageHistory: UsageHistoryState;
}) {
  const [usagePane, setUsagePane] = useState<UsagePane>('overview');
  const [historyProviderFilter, setHistoryProviderFilter] = useState<'all' | string>(
    DEFAULT_USAGE_HISTORY_PAGE_FILTERS.providerId,
  );
  const [historyProjectFilter, setHistoryProjectFilter] = useState<'all' | string>(
    DEFAULT_USAGE_HISTORY_PAGE_FILTERS.projectKey,
  );
  const [historyTimeFilter, setHistoryTimeFilter] = useState<UsageHistoryTimeFilter>(
    DEFAULT_USAGE_HISTORY_PAGE_FILTERS.timeWindow,
  );
  const [historyCopyStatus, setHistoryCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const dashboard = buildUsageIntelligenceDashboard(agents);
  const { totals } = dashboard;
  const activeRows = dashboard.ledgerRows.filter((agent) => agent.displayTokens > 0);
  const hasAgents = totals.agentCount > 0;
  const usageHistoryStatus = usageHistoryStatusText(usageHistory);
  const historyFilters = useMemo<UsageHistoryPageFilters>(
    () => ({
      providerId: historyProviderFilter,
      projectKey: historyProjectFilter,
      timeWindow: historyTimeFilter,
    }),
    [historyProjectFilter, historyProviderFilter, historyTimeFilter],
  );
  const historyPageModel = useMemo(
    () => buildUsageHistoryPageModel(usageHistory.records, historyFilters),
    [historyFilters, usageHistory.records],
  );
  const overviewDashboard = buildUsageOverviewDashboard({
    live: dashboard,
    history: historyPageModel.source,
    historyRecords: usageHistory.records,
    historyUnavailable: usageHistory.unavailable,
    historyError: usageHistory.error,
  });
  const clearHistoryFilters = () => {
    setHistoryProviderFilter(DEFAULT_USAGE_HISTORY_PAGE_FILTERS.providerId);
    setHistoryProjectFilter(DEFAULT_USAGE_HISTORY_PAGE_FILTERS.projectKey);
    setHistoryTimeFilter(DEFAULT_USAGE_HISTORY_PAGE_FILTERS.timeWindow);
  };
  const copyHistoryCsv = () => {
    if (historyPageModel.exportRowCount === 0) return;
    void copyTextToClipboard(historyPageModel.exportCsv)
      .then(() => setHistoryCopyStatus('copied'))
      .catch(() => setHistoryCopyStatus('failed'));
  };

  return (
    <div className="grid gap-4">
      <section className="border border-border bg-bg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm uppercase tracking-wide text-accent-bright">
              Usage Intelligence
            </div>
            <div className="mt-1 text-xs text-text-muted">
              {hasAgents
                ? `${totals.agentCount} visible agents / ${totals.meteredAgentCount} with usage`
                : 'No visible agents are currently available for usage tracking'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-wide text-text-muted">
            <span className="border border-border bg-btn-bg px-2 py-1">
              {usagePane === 'overview'
                ? 'Operational overview'
                : usagePane === 'live'
                  ? 'Live session usage'
                  : 'Persisted local history'}
            </span>
            <span className="border border-border bg-btn-bg px-2 py-1">Local only</span>
            <span className="border border-border bg-btn-bg px-2 py-1" title={usageHistory.error}>
              {usageHistoryStatus}
            </span>
            <span className="border border-border bg-btn-bg px-2 py-1">Proxy estimate only</span>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 border border-border bg-btn-bg p-3">
        <SegmentedButtons
          values={['overview', 'live', 'history'] as const}
          active={usagePane}
          label={(value) =>
            value === 'overview' ? 'Overview' : value === 'live' ? 'Live' : 'History'
          }
          onChange={setUsagePane}
        />
        <div className="text-xs uppercase tracking-wide text-text-muted">
          {usagePane === 'overview'
            ? 'Live agents + persisted local history'
            : usagePane === 'live'
              ? 'Current visible agents'
              : 'Persisted local records / redacted export'}
        </div>
      </section>

      {usagePane === 'overview' ? (
        <UsageOverviewDashboard dashboard={overviewDashboard} />
      ) : usagePane === 'live' ? (
        <>
          {!hasAgents && (
            <section className="border border-border bg-btn-bg p-8 text-center">
              <div className="text-lg text-accent-bright">No usage to show yet</div>
              <div className="mt-2 text-sm text-text-muted">
                Start or restore an agent, enable Show hidden if needed, then press Refresh.
              </div>
            </section>
          )}

          <TokenCostSummary agents={visibleAgentIds} officeState={officeState} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <UsageMetric
              label="Provider tokens"
              value={compactNumber(totals.providerTokens)}
              detail={`${compactNumber(totals.inputTokens)} in / ${compactNumber(
                totals.outputTokens,
              )} out`}
            />
            <UsageMetric
              label="Accuracy"
              value={usageAccuracyShort(totals.accuracy)}
              detail={`${totals.exactCount} exact / ${totals.estimatedCount} estimated`}
            />
            <UsageMetric
              label="Reasoning"
              value={compactNumber(totals.reasoningTokens)}
              detail={`${compactNumber(totals.cacheTokens)} cache detail`}
            />
            <UsageMetric
              label="Artifact est."
              value={compactNumber(totals.artifactOutputTokens)}
              detail="separate from proxy total"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <UsageCategoryPanel categories={dashboard.categories} />
            <UsageInsightPanel insights={dashboard.insights} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="border border-border bg-bg">
              <SectionHeader title="Provider Usage" subtitle="Token mix and quota signals" />
              <div className="divide-y divide-border">
                {dashboard.providers.map((provider) => (
                  <div key={provider.providerId} className="p-4">
                    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <ProviderBadge providerId={provider.providerId} />
                          <span className="truncate text-sm text-text">{provider.label}</span>
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          {provider.agentCount} agents / {compactNumber(provider.providerTokens)}{' '}
                          tokens
                        </div>
                      </div>
                      <UsageAccuracyPill accuracy={provider.accuracy} />
                    </div>
                    <UsageBar
                      label="Input"
                      value={provider.inputTokens}
                      total={Math.max(provider.providerTokens, 1)}
                    />
                    <UsageBar
                      label="Output"
                      value={provider.outputTokens}
                      total={Math.max(provider.providerTokens, 1)}
                    />
                    {provider.cacheTokens > 0 && (
                      <UsageBar
                        label="Cache"
                        value={provider.cacheTokens}
                        total={Math.max(provider.inputTokens + provider.cacheTokens, 1)}
                      />
                    )}
                    {provider.reasoningTokens > 0 && (
                      <UsageBar
                        label="Reasoning"
                        value={provider.reasoningTokens}
                        total={Math.max(provider.outputTokens, provider.reasoningTokens, 1)}
                      />
                    )}
                    {provider.artifactOutputTokens > 0 && (
                      <UsageBar
                        label="Artifact est."
                        value={provider.artifactOutputTokens}
                        total={Math.max(provider.displayTokens, 1)}
                      />
                    )}
                    {provider.codexRateLimit && (
                      <div className="mt-3 text-xs text-text-muted">
                        {formatRateLimit(provider.codexRateLimit)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-border bg-bg">
              <SectionHeader
                title="Project Usage"
                subtitle="Where current agents are spending tokens"
              />
              <div className="divide-y divide-border">
                {dashboard.projects.length === 0 ? (
                  <div className="p-4 text-sm text-text-muted">No token usage yet</div>
                ) : (
                  dashboard.projects.slice(0, 8).map((project) => (
                    <div key={project.project} className="p-4">
                      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-accent-bright">
                            {project.project}
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {project.agentCount} agents / {compactNumber(project.providerTokens)}{' '}
                            tokens
                          </div>
                        </div>
                        <UsageAccuracyPill accuracy={project.accuracy} />
                      </div>
                      <div className="mb-2 flex min-w-0 flex-wrap gap-2 text-xs text-text-muted">
                        {project.providerIds.map((providerId) => (
                          <ProviderBadge key={providerId} providerId={providerId} />
                        ))}
                        {project.topAgentName && (
                          <span className="truncate">
                            Top: {project.topAgentName} / {compactNumber(project.topAgentTokens)}
                          </span>
                        )}
                        {project.updatedAt !== undefined && project.updatedAt > 0 && (
                          <span>Updated {formatRelative(project.updatedAt)}</span>
                        )}
                      </div>
                      <UsageBar
                        label="Share"
                        value={project.providerTokens}
                        total={Math.max(totals.providerTokens, 1)}
                      />
                      {project.projectDir && (
                        <Button
                          variant="default"
                          size="sm"
                          className="mt-3 px-5"
                          onClick={() =>
                            vscode.postMessage({
                              type: 'openProjectPath',
                              projectDir: project.projectDir,
                            })
                          }
                          title={project.projectDir}
                        >
                          Open Project
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="border border-border bg-bg">
            <SectionHeader title="Agent Usage Ledger" subtitle="Highest usage agents first" />
            <div className="divide-y divide-border">
              {activeRows.length === 0 ? (
                <div className="p-4 text-sm text-text-muted">
                  No token usage has been recorded yet
                </div>
              ) : (
                activeRows.slice(0, 24).map((agent) => (
                  <div
                    key={agent.id}
                    className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_repeat(6,minmax(68px,auto))_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <ProviderBadge providerId={agent.providerId} />
                        <span className="truncate text-sm text-text">{agent.name}</span>
                        <span className="shrink-0 text-xs text-text-muted">#{agent.id}</span>
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap gap-2 text-xs text-text-muted">
                        <span className="truncate">{agent.project}</span>
                        {agent.teamName && <span className="truncate">{agent.teamName}</span>}
                        {agent.sessionId && <span className="truncate">{agent.sessionId}</span>}
                      </div>
                    </div>
                    <LedgerValue label="Input" value={agent.inputTokens} />
                    <LedgerValue label="Output" value={agent.outputTokens} />
                    <LedgerValue label="Cache" value={agent.cacheTokens} />
                    <LedgerValue label="Reason" value={agent.reasoningTokens} />
                    <LedgerValue label="Artifact" value={agent.artifactOutputTokens} />
                    <LedgerValue label="Provider" value={agent.providerTokens} highlight />
                    <div className="flex items-start justify-start md:justify-end">
                      <UsageAccuracyPill accuracy={agent.accuracy} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : (
        <UsageHistoryDashboard
          usageHistory={usageHistory}
          pageModel={historyPageModel}
          filters={historyFilters}
          onProviderChange={setHistoryProviderFilter}
          onProjectChange={setHistoryProjectFilter}
          onTimeWindowChange={setHistoryTimeFilter}
          onClearFilters={clearHistoryFilters}
          onCopyCsv={copyHistoryCsv}
          copyStatus={historyCopyStatus}
        />
      )}
    </div>
  );
}

function UsageOverviewDashboard({ dashboard }: { dashboard: UsageOverviewDashboardModel }) {
  return (
    <div className="grid gap-4">
      {dashboard.emptyState && (
        <section className="border border-border bg-btn-bg p-8 text-center">
          <div className="text-lg text-accent-bright">{dashboard.emptyState.title}</div>
          <div className="mt-2 text-sm text-text-muted">{dashboard.emptyState.detail}</div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.metrics.map((metric) => (
          <UsageMetric
            key={metric.id}
            label={metric.label}
            value={formatUsageOverviewMetricValue(metric.value)}
            detail={metric.detail}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <UsageOverviewTrendPanel buckets={dashboard.trendBuckets} />
        <UsageOverviewProviderPanel providers={dashboard.providerRows} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <UsageOverviewProjectPanel projects={dashboard.projectRows} />
        <UsageInsightPanel
          insights={dashboard.insights}
          title="Operational Signals"
          subtitle="Local telemetry warnings, quota pressure, and reliability cues"
        />
      </div>
    </div>
  );
}

function UsageOverviewTrendPanel({ buckets }: { buckets: UsageOverviewTrendBucket[] }) {
  const hasUsage = buckets.some((bucket) => bucket.displayTokens > 0);
  return (
    <section className="border border-border bg-bg">
      <SectionHeader title="Last 7 Days" subtitle="Persisted local display-token trend" />
      {!hasUsage ? (
        <div className="p-4 text-sm text-text-muted">No persisted usage in the last 7 days</div>
      ) : (
        <div className="grid grid-cols-7 gap-2 p-4">
          {buckets.map((bucket) => (
            <div key={bucket.id} className="min-w-0">
              <div className="flex h-16 items-end border border-border bg-btn-bg px-1">
                <div
                  className="w-full bg-accent"
                  style={{ height: `${usageBarPercent(bucket.displayTokens, bucket.total)}%` }}
                  title={`${bucket.label}: ${compactNumber(bucket.displayTokens)} display tokens`}
                />
              </div>
              <div className="mt-2 truncate text-center text-[10px] uppercase text-text-muted">
                {bucket.label}
              </div>
              <div className="truncate text-center text-[10px] text-accent-bright">
                {compactNumber(bucket.displayTokens)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function UsageOverviewProviderPanel({ providers }: { providers: UsageOverviewProviderRow[] }) {
  return (
    <section className="border border-border bg-bg">
      <SectionHeader title="Provider Mix" subtitle="Active now, today, and local history" />
      <div className="divide-y divide-border">
        {providers.map((provider) => (
          <div key={provider.providerId} className="p-4">
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderBadge providerId={provider.providerId} />
                  <span className="truncate text-sm text-text">{provider.label}</span>
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  Live {compactNumber(provider.liveProviderTokens)} / today{' '}
                  {compactNumber(provider.todayDisplayTokens)} / 7d{' '}
                  {compactNumber(provider.last7DaysDisplayTokens)}
                </div>
              </div>
              <UsageAccuracyPill accuracy={provider.accuracy} />
            </div>
            <UsageBar
              label="Combined"
              value={provider.combinedDisplayTokens}
              total={Math.max(
                ...providers.map((row) => row.combinedDisplayTokens),
                provider.combinedDisplayTokens,
                1,
              )}
            />
            {provider.quotaSignal && (
              <div className="mt-3 text-xs text-text-muted">
                Quota signal: {Math.round(provider.quotaSignal.usedPercent ?? 0)}% used
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function UsageOverviewProjectPanel({ projects }: { projects: UsageOverviewProjectRow[] }) {
  return (
    <section className="border border-border bg-bg">
      <SectionHeader title="Project Ranking" subtitle="Combined live and persisted local usage" />
      <div className="divide-y divide-border">
        {projects.length === 0 ? (
          <div className="p-4 text-sm text-text-muted">No project usage yet</div>
        ) : (
          projects.slice(0, 8).map((project) => (
            <div key={project.projectName} className="p-4">
              <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-accent-bright">{project.projectName}</div>
                  <div className="mt-1 flex min-w-0 flex-wrap gap-2 text-xs text-text-muted">
                    {project.providerIds.map((providerId) => (
                      <ProviderBadge key={providerId} providerId={providerId} />
                    ))}
                    {project.topAgentName && (
                      <span className="truncate">Top: {project.topAgentName}</span>
                    )}
                  </div>
                </div>
                <UsageAccuracyPill accuracy={project.accuracy} />
              </div>
              <UsageBar
                label="Combined"
                value={project.combinedDisplayTokens}
                total={Math.max(
                  ...projects.map((row) => row.combinedDisplayTokens),
                  project.combinedDisplayTokens,
                  1,
                )}
              />
              <div className="mt-2 text-xs text-text-muted">
                Live {compactNumber(project.liveDisplayTokens)} / history{' '}
                {compactNumber(project.historyDisplayTokens)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function UsageHistoryDashboard({
  usageHistory,
  pageModel,
  filters,
  onProviderChange,
  onProjectChange,
  onTimeWindowChange,
  onClearFilters,
  onCopyCsv,
  copyStatus,
}: {
  usageHistory: UsageHistoryState;
  pageModel: UsageHistoryPageModel;
  filters: UsageHistoryPageFilters;
  onProviderChange: (value: 'all' | string) => void;
  onProjectChange: (value: 'all' | string) => void;
  onTimeWindowChange: (value: UsageHistoryTimeFilter) => void;
  onClearFilters: () => void;
  onCopyCsv: () => void;
  copyStatus: 'idle' | 'copied' | 'failed';
}) {
  const model = pageModel.filtered;
  const totals = model.totals;
  const hasExportRows = pageModel.exportRowCount > 0 && !usageHistory.unavailable;
  const unavailableMessage = usageHistoryUnavailableMessage(
    usageHistory.unavailable,
    usageHistory.error,
  );

  return (
    <div className="grid gap-4">
      <section className="border border-border bg-bg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm uppercase tracking-wide text-accent-bright">
              Persisted Usage History
            </div>
            <div className="mt-1 text-xs text-text-muted">
              Local records from ~/.pixel-agents-multi/usage/usage-v1.jsonl
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-wide text-text-muted">
            <span className="border border-border bg-btn-bg px-2 py-1">
              API proxy estimate only
            </span>
            <span className="border border-border bg-btn-bg px-2 py-1">
              Not actual subscription billing
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 border border-border bg-btn-bg p-3 xl:grid-cols-[180px_minmax(180px,1fr)_minmax(220px,1fr)_auto_auto]">
        <UsageHistoryFilterSelect
          label="Window"
          value={filters.timeWindow}
          allLabel="All history"
          options={[
            { value: 'today', label: usageHistoryTimeFilterLabel('today') },
            { value: 'last_7_days', label: usageHistoryTimeFilterLabel('last_7_days') },
          ]}
          onChange={(value) => onTimeWindowChange(value as UsageHistoryTimeFilter)}
          ariaLabel="Filter usage history time window"
        />
        <UsageHistoryFilterSelect
          label="Provider"
          value={filters.providerId}
          allLabel="All providers"
          options={pageModel.providerOptions}
          onChange={onProviderChange}
          ariaLabel="Filter usage history provider"
        />
        <UsageHistoryFilterSelect
          label="Project"
          value={filters.projectKey}
          allLabel="All projects"
          options={pageModel.projectOptions}
          onChange={onProjectChange}
          ariaLabel="Filter usage history project"
        />
        <div className="flex items-end">
          {pageModel.hasFilters && (
            <Button variant="ghost" size="sm" className="h-34 px-4" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <div className="flex min-w-[160px] flex-col items-start justify-end gap-1">
          <Button
            variant={hasExportRows ? 'default' : 'disabled'}
            size="sm"
            className="h-34 px-4"
            disabled={!hasExportRows}
            onClick={onCopyCsv}
          >
            Copy CSV
          </Button>
          <div className="text-xs text-text-muted">{usageHistoryCopyLabel(copyStatus)}</div>
        </div>
      </section>

      {unavailableMessage ? (
        <UsageHistoryEmptyPanel
          title={unavailableMessage.title}
          detail={unavailableMessage.detail}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <UsageMetric
              label="Records"
              value={`${model.filteredRecordCount.toLocaleString()} / ${model.sourceRecordCount.toLocaleString()}`}
              detail="shown / stored"
            />
            <UsageMetric
              label="Usage records"
              value={totals.usageRecordCount.toLocaleString()}
              detail={`${totals.rateLimitRecordCount} quota snapshots`}
            />
            <UsageMetric
              label="Provider tokens"
              value={compactNumber(totals.providerTokens)}
              detail={`${compactNumber(totals.providerInputTokens)} in / ${compactNumber(
                totals.providerOutputTokens,
              )} out`}
            />
            <UsageMetric
              label="Artifact est."
              value={compactNumber(totals.artifactOutputTokens)}
              detail="outside proxy total"
            />
            <UsageMetric
              label="Proxy est."
              value={formatProxyUsd(totals.apiProxyEstimateUsd)}
              detail="API proxy estimate only"
            />
            <UsageMetric
              label="Accuracy"
              value={usageAccuracyShort(totals.accuracy)}
              detail={usageHistoryAccuracyLabel(totals.accuracy)}
            />
          </div>

          {model.emptyState ? (
            <UsageHistoryEmptyPanel
              title={model.emptyState.title}
              detail={model.emptyState.detail}
              activeFilters={model.emptyState.activeFilters}
              onClearFilters={pageModel.hasFilters ? onClearFilters : undefined}
            />
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <UsageHistoryProviderPanel pageModel={pageModel} />
                <UsageHistoryProjectPanel pageModel={pageModel} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <UsageHistoryModelPanel pageModel={pageModel} />
                <UsageHistoryRateLimitPanel snapshots={model.latestRateLimits} />
              </div>

              <UsageHistoryLedgerPanel pageModel={pageModel} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function UsageHistoryFilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: UsageHistoryPageOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
      {label}
      <select
        className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label={ariaLabel}
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.detail ? `${option.label} (${option.detail})` : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function UsageHistoryProviderPanel({ pageModel }: { pageModel: UsageHistoryPageModel }) {
  const totals = pageModel.filtered.totals;
  return (
    <section className="border border-border bg-bg">
      <SectionHeader title="Historical Providers" subtitle="Persisted provider totals" />
      <div className="divide-y divide-border">
        {pageModel.filtered.providers.slice(0, 8).map((provider) => (
          <div key={provider.providerId} className="p-4">
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderBadge providerId={provider.providerId} />
                  <span className="truncate text-sm text-text">{provider.label}</span>
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  {provider.recordCount} records / {compactNumber(provider.providerTokens)} tokens
                </div>
              </div>
              <UsageAccuracyPill accuracy={provider.accuracy} />
            </div>
            <UsageBar
              label="Share"
              value={provider.providerTokens}
              total={Math.max(totals.providerTokens, 1)}
            />
            {provider.apiProxyEstimateUsd > 0 && (
              <div className="mt-2 text-xs text-text-muted">
                {formatProxyUsd(provider.apiProxyEstimateUsd)} / API proxy estimate only
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function UsageHistoryProjectPanel({ pageModel }: { pageModel: UsageHistoryPageModel }) {
  const totals = pageModel.filtered.totals;
  return (
    <section className="border border-border bg-bg">
      <SectionHeader title="Historical Projects" subtitle="Redacted local project groups" />
      <div className="divide-y divide-border">
        {pageModel.filtered.projects.slice(0, 8).map((project) => (
          <div key={project.projectKey} className="p-4">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-accent-bright">{project.projectName}</div>
                <div className="mt-1 text-xs text-text-muted">
                  {project.recordCount} records / {compactNumber(project.providerTokens)} tokens
                </div>
              </div>
              <UsageAccuracyPill accuracy={project.accuracy} />
            </div>
            <div className="mb-2 flex min-w-0 flex-wrap gap-2 text-xs text-text-muted">
              {project.providerIds.map((providerId) => (
                <ProviderBadge key={providerId} providerId={providerId} />
              ))}
              {project.projectDirHash && <span className="truncate">{project.projectDirHash}</span>}
              {project.topAgentName && (
                <span className="truncate">
                  Top: {project.topAgentName} / {compactNumber(project.topAgentTokens)}
                </span>
              )}
            </div>
            <UsageBar
              label="Share"
              value={project.providerTokens}
              total={Math.max(totals.providerTokens, 1)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function UsageHistoryModelPanel({ pageModel }: { pageModel: UsageHistoryPageModel }) {
  return (
    <section className="border border-border bg-bg">
      <SectionHeader
        title="Historical Models"
        subtitle="Model ids when provider data includes them"
      />
      <div className="divide-y divide-border">
        {pageModel.filtered.models.length === 0 ? (
          <div className="p-4 text-sm text-text-muted">No model metadata in this history scope</div>
        ) : (
          pageModel.filtered.models.slice(0, 8).map((model) => (
            <div key={`${model.providerIds.join('|')}:${model.modelId}`} className="p-4">
              <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-text">{model.label}</div>
                  <div className="mt-1 text-xs text-text-muted">
                    {model.source} / {model.recordCount} records /{' '}
                    {compactNumber(model.providerTokens)} tokens
                  </div>
                </div>
                <UsageAccuracyPill accuracy={model.accuracy} />
              </div>
              <div className="flex flex-wrap gap-2">
                {model.providerIds.map((providerId) => (
                  <ProviderBadge key={providerId} providerId={providerId} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function UsageHistoryRateLimitPanel({ snapshots }: { snapshots: UsageHistoryRateLimitSnapshot[] }) {
  return (
    <section className="border border-border bg-bg">
      <SectionHeader
        title="Latest Quota Snapshots"
        subtitle="Persisted provider rate-limit signals"
      />
      <div className="divide-y divide-border">
        {snapshots.length === 0 ? (
          <div className="p-4 text-sm text-text-muted">No persisted rate-limit snapshots yet</div>
        ) : (
          snapshots.map((snapshot) => (
            <div key={`${snapshot.providerId}:${snapshot.name}`} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <ProviderBadge providerId={snapshot.providerId} />
                <span className="text-sm text-text">{snapshot.name}</span>
                <span className="text-xs text-text-muted">
                  {formatRelative(snapshot.capturedAtMs)}
                </span>
              </div>
              <div className="text-xs text-text-muted">{formatUsageHistoryRateLimit(snapshot)}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function UsageHistoryLedgerPanel({ pageModel }: { pageModel: UsageHistoryPageModel }) {
  return (
    <section className="border border-border bg-bg">
      <SectionHeader
        title="Historical Agent Ledger"
        subtitle="Agent/session rows from stored records"
      />
      <div className="divide-y divide-border">
        {pageModel.filtered.ledgerRows.length === 0 ? (
          <div className="p-4 text-sm text-text-muted">No historical ledger rows in this scope</div>
        ) : (
          pageModel.filtered.ledgerRows.slice(0, 24).map((row) => (
            <div
              key={row.ledgerKey}
              className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_repeat(5,minmax(72px,auto))_auto]"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderBadge providerId={row.providerId} />
                  <span className="truncate text-sm text-text">{row.agentName}</span>
                  <span className="shrink-0 text-xs text-text-muted">#{row.agentId}</span>
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap gap-2 text-xs text-text-muted">
                  <span className="truncate">{row.projectName}</span>
                  <span className="truncate">{row.modelLabel}</span>
                  {row.sessionId && <span className="truncate">{row.sessionId}</span>}
                  {row.threadId && <span className="truncate">{row.threadId}</span>}
                  {row.projectDirHash && <span className="truncate">{row.projectDirHash}</span>}
                </div>
              </div>
              <LedgerValue label="Input" value={row.providerInputTokens} />
              <LedgerValue label="Output" value={row.providerOutputTokens} />
              <LedgerValue label="Cache" value={row.cacheTokens} />
              <LedgerValue label="Artifact" value={row.artifactOutputTokens} />
              <LedgerValue label="Provider" value={row.providerTokens} />
              <div className="flex items-start justify-start md:justify-end">
                <UsageAccuracyPill accuracy={row.accuracy} />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function UsageHistoryEmptyPanel({
  title,
  detail,
  activeFilters,
  onClearFilters,
}: {
  title: string;
  detail: string;
  activeFilters?: string[];
  onClearFilters?: () => void;
}) {
  return (
    <section className="border border-border bg-btn-bg p-8 text-center">
      <div className="text-lg text-accent-bright">{title}</div>
      <div className="mt-2 text-sm text-text-muted">{detail}</div>
      {activeFilters && activeFilters.length > 0 && (
        <div className="mt-3 text-xs text-text-muted">{activeFilters.join(' / ')}</div>
      )}
      {onClearFilters && (
        <div className="mt-4">
          <Button variant="default" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </section>
  );
}

export function UsageMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 border border-border bg-btn-bg p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 truncate text-xl text-accent-bright">{value}</div>
      <div className="mt-1 truncate text-xs text-text-muted">{detail}</div>
    </div>
  );
}

function UsageCategoryPanel({ categories }: { categories: UsageCategorySummary[] }) {
  return (
    <section className="border border-border bg-bg">
      <SectionHeader title="Token Mix" subtitle="Live provider totals and category detail" />
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {categories.map((category) => (
          <div key={category.id} className="min-w-0 border border-border bg-btn-bg p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="truncate text-sm text-accent-bright">{category.label}</div>
              <div className="shrink-0 text-xs text-text-muted">
                {compactNumber(category.value)}
              </div>
            </div>
            <UsageBar label="Share" value={category.value} total={category.total} />
            <div className="mt-2 break-words text-xs text-text-muted">{category.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function UsageInsightPanel({
  insights,
  title = 'Live Signals',
  subtitle = 'Local warnings from the current scope',
}: {
  insights: Array<
    Pick<UsageInsight | UsageOverviewInsight, 'id' | 'severity' | 'title' | 'detail'>
  >;
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className="border border-border bg-bg">
      <SectionHeader title={title} subtitle={subtitle} />
      <div className="divide-y divide-border">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={`grid gap-3 p-4 sm:grid-cols-[18px_minmax(0,1fr)] ${usageInsightClass(
              insight.severity,
            )}`}
          >
            <span className={`mt-1 h-3 w-3 ${usageInsightDotClass(insight.severity)}`} />
            <div className="min-w-0">
              <div className="truncate text-sm text-text">{insight.title}</div>
              <div className="mt-1 break-words text-xs text-text-muted">{insight.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function UsageAccuracyPill({ accuracy }: { accuracy: UsageAccuracy }) {
  return (
    <span
      className={`shrink-0 border px-2 py-1 text-xs uppercase tracking-wide ${usageAccuracyClass(
        accuracy,
      )}`}
      title={usageAccuracyLabel(accuracy)}
    >
      {usageAccuracyShort(accuracy)}
    </span>
  );
}

function usageHistoryStatusText(usageHistory: UsageHistoryState): string {
  if (usageHistory.unavailable) return 'History unavailable';
  if (usageHistory.loadedAtMs === undefined) return 'History loading';
  return `${usageHistory.records.length.toLocaleString()} history records`;
}

function formatUsageHistoryRateLimit(limit: UsageHistoryRateLimitSnapshot): string {
  const percent =
    limit.usedPercent !== undefined
      ? `${Math.round(limit.usedPercent)}% quota used`
      : limit.remainingPercent !== undefined
        ? `${Math.round(limit.remainingPercent)}% quota remaining`
        : 'quota snapshot available';
  const reset = rateLimitResetText(limit);
  return reset
    ? `${limit.providerLabel} ${percent}; resets ${reset}.`
    : `${limit.providerLabel} ${percent}.`;
}

function UsageBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = usageBarPercent(value, total);

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-text-muted">
        <span>{label}</span>
        <span>{compactNumber(value)}</span>
      </div>
      <div className="h-3 border border-border bg-btn-bg">
        <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function usageHistoryCopyLabel(status: 'idle' | 'copied' | 'failed'): string {
  if (status === 'copied') return 'CSV copied';
  if (status === 'failed') return 'Copy failed';
  return 'Redacted paths';
}

function LedgerValue({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 text-left md:text-right">
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`truncate text-sm ${highlight ? 'text-accent-bright' : 'text-text'}`}>
        {compactNumber(value)}
      </div>
    </div>
  );
}
