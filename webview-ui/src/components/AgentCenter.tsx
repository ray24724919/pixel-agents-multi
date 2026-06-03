import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from 'react';

import type {
  AgentLifecycleEvent,
  AgentLifecycleState,
  AgentRuntimeMetadata,
  AgentTimelineEvent,
  UsageHistoryState,
} from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { TokenRateLimitSnapshot, TokenUsageDetails, ToolActivity } from '../office/types.js';
import {
  type AgentZone,
  type AgentZoneSource,
  inferAgentZone,
  zoneSourceLabel,
} from '../office/zoneUtils.js';
import { vscode } from '../vscodeApi.js';
import { isAgentVisibleWithHiddenToggle } from './agentCenterFilters.js';
import {
  AGENT_LIST_SORT_OPTIONS,
  type AgentListItem,
  type AgentListSortKey,
  agentListSortLabel,
  type AgentListStatusFilter,
  type AgentListStatusGroup,
  filterAndSortAgentList,
} from './agentCenterListModel.js';
import type { AgentCenterPage } from './agentCenterPages.js';
import { isPausedStatus, pauseActionLabel } from './pauseResume.js';
import {
  buildTimelinePageItems,
  buildTimelinePageModel,
  type TimelinePageFilters,
  type TimelinePageItem,
  type TimelinePageModel,
  type TimelineSeverity,
  type TimelineSeverityFilter,
  timelineSeverityLabel,
} from './timelinePageModel.js';
import { TokenCostSummary } from './TokenCostSummary.js';
import { Button } from './ui/Button.js';
import {
  usageHistoryAccuracyLabel,
  type UsageHistoryRateLimitSnapshot,
} from './usageHistoryModel.js';
import {
  buildUsageHistoryPageModel,
  DEFAULT_USAGE_HISTORY_PAGE_FILTERS,
  type UsageHistoryPageFilters,
  type UsageHistoryPageModel,
  type UsageHistoryPageOption,
  type UsageHistoryTimeFilter,
  usageHistoryTimeFilterLabel,
  usageHistoryUnavailableMessage,
} from './usageHistoryPageModel.js';
import {
  buildUsageIntelligenceDashboard,
  type UsageAccuracy,
  usageAccuracyLabel,
  type UsageCategorySummary,
  type UsageInsight,
} from './usageIntelligenceModel.js';

type ProviderFilter = 'all' | 'codex' | 'claude';
type StatusFilter = AgentListStatusFilter;
type ProjectFilter = 'all' | string;
type TeamFilter = 'all' | string;
type UsagePane = 'live' | 'history';

interface AgentCenterSurfaceProps {
  activePage: AgentCenterPage;
  isActive: boolean;
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  agentLifecycleStatuses: Record<number, AgentLifecycleState>;
  agentLifecycleEvents: AgentLifecycleEvent[];
  agentTimelineEvents: AgentTimelineEvent[];
  agentRuntimeMetadata: Record<number, AgentRuntimeMetadata>;
  hiddenAgents: Record<number, boolean>;
  showHiddenAgents: boolean;
  onShowHiddenAgentsChange: (show: boolean) => void;
  officeState: OfficeState;
  onCloseAgent: (id: number) => void;
  onPauseAgent: (id: number) => void;
  onResumeAgent: (id: number) => void;
  usageHistory: UsageHistoryState;
}

interface AgentSummary extends AgentListItem {
  id: number;
  name: string;
  project: string;
  providerId: string;
  status: string;
  statusGroup: AgentListStatusGroup;
  activity: string;
  detail?: string;
  tokens: number;
  updatedAt?: number;
  inputTokens: number;
  outputTokens: number;
  artifactOutputTokens: number;
  tokenUsageEstimated: boolean;
  tokenUsageDetails?: TokenUsageDetails;
  codexRateLimit?: TokenRateLimitSnapshot;
  zone: AgentZone;
  zoneSource: AgentZoneSource;
  projectDir?: string;
  transcriptPath?: string;
  teamName?: string;
  roleName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  isPaused: boolean;
  hidden: boolean;
}

interface ProjectSummary {
  project: string;
  projectDir?: string;
  agentCount: number;
  activeCount: number;
  waitingCount: number;
  needsMeCount: number;
  errorCount: number;
  tokens: number;
}

interface TeamSummary {
  teamName: string;
  memberCount: number;
  leadAgentId?: number;
  leadName?: string;
  activeCount: number;
  needsMeCount: number;
  errorCount: number;
  tokens: number;
  projects: string[];
}

export function AgentCenterSurface({
  activePage,
  isActive,
  agents,
  selectedAgent,
  agentTools,
  agentStatuses,
  agentLifecycleStatuses,
  agentLifecycleEvents,
  agentTimelineEvents,
  agentRuntimeMetadata,
  hiddenAgents,
  showHiddenAgents,
  onShowHiddenAgentsChange,
  officeState,
  onCloseAgent,
  onPauseAgent,
  onResumeAgent,
  usageHistory,
}: AgentCenterSurfaceProps) {
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<AgentListSortKey>('attention');
  const [timelineSearchQuery, setTimelineSearchQuery] = useState('');
  const [timelineProviderFilter, setTimelineProviderFilter] = useState<'all' | string>('all');
  const [timelineSeverityFilter, setTimelineSeverityFilter] =
    useState<TimelineSeverityFilter>('all');
  const [timelineProjectFilter, setTimelineProjectFilter] = useState<'all' | string>('all');
  const [timelineAgentFilter, setTimelineAgentFilter] = useState<'all' | string>('all');
  const [detailAgentId, setDetailAgentId] = useState<number | null>(selectedAgent);

  const summaries = useMemo(
    () =>
      agents.map((id) =>
        getAgentSummary(
          id,
          agentTools[id] ?? [],
          agentStatuses[id],
          agentLifecycleStatuses[id],
          agentRuntimeMetadata[id],
          hiddenAgents[id] === true,
          officeState,
          agentTimelineEvents,
        ),
      ),
    [
      agents,
      agentRuntimeMetadata,
      agentTools,
      agentTimelineEvents,
      agentLifecycleStatuses,
      agentStatuses,
      hiddenAgents,
      officeState,
    ],
  );
  const visibleSummaries = useMemo(
    () =>
      summaries.filter((agent) => isAgentVisibleWithHiddenToggle(agent.hidden, showHiddenAgents)),
    [showHiddenAgents, summaries],
  );

  const filteredAgents = useMemo(
    () =>
      filterAndSortAgentList(visibleSummaries, {
        providerFilter,
        statusFilter,
        projectFilter,
        teamFilter,
        searchQuery,
        sortKey,
      }),
    [
      projectFilter,
      providerFilter,
      searchQuery,
      sortKey,
      statusFilter,
      teamFilter,
      visibleSummaries,
    ],
  );
  const projectSummaries = useMemo(() => getProjectSummaries(visibleSummaries), [visibleSummaries]);
  const teamSummaries = useMemo(() => getTeamSummaries(visibleSummaries), [visibleSummaries]);
  const visibleAgentIds = useMemo(
    () => visibleSummaries.map((agent) => agent.id),
    [visibleSummaries],
  );
  const hiddenCount = summaries.filter((agent) => agent.hidden).length;
  const agentStateCounts = useMemo(() => getAgentStateCounts(summaries), [summaries]);
  const hasAgentListFilters =
    providerFilter !== 'all' ||
    statusFilter !== 'all' ||
    projectFilter !== 'all' ||
    teamFilter !== 'all' ||
    searchQuery.trim().length > 0 ||
    sortKey !== 'attention';
  const timelineItems = useMemo(
    () => buildTimelinePageItems(visibleSummaries, agentTimelineEvents, agentLifecycleEvents),
    [agentLifecycleEvents, agentTimelineEvents, visibleSummaries],
  );
  const timelineFilters = useMemo<TimelinePageFilters>(
    () => ({
      providerFilter: timelineProviderFilter,
      severityFilter: timelineSeverityFilter,
      projectFilter: timelineProjectFilter,
      agentFilter: timelineAgentFilter,
      searchQuery: timelineSearchQuery,
    }),
    [
      timelineAgentFilter,
      timelineProjectFilter,
      timelineProviderFilter,
      timelineSearchQuery,
      timelineSeverityFilter,
    ],
  );
  const timelineModel = useMemo(
    () => buildTimelinePageModel(timelineItems, timelineFilters),
    [timelineFilters, timelineItems],
  );

  const clearAgentListFilters = () => {
    setProviderFilter('all');
    setStatusFilter('all');
    setProjectFilter('all');
    setTeamFilter('all');
    setSearchQuery('');
    setSortKey('attention');
  };

  const clearTimelineFilters = () => {
    setTimelineProviderFilter('all');
    setTimelineSeverityFilter('all');
    setTimelineProjectFilter('all');
    setTimelineAgentFilter('all');
    setTimelineSearchQuery('');
  };

  const refreshAgentCenter = () => {
    vscode.postMessage({ type: 'refreshAgents' });
  };

  useEffect(() => {
    officeState.setMeetingTeam(teamFilter === 'all' ? null : teamFilter);
  }, [officeState, teamFilter]);

  useEffect(() => {
    if (!isActive || activePage !== 'agents') return;
    if (detailAgentId !== null && filteredAgents.some((agent) => agent.id === detailAgentId)) {
      return;
    }
    if (selectedAgent !== null && filteredAgents.some((agent) => agent.id === selectedAgent)) {
      setDetailAgentId(selectedAgent);
      return;
    }
    setDetailAgentId(filteredAgents[0]?.id ?? null);
  }, [activePage, detailAgentId, filteredAgents, isActive, selectedAgent]);

  const selectedSummary =
    filteredAgents.find((agent) => agent.id === detailAgentId) ?? filteredAgents[0];
  const selectedTimeline = selectedSummary
    ? buildAgentTimeline(selectedSummary.id, agentTimelineEvents, agentLifecycleEvents)
    : [];
  const selectedTeamMembers = selectedSummary?.teamName
    ? visibleSummaries.filter((agent) => agent.teamName === selectedSummary.teamName)
    : [];
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-2 border-border bg-bg shadow-pixel">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-btn-bg px-6 py-4 pr-7">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-text-muted">Agent Center</div>
          <div className="mt-1 truncate text-2xl text-accent-bright">
            {agentCenterPageTitle(activePage)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 border border-border bg-btn-bg px-3 py-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={showHiddenAgents}
              onChange={(event) => onShowHiddenAgentsChange(event.currentTarget.checked)}
            />
            <span>Show hidden</span>
            {hiddenCount > 0 && <span>({hiddenCount})</span>}
          </label>
          <Button variant="default" size="sm" onClick={refreshAgentCenter}>
            Refresh
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pr-7 pt-6">
        {activePage === 'agents' && (
          <>
            <AgentStateSummary
              counts={agentStateCounts}
              shownCount={filteredAgents.length}
              visibleCount={visibleSummaries.length}
            />

            <div className="mb-4 grid gap-3 border border-border bg-btn-bg p-3 xl:grid-cols-[minmax(220px,1fr)_220px]">
              <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
                Search
                <input
                  className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder="Agent, project, session, team, activity..."
                  aria-label="Search agents"
                />
              </label>
              <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
                Sort
                <select
                  className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
                  value={sortKey}
                  onChange={(event) => setSortKey(event.currentTarget.value as AgentListSortKey)}
                  aria-label="Sort agents"
                >
                  {AGENT_LIST_SORT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {agentListSortLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
              <SegmentedButtons
                values={['all', 'codex', 'claude']}
                active={providerFilter}
                label={(provider) => (provider === 'all' ? 'All' : providerLabel(provider))}
                onChange={setProviderFilter}
              />
              <div className="text-xs uppercase tracking-wide text-text-muted">
                {filteredAgents.length} shown / {visibleSummaries.length} visible
              </div>
            </div>

            <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
              <SegmentedButtons
                values={['all', 'needs_me', 'error', 'active', 'paused', 'waiting', 'hidden']}
                active={statusFilter}
                label={statusFilterLabel}
                onChange={setStatusFilter}
              />
              {hasAgentListFilters && (
                <Button variant="ghost" size="sm" className="px-4" onClick={clearAgentListFilters}>
                  Clear filters
                </Button>
              )}
            </div>

            <ProjectDashboard
              projects={projectSummaries}
              activeProject={projectFilter}
              onProjectChange={setProjectFilter}
              onOpenProject={(projectDir) =>
                vscode.postMessage({ type: 'openProjectPath', projectDir })
              }
            />

            <TeamDashboard
              teams={teamSummaries}
              activeTeam={teamFilter}
              onTeamChange={setTeamFilter}
            />

            <div className="grid border border-border lg:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]">
              <div className="border-b border-border lg:border-b-0 lg:border-r">
                {filteredAgents.length === 0 ? (
                  <AgentListEmptyState
                    hasFilters={hasAgentListFilters}
                    hiddenCount={hiddenCount}
                    showHiddenAgents={showHiddenAgents}
                    totalAgents={summaries.length}
                    visibleCount={visibleSummaries.length}
                    onClearFilters={clearAgentListFilters}
                    onShowHidden={() => onShowHiddenAgentsChange(true)}
                  />
                ) : (
                  <div className="divide-y divide-border">
                    {filteredAgents.map((agent) => (
                      <AgentRow
                        key={agent.id}
                        agent={agent}
                        isSelected={selectedSummary?.id === agent.id}
                        onSelect={() => setDetailAgentId(agent.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <AgentDetail
                agent={selectedSummary}
                lifecycle={selectedSummary ? agentLifecycleStatuses[selectedSummary.id] : undefined}
                timeline={selectedTimeline}
                teamMembers={selectedTeamMembers}
                onCloseAgent={onCloseAgent}
                onPauseAgent={onPauseAgent}
                onResumeAgent={onResumeAgent}
              />
            </div>
          </>
        )}

        {activePage === 'usage' && (
          <UsageErrorBoundary>
            <UsageDashboard
              agents={visibleSummaries}
              visibleAgentIds={visibleAgentIds}
              officeState={officeState}
              usageHistory={usageHistory}
            />
          </UsageErrorBoundary>
        )}

        {activePage === 'timeline' && (
          <TimelineDashboard
            agents={visibleSummaries}
            model={timelineModel}
            filters={timelineFilters}
            onSearchChange={setTimelineSearchQuery}
            onProviderFilterChange={setTimelineProviderFilter}
            onSeverityFilterChange={setTimelineSeverityFilter}
            onProjectFilterChange={setTimelineProjectFilter}
            onAgentFilterChange={setTimelineAgentFilter}
            onClearFilters={clearTimelineFilters}
          />
        )}
      </div>
    </div>
  );
}

class UsageErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message?: string }
> {
  state: { hasError: boolean; message?: string } = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown usage render error',
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('[AgentCenter] Usage tab failed to render', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="border border-border bg-bg p-8 text-center">
        <div className="text-lg text-accent-bright">Usage data unavailable</div>
        <div className="mt-2 text-sm text-text-muted">
          Refresh agents and reopen this tab. The rest of Agent Center is still available.
        </div>
        {this.state.message && (
          <div className="mt-4 break-words text-xs text-text-muted">{this.state.message}</div>
        )}
      </section>
    );
  }
}

function agentCenterPageTitle(page: AgentCenterPage): string {
  if (page === 'agents') return 'Agents';
  if (page === 'usage') return 'Usage';
  return 'Timeline';
}

function UsageDashboard({
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
  const [usagePane, setUsagePane] = useState<UsagePane>('live');
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
              {usagePane === 'live' ? 'Live session usage' : 'Persisted local history'}
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
          values={['live', 'history'] as const}
          active={usagePane}
          label={(value) => (value === 'live' ? 'Live' : 'History')}
          onChange={setUsagePane}
        />
        <div className="text-xs uppercase tracking-wide text-text-muted">
          {usagePane === 'live'
            ? 'Current visible agents'
            : 'Persisted local records / redacted export'}
        </div>
      </section>

      {usagePane === 'live' ? (
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

function TimelineDashboard({
  agents,
  model,
  filters,
  onSearchChange,
  onProviderFilterChange,
  onSeverityFilterChange,
  onProjectFilterChange,
  onAgentFilterChange,
  onClearFilters,
}: {
  agents: AgentSummary[];
  model: TimelinePageModel;
  filters: TimelinePageFilters;
  onSearchChange: (query: string) => void;
  onProviderFilterChange: (provider: 'all' | string) => void;
  onSeverityFilterChange: (severity: TimelineSeverityFilter) => void;
  onProjectFilterChange: (project: 'all' | string) => void;
  onAgentFilterChange: (agent: 'all' | string) => void;
  onClearFilters: () => void;
}) {
  const activeCount = agents.filter((agent) => agent.statusGroup === 'active').length;
  const needsMeCount = agents.filter((agent) => agent.statusGroup === 'needs_me').length;
  const errorCount = agents.filter((agent) => agent.statusGroup === 'error').length;

  return (
    <div className="grid gap-4">
      <section className="border border-border bg-bg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm uppercase tracking-wide text-accent-bright">Timeline</div>
            <div className="mt-1 text-xs text-text-muted">
              Local event history across visible agents and retained action events
            </div>
          </div>
          <div className="text-xs uppercase tracking-wide text-text-muted">
            {agents.length} visible agents / {activeCount} active / {needsMeCount} needs me /{' '}
            {errorCount} errors
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <UsageMetric
          label="Total"
          value={model.counts.total.toLocaleString()}
          detail="events indexed"
        />
        <UsageMetric
          label="Shown"
          value={model.counts.shown.toLocaleString()}
          detail="after filters"
        />
        <UsageMetric
          label="Info"
          value={model.counts.info.toLocaleString()}
          detail="info/success"
        />
        <UsageMetric
          label="Warning"
          value={model.counts.warning.toLocaleString()}
          detail="attention events"
        />
        <UsageMetric
          label="Error"
          value={model.counts.error.toLocaleString()}
          detail="failure events"
        />
        <UsageMetric
          label="Actions"
          value={model.counts.actionLike.toLocaleString()}
          detail="retained history"
        />
      </div>

      <section className="grid gap-3 border border-border bg-btn-bg p-3 xl:grid-cols-[minmax(220px,1fr)_160px_170px_220px_220px_auto]">
        <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
          Search
          <input
            className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
            value={filters.searchQuery}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder="Event, agent, project, provider..."
            aria-label="Search timeline"
          />
        </label>
        <TimelineFilterSelect
          label="Provider"
          value={filters.providerFilter}
          allLabel="All providers"
          options={model.providerOptions}
          onChange={onProviderFilterChange}
          ariaLabel="Filter timeline provider"
        />
        <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
          Severity
          <select
            className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
            value={filters.severityFilter}
            onChange={(event) =>
              onSeverityFilterChange(event.currentTarget.value as TimelineSeverityFilter)
            }
            aria-label="Filter timeline severity"
          >
            {(['all', 'info', 'success', 'warning', 'error'] as const).map((severity) => (
              <option key={severity} value={severity}>
                {timelineSeverityLabel(severity)}
              </option>
            ))}
          </select>
        </label>
        <TimelineFilterSelect
          label="Project"
          value={filters.projectFilter}
          allLabel="All projects"
          options={model.projectOptions}
          onChange={onProjectFilterChange}
          ariaLabel="Filter timeline project"
        />
        <TimelineFilterSelect
          label="Agent"
          value={filters.agentFilter}
          allLabel="All agents"
          options={model.agentOptions}
          onChange={onAgentFilterChange}
          ariaLabel="Filter timeline agent"
        />
        <div className="flex items-end">
          {model.hasFilters && (
            <Button variant="ghost" size="sm" className="h-34 px-4" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </section>

      <section className="border border-border bg-bg">
        <SectionHeader
          title="Event History"
          subtitle="Recent lifecycle and action events, newest first"
        />
        <div className="divide-y divide-border">
          {model.events.length === 0 ? (
            <TimelineEmptyState
              hasEvents={model.counts.total > 0}
              hasFilters={model.hasFilters}
              onClearFilters={onClearFilters}
            />
          ) : (
            model.events
              .slice(0, 120)
              .map((event) => <TimelineEventRow key={event.id} event={event} />)
          )}
        </div>
      </section>
    </div>
  );
}

function TimelineFilterSelect({
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
  options: Array<{ value: string; label: string; count: number }>;
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
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

function TimelineEmptyState({
  hasEvents,
  hasFilters,
  onClearFilters,
}: {
  hasEvents: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="p-8 text-center text-text-muted">
      <div className="text-lg text-accent-bright">
        {hasEvents ? 'No events match these filters' : 'No timeline events yet'}
      </div>
      <div className="mt-2 text-sm">
        {hasEvents
          ? 'Adjust search or filters to widen the event history.'
          : 'Lifecycle and action events will appear here as agents run.'}
      </div>
      {hasFilters && (
        <div className="mt-4">
          <Button variant="default" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineEventRow({ event }: { event: TimelinePageItem }) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-[98px_minmax(0,1.2fr)_minmax(180px,0.8fr)]">
      <div className="text-xs text-text-muted">{formatRelative(event.timestamp)}</div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${severityDot(event.severity)}`} />
          <TimelineSeverityPill severity={event.severity} />
          {event.isActionLike && <TimelineActionPill />}
          <span className="min-w-[120px] max-w-full truncate text-sm text-text">{event.title}</span>
        </div>
        {event.summary && (
          <div className="mt-1 break-words text-xs text-text-muted">{event.summary}</div>
        )}
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className="truncate">{event.kind}</span>
          <span>{event.source}</span>
          {event.sessionId && <span className="truncate">{event.sessionId}</span>}
          {event.runId && <span className="truncate">{event.runId}</span>}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ProviderBadge providerId={event.providerId} />
          <span className="truncate text-sm text-text">{event.agentName}</span>
          <span className="shrink-0 text-xs text-text-muted">#{event.agentId}</span>
        </div>
        <div className="mt-1 truncate text-xs text-text-muted">{event.project}</div>
      </div>
    </div>
  );
}

function TimelineSeverityPill({ severity }: { severity: TimelineSeverity }) {
  return (
    <span
      className={`shrink-0 border px-2 py-1 text-xs uppercase tracking-wide ${timelineSeverityClass(
        severity,
      )}`}
    >
      {timelineSeverityLabel(severity)}
    </span>
  );
}

function TimelineActionPill() {
  return (
    <span className="shrink-0 border border-accent bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-accent-bright">
      Action
    </span>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-border bg-btn-bg p-4">
      <div className="text-sm uppercase tracking-wide text-accent-bright">{title}</div>
      <div className="mt-1 text-xs text-text-muted">{subtitle}</div>
    </div>
  );
}

function UsageMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
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

function UsageInsightPanel({ insights }: { insights: UsageInsight[] }) {
  return (
    <section className="border border-border bg-bg">
      <SectionHeader title="Live Signals" subtitle="Local warnings from the current scope" />
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

function usageHistoryCopyLabel(status: 'idle' | 'copied' | 'failed'): string {
  if (status === 'copied') return 'CSV copied';
  if (status === 'failed') return 'Copy failed';
  return 'Redacted paths';
}

function formatProxyUsd(value: number): string {
  if (value <= 0) return '$0.0000';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
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

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy failed');
}

function UsageBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.max(value > 0 ? 2 : 0, (value / total) * 100)) : 0;

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

function SegmentedButtons<T extends string>({
  values,
  active,
  label,
  onChange,
}: {
  values: readonly T[];
  active: T;
  label: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((value) => (
        <Button
          key={value}
          variant={active === value ? 'active' : 'default'}
          size="sm"
          className="px-4"
          onClick={() => onChange(value)}
        >
          {label(value)}
        </Button>
      ))}
    </div>
  );
}

interface AgentStateCounts {
  total: number;
  active: number;
  paused: number;
  waiting: number;
  needsMe: number;
  error: number;
  hidden: number;
}

function AgentStateSummary({
  counts,
  shownCount,
  visibleCount,
}: {
  counts: AgentStateCounts;
  shownCount: number;
  visibleCount: number;
}) {
  const items = [
    { label: 'Shown', value: shownCount, tone: 'border-accent text-accent-bright' },
    { label: 'Visible', value: visibleCount, tone: 'border-border text-text' },
    { label: 'Needs me', value: counts.needsMe, tone: 'border-status-permission text-text' },
    { label: 'Error', value: counts.error, tone: 'border-status-error text-text' },
    { label: 'Active', value: counts.active, tone: 'border-status-active text-text' },
    { label: 'Paused', value: counts.paused, tone: 'border-status-permission text-text' },
    { label: 'Waiting', value: counts.waiting, tone: 'border-status-success text-text' },
    { label: 'Hidden', value: counts.hidden, tone: 'border-border text-text-muted' },
  ];

  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className={`border bg-bg p-3 ${item.tone}`}>
          <div className="text-xs uppercase tracking-wide text-text-muted">{item.label}</div>
          <div className="mt-1 text-lg text-accent-bright">{item.value}</div>
        </div>
      ))}
      {counts.total === 0 && (
        <div className="border border-border bg-btn-bg p-3 text-sm text-text-muted">
          No active agents are currently tracked.
        </div>
      )}
    </div>
  );
}

function AgentListEmptyState({
  hasFilters,
  hiddenCount,
  showHiddenAgents,
  totalAgents,
  visibleCount,
  onClearFilters,
  onShowHidden,
}: {
  hasFilters: boolean;
  hiddenCount: number;
  showHiddenAgents: boolean;
  totalAgents: number;
  visibleCount: number;
  onClearFilters: () => void;
  onShowHidden: () => void;
}) {
  const message =
    totalAgents === 0
      ? 'No agents yet.'
      : visibleCount === 0 && hiddenCount > 0 && !showHiddenAgents
        ? 'Only hidden agents are currently available.'
        : 'No agents match these filters.';

  return (
    <div className="p-8 text-center text-text-muted">
      <div className="text-lg text-accent-bright">{message}</div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {hasFilters && (
          <Button variant="default" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
        {hiddenCount > 0 && !showHiddenAgents && (
          <Button variant="default" size="sm" onClick={onShowHidden}>
            Show hidden
          </Button>
        )}
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={agentRowClass(agent, isSelected)} onClick={onSelect}>
      <div className="hidden pt-1 sm:block">
        <span className={`block h-14 w-3 ${attentionColor(agent)}`} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ProviderBadge providerId={agent.providerId} />
          <AttentionBadge agent={agent} />
        </div>
        <div className="mt-2 flex min-w-0 items-baseline gap-2">
          <span className="truncate text-lg text-accent-bright">{agent.name}</span>
          <span className="shrink-0 text-xs text-text-muted">#{agent.id}</span>
        </div>
        {agent.teamName && (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="truncate border border-border bg-btn-bg px-2 py-1">
              {agent.teamName}
            </span>
            <span>{agent.isTeamLead ? 'Lead' : (agent.roleName ?? 'Member')}</span>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-text-muted">Project</div>
        <div className="mt-1 truncate text-sm text-text">{agent.project}</div>
        {agent.projectDir && (
          <div className="mt-1 truncate text-xs text-text-muted" title={agent.projectDir}>
            {agent.projectDir}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-text-muted">Activity</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge status={agent.status} />
          {agent.isPaused && <PausedMarker />}
          {agent.hidden && <HiddenMarker />}
        </div>
        <div className="mt-2 truncate text-sm text-text">{agent.activity}</div>
        {agent.updatedAt !== undefined && agent.updatedAt > 0 && (
          <div className="mt-1 text-xs text-text-muted">
            Updated {formatRelative(agent.updatedAt)}
          </div>
        )}
      </div>
      <div className="min-w-[86px] text-left text-xs text-text-muted sm:text-right">
        <div className="text-xs uppercase tracking-wide text-text-muted">Tokens</div>
        <div className="mt-1 text-sm text-accent-bright">
          {agent.tokens > 0 ? compactNumber(agent.tokens) : 'None'}
        </div>
        <TokenAccuracyLabel estimated={agent.tokenUsageEstimated} />
      </div>
    </button>
  );
}

function agentRowClass(agent: AgentSummary, isSelected: boolean): string {
  const base =
    'grid w-full gap-3 border-l-4 p-3 text-left hover:bg-btn-hover sm:grid-cols-[18px_minmax(170px,1.15fr)_minmax(130px,0.9fr)_minmax(150px,1fr)_90px]';
  const selected = isSelected ? 'bg-active-bg' : 'bg-bg';
  return `${base} ${selected} ${agentRowBorder(agent)} ${agent.hidden ? 'opacity-70' : ''}`;
}

function agentRowBorder(agent: AgentSummary): string {
  if (agent.hidden) return 'border-l-border';
  if (agent.statusGroup === 'needs_me') return 'border-l-status-permission';
  if (agent.statusGroup === 'error') return 'border-l-status-error';
  if (agent.isPaused || agent.statusGroup === 'paused') return 'border-l-status-permission';
  if (agent.statusGroup === 'active') return 'border-l-status-active';
  return 'border-l-status-success';
}

function AttentionBadge({ agent }: { agent: AgentSummary }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 border px-2 py-1 text-xs uppercase tracking-wide ${attentionBadgeClass(
        agent,
      )}`}
    >
      <span className={`h-2 w-2 shrink-0 ${attentionColor(agent)}`} />
      <span>{attentionLabel(agent)}</span>
    </span>
  );
}

function attentionBadgeClass(agent: AgentSummary): string {
  if (agent.hidden) return 'border-border bg-btn-bg text-text-muted';
  if (agent.statusGroup === 'needs_me') return 'border-status-permission bg-btn-bg text-text';
  if (agent.statusGroup === 'error') return 'border-status-error bg-btn-bg text-text';
  if (agent.isPaused || agent.statusGroup === 'paused') {
    return 'border-status-permission bg-btn-bg text-text';
  }
  if (agent.statusGroup === 'active') return 'border-status-active bg-btn-bg text-text';
  return 'border-status-success bg-btn-bg text-text-muted';
}

function attentionColor(agent: AgentSummary): string {
  if (agent.hidden) return 'bg-border';
  if (agent.statusGroup === 'needs_me') return 'bg-status-permission';
  if (agent.statusGroup === 'error') return 'bg-status-error';
  if (agent.isPaused || agent.statusGroup === 'paused') return 'bg-status-permission';
  if (agent.statusGroup === 'active') return 'bg-status-active';
  return 'bg-status-success';
}

function attentionLabel(agent: AgentSummary): string {
  if (agent.hidden) return 'Hidden';
  if (agent.statusGroup === 'needs_me') return 'Needs me';
  if (agent.statusGroup === 'error') return 'Error';
  if (agent.isPaused || agent.statusGroup === 'paused') return 'Paused';
  if (agent.statusGroup === 'active') return 'Active';
  return 'Waiting';
}

function TokenAccuracyLabel({ estimated }: { estimated: boolean }) {
  return (
    <div className="mt-1 truncate text-xs text-text-muted">{estimated ? 'Estimated' : 'Exact'}</div>
  );
}

function ProjectDashboard({
  projects,
  activeProject,
  onProjectChange,
  onOpenProject,
}: {
  projects: ProjectSummary[];
  activeProject: ProjectFilter;
  onProjectChange: (project: ProjectFilter) => void;
  onOpenProject: (projectDir: string) => void;
}) {
  if (projects.length === 0) return null;

  const totalAgents = projects.reduce((sum, project) => sum + project.agentCount, 0);
  const totalTokens = projects.reduce((sum, project) => sum + project.tokens, 0);

  return (
    <div className="mb-4 border border-border">
      <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
        <button
          type="button"
          className={`border-b border-border p-4 text-left md:border-b-0 md:border-r ${
            activeProject === 'all' ? 'bg-active-bg' : 'bg-bg hover:bg-btn-hover'
          }`}
          onClick={() => onProjectChange('all')}
        >
          <div className="text-xs uppercase tracking-wide text-text-muted">All projects</div>
          <div className="mt-1 text-lg text-accent-bright">{totalAgents} agents</div>
          <div className="mt-1 text-xs text-text-muted">{compactNumber(totalTokens)} tokens</div>
        </button>
        <div className="grid max-h-[180px] overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.project}
              className={`min-w-0 border-b border-r border-border p-4 text-left hover:bg-btn-hover ${
                activeProject === project.project ? 'bg-active-bg' : 'bg-bg'
              }`}
            >
              <button
                type="button"
                className="block w-full min-w-0 text-left"
                onClick={() => onProjectChange(project.project)}
              >
                <div className="truncate text-sm text-accent-bright">{project.project}</div>
                <div className="mt-1 text-xs text-text-muted">
                  {project.agentCount} agents · {compactNumber(project.tokens)} tokens
                </div>
              </button>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                {project.activeCount > 0 && <span>{project.activeCount} active</span>}
                {project.waitingCount > 0 && <span>{project.waitingCount} waiting</span>}
                {project.needsMeCount > 0 && <span>{project.needsMeCount} needs me</span>}
                {project.errorCount > 0 && <span>{project.errorCount} error</span>}
              </div>
              {project.projectDir && (
                <Button
                  variant="default"
                  size="sm"
                  className="mt-3 px-5"
                  onClick={() => onOpenProject(project.projectDir!)}
                  title={project.projectDir}
                >
                  Open Project
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamDashboard({
  teams,
  activeTeam,
  onTeamChange,
}: {
  teams: TeamSummary[];
  activeTeam: TeamFilter;
  onTeamChange: (team: TeamFilter) => void;
}) {
  if (teams.length === 0) return null;

  const totalMembers = teams.reduce((sum, team) => sum + team.memberCount, 0);

  return (
    <div className="mb-4 border border-border">
      <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
        <button
          type="button"
          className={`border-b border-border p-4 text-left md:border-b-0 md:border-r ${
            activeTeam === 'all' ? 'bg-active-bg' : 'bg-bg hover:bg-btn-hover'
          }`}
          onClick={() => onTeamChange('all')}
        >
          <div className="text-xs uppercase tracking-wide text-text-muted">All teams</div>
          <div className="mt-1 text-lg text-accent-bright">{teams.length} teams</div>
          <div className="mt-1 text-xs text-text-muted">{totalMembers} members</div>
        </button>
        <div className="grid max-h-[160px] overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <div
              key={team.teamName}
              className={`min-w-0 border-b border-r border-border p-4 ${
                activeTeam === team.teamName ? 'bg-active-bg' : 'bg-bg hover:bg-btn-hover'
              }`}
            >
              <button
                type="button"
                className="block w-full min-w-0 text-left"
                onClick={() => onTeamChange(team.teamName)}
              >
                <div className="truncate text-sm text-accent-bright">{team.teamName}</div>
                <div className="mt-1 truncate text-xs text-text-muted">
                  {team.memberCount} members · {compactNumber(team.tokens)} tokens
                </div>
                {team.leadName && (
                  <div className="mt-1 truncate text-xs text-text-muted">Lead: {team.leadName}</div>
                )}
                {team.projects.length > 0 && (
                  <div className="mt-1 truncate text-xs text-text-muted">
                    {team.projects.slice(0, 2).join(', ')}
                    {team.projects.length > 2 ? ` +${team.projects.length - 2}` : ''}
                  </div>
                )}
              </button>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                {team.activeCount > 0 && <span>{team.activeCount} active</span>}
                {team.needsMeCount > 0 && <span>{team.needsMeCount} needs me</span>}
                {team.errorCount > 0 && <span>{team.errorCount} error</span>}
              </div>
              {team.leadAgentId !== undefined && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="px-5"
                    onClick={() => vscode.postMessage({ type: 'focusAgent', id: team.leadAgentId })}
                  >
                    Focus Lead
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="px-5"
                    onClick={() => onTeamChange(team.teamName)}
                  >
                    View Team
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentDetail({
  agent,
  lifecycle,
  timeline,
  teamMembers,
  onCloseAgent,
  onPauseAgent,
  onResumeAgent,
}: {
  agent?: AgentSummary;
  lifecycle?: AgentLifecycleState;
  timeline: TimelineItem[];
  teamMembers: AgentSummary[];
  onCloseAgent: (id: number) => void;
  onPauseAgent: (id: number) => void;
  onResumeAgent: (id: number) => void;
}) {
  if (!agent) {
    return <div className="p-8 text-center text-text-muted">Select an agent to inspect</div>;
  }

  const lastEvent = timeline[0];

  return (
    <div className="bg-bg p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <ProviderBadge providerId={agent.providerId} />
            <h3 className="max-w-full truncate text-xl text-accent-bright">{agent.name}</h3>
          </div>
          <div className="mt-1 truncate text-sm text-text-muted">{agent.project}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => vscode.postMessage({ type: 'focusAgent', id: agent.id })}
          >
            Focus
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!agent.projectDir}
            onClick={() => vscode.postMessage({ type: 'openAgentProject', id: agent.id })}
          >
            Project
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!agent.transcriptPath}
            onClick={() => vscode.postMessage({ type: 'openAgentTranscript', id: agent.id })}
          >
            Transcript
          </Button>
          <Button
            variant={agent.isPaused ? 'active' : 'default'}
            size="sm"
            onClick={() => (agent.isPaused ? onResumeAgent(agent.id) : onPauseAgent(agent.id))}
          >
            {pauseActionLabel(agent.isPaused)}
          </Button>
          <Button variant="default" size="sm" onClick={() => onCloseAgent(agent.id)}>
            Actions
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DetailField label="Lifecycle status" value={agent.status} badge />
        <DetailField label="Paused" value={agent.isPaused ? 'Yes' : 'No'} />
        <DetailField label="Hidden" value={agent.hidden ? 'Yes' : 'No'} />
        <DetailField label="Provider" value={providerLabel(agent.providerId)} />
        <DetailField label="Project" value={agent.project} />
        <DetailField label="Current activity" value={agent.activity} />
        <DetailField label="Last event" value={lastEvent?.title ?? 'No recent events'} />
        <DetailField label="Zone" value={`${agent.zone} (${zoneSourceLabel(agent.zoneSource)})`} />
        {agent.updatedAt !== undefined && agent.updatedAt > 0 && (
          <DetailField label="Updated" value={formatRelative(agent.updatedAt)} />
        )}
        {agent.sessionId && <DetailField label="Session" value={agent.sessionId} />}
        {agent.teamName && <DetailField label="Team" value={agent.teamName} />}
        {agent.teamName && (
          <DetailField
            label="Team role"
            value={agent.isTeamLead ? 'Lead' : (agent.roleName ?? 'Member')}
          />
        )}
      </div>

      {(agent.projectDir || agent.transcriptPath) && (
        <div className="mt-4 grid gap-3">
          {agent.projectDir && <DetailField label="Project path" value={agent.projectDir} wrap />}
          {agent.transcriptPath && (
            <DetailField label="Transcript" value={agent.transcriptPath} wrap />
          )}
        </div>
      )}

      {agent.detail && (
        <div className="mt-4 border border-border bg-btn-bg p-3 text-sm text-text-muted">
          <div className="text-xs uppercase tracking-wide">Detail</div>
          <div className="mt-1 break-words text-text">{agent.detail}</div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <TokenBox label="Input" value={agent.inputTokens} />
        <TokenBox label="Output" value={agent.outputTokens} />
        {agent.tokenUsageDetails && agent.tokenUsageDetails.reasoningOutput > 0 && (
          <TokenBox label="Reasoning" value={agent.tokenUsageDetails.reasoningOutput} />
        )}
        {agent.tokenUsageDetails &&
          (agent.tokenUsageDetails.cacheRead > 0 || agent.tokenUsageDetails.cacheWrite > 0) && (
            <TokenBox
              label="Cache"
              value={agent.tokenUsageDetails.cacheRead + agent.tokenUsageDetails.cacheWrite}
            />
          )}
        <TokenBox label="Artifact" value={agent.artifactOutputTokens} />
        <TokenBox label="Total" value={agent.tokens} />
      </div>
      <div className="mt-2 text-xs text-text-muted">
        {agent.tokenUsageEstimated
          ? 'Includes estimated transcript tokens; API proxy cost is not actual billing.'
          : 'Provider-reported usage when available; API proxy cost is not actual billing.'}
        {agent.artifactOutputTokens > 0
          ? ' Artifact is generated code/patch estimate and is not included in billing proxy total.'
          : ''}
        {agent.codexRateLimit ? ` ${formatRateLimit(agent.codexRateLimit)}` : ''}
      </div>

      {teamMembers.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs uppercase tracking-wide text-text-muted">Team roster</div>
          <div className="divide-y divide-border border border-border">
            {teamMembers
              .slice()
              .sort(compareTeamMembers)
              .map((member) => (
                <div
                  key={member.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 ${
                    member.id === agent.id ? 'bg-active-bg' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <ProviderBadge providerId={member.providerId} />
                      <span className="truncate text-sm text-text">{member.name}</span>
                      <span className="shrink-0 text-xs text-text-muted">#{member.id}</span>
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
                      <span>{member.isTeamLead ? 'Lead' : (member.roleName ?? 'Member')}</span>
                      <span>{member.status}</span>
                      {member.tokens > 0 && <span>{compactNumber(member.tokens)} tokens</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="px-5"
                      onClick={() => vscode.postMessage({ type: 'focusAgent', id: member.id })}
                    >
                      Focus
                    </Button>
                    {member.projectDir && (
                      <Button
                        variant="default"
                        size="sm"
                        className="px-5"
                        onClick={() =>
                          vscode.postMessage({ type: 'openAgentProject', id: member.id })
                        }
                      >
                        Project
                      </Button>
                    )}
                    {member.transcriptPath && (
                      <Button
                        variant="default"
                        size="sm"
                        className="px-5"
                        onClick={() =>
                          vscode.postMessage({ type: 'openAgentTranscript', id: member.id })
                        }
                      >
                        Log
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-wide text-text-muted">Recent timeline</div>
          {lifecycle?.updatedAt && (
            <div className="text-xs text-text-muted">
              Updated {formatRelative(lifecycle.updatedAt)}
            </div>
          )}
        </div>
        <div className="divide-y divide-border border border-border">
          {timeline.length === 0 ? (
            <div className="p-4 text-sm text-text-muted">No timeline events yet</div>
          ) : (
            timeline.slice(0, 8).map((event) => (
              <div key={event.id} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 p-3">
                <div className="text-xs text-text-muted">{formatRelative(event.timestamp)}</div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${severityDot(event.severity)}`}
                    />
                    <span className="truncate text-sm text-text">{event.title}</span>
                  </div>
                  {event.summary && (
                    <div className="mt-1 break-words text-xs text-text-muted">{event.summary}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  badge = false,
  wrap = false,
}: {
  label: string;
  value: string;
  badge?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="min-w-0 border border-border bg-btn-bg p-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-1 min-w-0 text-sm text-text ${wrap ? 'break-words' : 'truncate'}`}>
        {badge ? <StatusBadge status={value} /> : value}
      </div>
    </div>
  );
}

function TokenBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-btn-bg p-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 truncate text-lg text-accent-bright">{value.toLocaleString()}</div>
    </div>
  );
}

function getAgentSummary(
  id: number,
  tools: ToolActivity[],
  status: string | undefined,
  lifecycle: AgentLifecycleState | undefined,
  metadata: AgentRuntimeMetadata | undefined,
  hidden: boolean,
  officeState: OfficeState,
  timelineEvents: AgentTimelineEvent[],
): AgentSummary {
  const ch = officeState.characters.get(id);
  const activeTool =
    tools.find((tool) => tool.permissionWait && !tool.done) ?? tools.find((tool) => !tool.done);
  const lastTool = tools.length > 0 ? tools[tools.length - 1] : undefined;
  const displayStatus = activeTool?.permissionWait
    ? 'needs approval'
    : (lifecycle?.status ?? status ?? (ch?.isActive ? 'active' : 'waiting'));
  const activity =
    lifecycle?.label ??
    activeTool?.status ??
    lastTool?.status ??
    (displayStatus === 'waiting' ? 'Idle' : 'Working');
  const inputTokens = ch?.inputTokens ?? 0;
  const outputTokens = ch?.outputTokens ?? 0;
  const artifactOutputTokens = ch?.artifactOutputTokens ?? 0;
  const zone = ch
    ? inferAgentZone(ch, officeState.getLayout(), officeState.seats)
    : { zone: 'work' as const, source: 'default-split' as const };
  const recentTimeline = timelineEvents.filter((event) => event.agentId === id).slice(0, 4);
  const sessionId =
    recentTimeline.find((event) => event.sessionId)?.sessionId ??
    sessionIdFromTranscriptPath(metadata?.transcriptPath);
  const recentEventText = recentTimeline
    .map((event) =>
      [event.title, event.summary, event.kind, event.sessionId, event.runId, event.projectName]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ');

  return {
    id,
    name: ch?.agentName ?? `Agent #${id}`,
    project: ch?.folderName ?? 'Unknown project',
    providerId: ch?.providerId ?? 'claude',
    status: displayStatus,
    statusGroup: getStatusGroup(displayStatus),
    activity,
    detail: lifecycle?.detail,
    updatedAt: lifecycle?.updatedAt,
    tokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    artifactOutputTokens,
    tokenUsageEstimated:
      ch?.tokenUsageEstimated === true || ch?.tokenUsageDetails?.estimated === true,
    tokenUsageDetails: ch?.tokenUsageDetails,
    codexRateLimit: ch?.codexRateLimit,
    zone: zone.zone,
    zoneSource: zone.source,
    projectDir: metadata?.projectDir,
    transcriptPath: metadata?.transcriptPath,
    sessionId,
    recentEventText,
    teamName: ch?.teamName,
    roleName: ch?.agentName,
    isTeamLead: ch?.isTeamLead,
    leadAgentId: ch?.leadAgentId,
    isPaused: isPausedStatus(lifecycle?.status),
    hidden,
  };
}

interface TimelineItem {
  id: string;
  timestamp: number;
  title: string;
  summary?: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
}

function buildAgentTimeline(
  agentId: number,
  timelineEvents: AgentTimelineEvent[],
  lifecycleEvents: AgentLifecycleEvent[],
): TimelineItem[] {
  const timeline = timelineEvents
    .filter((event) => event.agentId === agentId)
    .map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      title: event.title,
      summary: event.summary ?? event.kind,
      severity: event.severity,
    }));

  if (timeline.length > 0) {
    return timeline.sort((a, b) => b.timestamp - a.timestamp);
  }

  return lifecycleEvents
    .filter((event) => event.id === agentId)
    .map((event, index) => ({
      id: `${event.receivedAt}-${event.id}-${index}`,
      timestamp: event.receivedAt,
      title: event.label,
      summary: [event.status, event.detail].filter(Boolean).join(' · '),
      severity: event.severity,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function getStatusGroup(status: string): AgentListStatusGroup {
  if (status === 'paused') return 'paused';
  if (status === 'error') return 'error';
  if (status === 'needs approval' || status === 'waiting_permission' || status === 'waiting_user') {
    return 'needs_me';
  }
  if (status === 'active' || status === 'thinking' || status === 'tool_running') return 'active';
  return 'waiting';
}

function sessionIdFromTranscriptPath(transcriptPath: string | undefined): string | undefined {
  const fileName = transcriptPath?.split(/[\\/]/).filter(Boolean).pop();
  return fileName?.replace(/\.(jsonl|log|txt)$/i, '');
}

function getAgentStateCounts(agents: AgentSummary[]): AgentStateCounts {
  const counts: AgentStateCounts = {
    total: agents.length,
    active: 0,
    paused: 0,
    waiting: 0,
    needsMe: 0,
    error: 0,
    hidden: 0,
  };
  for (const agent of agents) {
    if (agent.hidden) {
      counts.hidden += 1;
      continue;
    }
    if (agent.isPaused || agent.statusGroup === 'paused') {
      counts.paused += 1;
    } else if (agent.statusGroup === 'needs_me') {
      counts.needsMe += 1;
    } else if (agent.statusGroup === 'error') {
      counts.error += 1;
    } else if (agent.statusGroup === 'active') {
      counts.active += 1;
    } else {
      counts.waiting += 1;
    }
  }
  return counts;
}

function getProjectSummaries(agents: AgentSummary[]): ProjectSummary[] {
  const projects = new Map<string, ProjectSummary>();
  for (const agent of agents) {
    const project = projects.get(agent.project) ?? {
      project: agent.project,
      projectDir: agent.projectDir,
      agentCount: 0,
      activeCount: 0,
      waitingCount: 0,
      needsMeCount: 0,
      errorCount: 0,
      tokens: 0,
    };
    project.agentCount += 1;
    project.tokens += agent.tokens;
    if (!project.projectDir && agent.projectDir) project.projectDir = agent.projectDir;
    if (agent.statusGroup === 'active') project.activeCount += 1;
    if (agent.statusGroup === 'waiting') project.waitingCount += 1;
    if (agent.statusGroup === 'needs_me') project.needsMeCount += 1;
    if (agent.statusGroup === 'error') project.errorCount += 1;
    projects.set(agent.project, project);
  }
  return [...projects.values()].sort((a, b) => {
    const byActive =
      b.activeCount +
      b.needsMeCount +
      b.errorCount -
      (a.activeCount + a.needsMeCount + a.errorCount);
    if (byActive !== 0) return byActive;
    return a.project.localeCompare(b.project);
  });
}

function getTeamSummaries(agents: AgentSummary[]): TeamSummary[] {
  const teams = new Map<string, TeamSummary>();
  for (const agent of agents) {
    if (!agent.teamName) continue;
    const team = teams.get(agent.teamName) ?? {
      teamName: agent.teamName,
      memberCount: 0,
      activeCount: 0,
      needsMeCount: 0,
      errorCount: 0,
      tokens: 0,
      projects: [],
    };
    team.memberCount += 1;
    team.tokens += agent.tokens;
    if (!team.projects.includes(agent.project)) team.projects.push(agent.project);
    if (agent.isTeamLead || team.leadAgentId === undefined) {
      const leadId = agent.isTeamLead ? agent.id : agent.leadAgentId;
      if (leadId !== undefined) team.leadAgentId = leadId;
      if (agent.isTeamLead) team.leadName = agent.name;
    }
    if (agent.statusGroup === 'active') team.activeCount += 1;
    if (agent.statusGroup === 'needs_me') team.needsMeCount += 1;
    if (agent.statusGroup === 'error') team.errorCount += 1;
    teams.set(agent.teamName, team);
  }
  return [...teams.values()].sort((a, b) => {
    const byAttention =
      b.activeCount +
      b.needsMeCount +
      b.errorCount -
      (a.activeCount + a.needsMeCount + a.errorCount);
    if (byAttention !== 0) return byAttention;
    return a.teamName.localeCompare(b.teamName);
  });
}

function compareTeamMembers(a: AgentSummary, b: AgentSummary): number {
  if (a.isTeamLead && !b.isTeamLead) return -1;
  if (!a.isTeamLead && b.isTeamLead) return 1;
  if (a.statusGroup === 'needs_me' && b.statusGroup !== 'needs_me') return -1;
  if (a.statusGroup !== 'needs_me' && b.statusGroup === 'needs_me') return 1;
  if (a.statusGroup === 'active' && b.statusGroup !== 'active') return -1;
  if (a.statusGroup !== 'active' && b.statusGroup === 'active') return 1;
  return a.name.localeCompare(b.name);
}

function statusFilterLabel(filter: StatusFilter): string {
  if (filter === 'needs_me') return 'Needs me';
  return filter[0].toUpperCase() + filter.slice(1);
}

function PausedMarker() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 border border-status-permission bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted"
      title="Paused"
    >
      <span className="font-bold">||</span>
      <span>Paused</span>
    </span>
  );
}

function HiddenMarker() {
  return (
    <span
      className="inline-flex shrink-0 border border-border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted"
      title="Hidden"
    >
      Hidden
    </span>
  );
}

function ProviderBadge({ providerId }: { providerId: string }) {
  return (
    <span className="shrink-0 border border-border bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
      {providerLabel(providerId)}
    </span>
  );
}

function providerLabel(providerId: string): string {
  if (providerId === 'codex') return 'Codex';
  if (providerId === 'claude') return 'Claude';
  return providerId;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'needs approval' || status === 'waiting_permission' || status === 'waiting_user'
      ? 'bg-status-permission'
      : status === 'active' || status === 'thinking' || status === 'tool_running'
        ? 'bg-status-active'
        : status === 'paused'
          ? 'bg-status-permission'
          : status === 'error'
            ? 'bg-status-error'
            : 'bg-status-success';
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
      <span className={`h-3 w-3 shrink-0 rounded-full ${color}`} />
      <span className="truncate">{status}</span>
    </span>
  );
}

function severityDot(severity?: 'info' | 'success' | 'warning' | 'error'): string {
  if (severity === 'error') return 'bg-status-error';
  if (severity === 'warning') return 'bg-status-permission';
  if (severity === 'success') return 'bg-status-success';
  return 'bg-status-active';
}

function timelineSeverityClass(severity: TimelineSeverity): string {
  if (severity === 'error') return 'border-status-error bg-bg text-status-error';
  if (severity === 'warning') return 'border-status-permission bg-bg text-status-permission';
  if (severity === 'success') return 'border-status-success bg-bg text-status-success';
  return 'border-status-active bg-bg text-status-active';
}

function usageInsightClass(severity: UsageInsight['severity']): string {
  if (severity === 'error') return 'bg-bg border-l-4 border-l-status-error';
  if (severity === 'warning') return 'bg-bg border-l-4 border-l-status-permission';
  return 'bg-bg';
}

function usageInsightDotClass(severity: UsageInsight['severity']): string {
  if (severity === 'error') return 'bg-status-error';
  if (severity === 'warning') return 'bg-status-permission';
  return 'bg-status-active';
}

function usageAccuracyShort(accuracy: UsageAccuracy): string {
  if (accuracy === 'exact') return 'Exact';
  if (accuracy === 'estimated') return 'Estimated';
  if (accuracy === 'mixed') return 'Mixed';
  return 'None';
}

function usageAccuracyClass(accuracy: UsageAccuracy): string {
  if (accuracy === 'exact') return 'border-status-success bg-btn-bg text-text';
  if (accuracy === 'estimated') return 'border-status-permission bg-btn-bg text-text';
  if (accuracy === 'mixed') return 'border-status-active bg-btn-bg text-text';
  return 'border-border bg-btn-bg text-text-muted';
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return value.toLocaleString();
}

function formatRateLimit(limit: TokenRateLimitSnapshot): string {
  const percent =
    limit.usedPercent !== undefined
      ? `${Math.round(limit.usedPercent)}% quota used`
      : limit.remainingPercent !== undefined
        ? `${Math.round(limit.remainingPercent)}% quota remaining`
        : 'quota snapshot available';
  const reset = rateLimitResetText(limit);
  return reset ? `Codex ${percent}; resets ${reset}.` : `Codex ${percent}.`;
}

function rateLimitResetText(limit: TokenRateLimitSnapshot): string | undefined {
  let seconds: number | undefined;
  if (limit.resetAfterSeconds !== undefined) {
    seconds = limit.resetAfterSeconds;
  } else if (limit.resetAtMs !== undefined) {
    seconds = Math.max(0, Math.round((limit.resetAtMs - Date.now()) / 1000));
  }
  if (seconds === undefined) return undefined;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 2) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
