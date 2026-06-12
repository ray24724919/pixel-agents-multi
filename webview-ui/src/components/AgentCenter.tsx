import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from 'react';

import { TIMELINE_REPLAY_BASE_INTERVAL_MS } from '../constants.js';
import type {
  AgentLifecycleEvent,
  AgentLifecycleState,
  AgentRuntimeMetadata,
  AgentTimelineEvent,
  SubagentCharacter,
  TimelineHistoryState,
  UsageHistoryState,
} from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { inferAgentZone } from '../office/zoneUtils.js';
import { vscode } from '../vscodeApi.js';
import { isWorkingStatusGroup } from './agentCenter/agentOrdering.js';
import {
  AgentDetail,
  AgentListEmptyState,
  AgentRow,
  AgentStateSummary,
  ProjectDashboard,
  TeamDashboard,
} from './agentCenter/AgentsPanels.js';
import { providerLabel } from './agentCenter/formatters.js';
import { timelineHistoryStatusText } from './agentCenter/handoffLabels.js';
import { HandoffArtifactLibraryPanel, HandoffDraftPanel } from './agentCenter/HandoffPanels.js';
import { SectionHeader } from './agentCenter/SectionHeader.js';
import { SegmentedButtons } from './agentCenter/SegmentedButtons.js';
import {
  TimelineEmptyState,
  TimelineEventRow,
  TimelineFilterSelect,
} from './agentCenter/TimelineEventPanel.js';
import { TimelineReplayPanel } from './agentCenter/TimelineReplayPanel.js';
import type {
  AgentStateCounts,
  AgentSummary,
  ProjectFilter,
  ProjectSummary,
  ProviderFilter,
  StatusFilter,
  TeamFilter,
  TeamSummary,
  TimelineItem,
} from './agentCenter/types.js';
import { UsageDashboard, UsageMetric } from './agentCenter/UsagePanels.js';
import { useHandoffWorkflow } from './agentCenter/useHandoffWorkflow.js';
import { isAgentVisibleWithHiddenToggle } from './agentCenterFilters.js';
import {
  AGENT_LIST_SORT_OPTIONS,
  type AgentListSortKey,
  agentListSortLabel,
  type AgentListStatusGroup,
  filterAndSortAgentList,
} from './agentCenterListModel.js';
import type { AgentCenterPage } from './agentCenterPages.js';
import {
  buildDelegationSummaries,
  delegationStatusLabel,
  type DelegationSummary,
  delegationTotalCount,
  delegationWorkerLabel,
} from './delegationModel.js';
import { isPausedStatus } from './pauseResume.js';
import {
  buildTimelinePageItems,
  buildTimelinePageModel,
  type TimelineCategoryFilter,
  timelineCategoryLabel,
  type TimelinePageFilters,
  type TimelinePageItem,
  type TimelinePageModel,
  type TimelineSeverityFilter,
  timelineSeverityLabel,
  type TimelineTimeWindowFilter,
  timelineTimeWindowLabel,
} from './timelinePageModel.js';
import {
  buildTimelineReplaySessions,
  findTimelineReplayFrameByEventId,
  getTimelineReplayFrameMarker,
  resolveTimelineReplaySelection,
} from './timelineReplayModel.js';
import { Button } from './ui/Button.js';

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
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  hiddenAgents: Record<number, boolean>;
  showHiddenAgents: boolean;
  onShowHiddenAgentsChange: (show: boolean) => void;
  officeState: OfficeState;
  onCloseAgent: (id: number) => void;
  onPauseAgent: (id: number) => void;
  onResumeAgent: (id: number) => void;
  usageHistory: UsageHistoryState;
  timelineHistory: TimelineHistoryState;
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
  subagentTools,
  subagentCharacters,
  hiddenAgents,
  showHiddenAgents,
  onShowHiddenAgentsChange,
  officeState,
  onCloseAgent,
  onPauseAgent,
  onResumeAgent,
  usageHistory,
  timelineHistory,
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
  const [timelineCategoryFilter, setTimelineCategoryFilter] =
    useState<TimelineCategoryFilter>('all');
  const [timelineKindFilter, setTimelineKindFilter] = useState<'all' | string>('all');
  const [timelineTimeWindow, setTimelineTimeWindow] = useState<TimelineTimeWindowFilter>('all');
  const [detailAgentId, setDetailAgentId] = useState<number | null>(selectedAgent);

  const baseSummaries = useMemo(
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
  const delegationSummaries = useMemo(
    () =>
      buildDelegationSummaries({
        agents: baseSummaries,
        subagentCharacters,
        subagentTools,
        parentTools: agentTools,
      }),
    [agentTools, baseSummaries, subagentCharacters, subagentTools],
  );
  const summaries = useMemo(
    () =>
      baseSummaries.map((agent) =>
        applyDelegationSummary(agent, delegationSummaries.get(agent.id)),
      ),
    [baseSummaries, delegationSummaries],
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
      categoryFilter: timelineCategoryFilter,
      kindFilter: timelineKindFilter,
      timeWindow: timelineTimeWindow,
      searchQuery: timelineSearchQuery,
    }),
    [
      timelineAgentFilter,
      timelineCategoryFilter,
      timelineKindFilter,
      timelineProjectFilter,
      timelineProviderFilter,
      timelineSearchQuery,
      timelineSeverityFilter,
      timelineTimeWindow,
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
    setTimelineCategoryFilter('all');
    setTimelineKindFilter('all');
    setTimelineTimeWindow('all');
    setTimelineSearchQuery('');
  };

  const refreshAgentCenter = () => {
    vscode.postMessage({ type: 'refreshAgents' });
  };

  const refreshTimelineHistory = () => {
    vscode.postMessage({ type: 'refreshTimelineHistory' });
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
                values={[
                  'all',
                  'needs_me',
                  'error',
                  'delegating',
                  'active',
                  'paused',
                  'waiting',
                  'hidden',
                ]}
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
            onCategoryFilterChange={setTimelineCategoryFilter}
            onKindFilterChange={setTimelineKindFilter}
            onTimeWindowChange={setTimelineTimeWindow}
            onClearFilters={clearTimelineFilters}
            timelineHistory={timelineHistory}
            onRefreshHistory={refreshTimelineHistory}
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

function TimelineDashboard({
  agents,
  model,
  filters,
  onSearchChange,
  onProviderFilterChange,
  onSeverityFilterChange,
  onProjectFilterChange,
  onAgentFilterChange,
  onCategoryFilterChange,
  onKindFilterChange,
  onTimeWindowChange,
  onClearFilters,
  timelineHistory,
  onRefreshHistory,
}: {
  agents: AgentSummary[];
  model: TimelinePageModel;
  filters: TimelinePageFilters;
  onSearchChange: (query: string) => void;
  onProviderFilterChange: (provider: 'all' | string) => void;
  onSeverityFilterChange: (severity: TimelineSeverityFilter) => void;
  onProjectFilterChange: (project: 'all' | string) => void;
  onAgentFilterChange: (agent: 'all' | string) => void;
  onCategoryFilterChange: (category: TimelineCategoryFilter) => void;
  onKindFilterChange: (kind: 'all' | string) => void;
  onTimeWindowChange: (timeWindow: TimelineTimeWindowFilter) => void;
  onClearFilters: () => void;
  timelineHistory: TimelineHistoryState;
  onRefreshHistory: () => void;
}) {
  const activeCount = agents.filter((agent) => agent.statusGroup === 'active').length;
  const needsMeCount = agents.filter((agent) => agent.statusGroup === 'needs_me').length;
  const errorCount = agents.filter((agent) => agent.statusGroup === 'error').length;
  const historyStatus = timelineHistoryStatusText(timelineHistory);
  const replaySessions = useMemo(() => buildTimelineReplaySessions(model.events), [model.events]);
  const [replaySessionId, setReplaySessionId] = useState('');
  const [replayCursor, setReplayCursor] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const replayState = useMemo(
    () => resolveTimelineReplaySelection(replaySessions, replaySessionId, replayCursor),
    [replayCursor, replaySessionId, replaySessions],
  );
  const {
    isHandoffPreviewOpen,
    setIsHandoffPreviewOpen,
    handoffPageModel,
    handoffLibraryState,
    handoffCopyStatus,
    handoffWriteStatus,
    handoffWrittenPath,
    handoffWriteError,
    handoffOpenStatus,
    handoffOpenedPath,
    handoffOpenError,
    handoffStatusUpdateStatus,
    handoffStatusUpdatedPath,
    handoffStatusUpdateError,
    handoffDispatchPromptStatus,
    handoffDispatchBranchName,
    handoffDispatchReportPath,
    handoffDispatchPromptError,
    handoffWorkPackageStatus,
    handoffWorkPackagePath,
    handoffWorkPackageBranchName,
    handoffWorkPackageReportPath,
    handoffWorkPackageError,
    handoffExecutionActionStatus,
    handoffExecutionAgentLabel,
    handoffExecutionPackagePath,
    handoffExecutionError,
    refreshHandoffArtifacts,
    createHandoffPreview,
    copyHandoffMarkdown,
    writeHandoffDraft,
    openHandoffArtifact,
    updateHandoffArtifactStatus,
    copyHandoffDispatchPrompt,
    createHandoffWorkPackage,
    openHandoffWorkPackage,
    copyHandoffWorkPackagePrompt,
    updateHandoffDispatchStatus,
    linkHandoffExecutionAgent,
    updateHandoffExecutionStatus,
    launchHandoffExecutor,
    refreshHandoffCompletion,
    openHandoffReport,
  } = useHandoffWorkflow({ agents, timelineEvents: model.events, replayState });

  useEffect(() => {
    if (replaySessions.length === 0) {
      if (replaySessionId !== '') setReplaySessionId('');
      if (replayCursor !== 0) setReplayCursor(0);
      if (isReplayPlaying) setIsReplayPlaying(false);
      return;
    }
    const firstReplaySession = replaySessions[0];
    if (!replaySessionId && firstReplaySession) {
      setReplaySessionId(firstReplaySession.id);
      setReplayCursor(0);
      setIsReplayPlaying(false);
      return;
    }
    if (replayState.unavailableReason === 'session-filtered-out') {
      if (isReplayPlaying) setIsReplayPlaying(false);
      return;
    }
    if (replayState.session && replayCursor >= replayState.session.frameCount) {
      setReplayCursor(Math.max(0, replayState.session.frameCount - 1));
    }
  }, [isReplayPlaying, replayCursor, replaySessionId, replaySessions, replayState]);

  useEffect(() => {
    if (!isReplayPlaying || !replayState.session) return;
    if (!replayState.hasNext) {
      setIsReplayPlaying(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      setReplayCursor((cursor) => Math.min(cursor + 1, replayState.session!.frameCount - 1));
    }, TIMELINE_REPLAY_BASE_INTERVAL_MS / replaySpeed);
    return () => window.clearTimeout(timeout);
  }, [isReplayPlaying, replaySpeed, replayState]);

  const goToPreviousReplayFrame = () => {
    setIsReplayPlaying(false);
    setReplayCursor((cursor) => Math.max(0, cursor - 1));
  };
  const goToFirstReplayFrame = () => {
    setIsReplayPlaying(false);
    setReplayCursor(0);
  };
  const goToNextReplayFrame = () => {
    setIsReplayPlaying(false);
    setReplayCursor((cursor) =>
      replayState.session ? Math.min(cursor + 1, replayState.session.frameCount - 1) : 0,
    );
  };
  const goToLastReplayFrame = () => {
    setIsReplayPlaying(false);
    setReplayCursor(replayState.session ? replayState.session.frameCount - 1 : 0);
  };
  const selectReplayEvent = (event: TimelinePageItem) => {
    const location = findTimelineReplayFrameByEventId(replaySessions, event.id);
    if (!location) return;
    setReplaySessionId(location.sessionId);
    setReplayCursor(location.cursorIndex);
    setIsReplayPlaying(false);
  };
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
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs uppercase tracking-wide text-text-muted">
            <span>
              {agents.length} visible agents / {activeCount} active / {needsMeCount} needs me /{' '}
              {errorCount} errors
            </span>
            <span
              className="border border-border bg-btn-bg px-2 py-1"
              title={timelineHistory.error}
            >
              {historyStatus}
            </span>
            <Button variant="default" size="sm" onClick={onRefreshHistory}>
              Refresh history
            </Button>
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

      <TimelineReplayPanel
        sessions={replaySessions}
        selectedSessionId={replaySessionId}
        state={replayState}
        isPlaying={isReplayPlaying}
        speed={replaySpeed}
        onSessionChange={(sessionId) => {
          setReplaySessionId(sessionId);
          setReplayCursor(0);
          setIsReplayPlaying(false);
        }}
        onFirst={goToFirstReplayFrame}
        onPrevious={goToPreviousReplayFrame}
        onNext={goToNextReplayFrame}
        onLast={goToLastReplayFrame}
        onTogglePlay={() => setIsReplayPlaying((playing) => !playing && replayState.hasNext)}
        onSpeedChange={setReplaySpeed}
      />

      <HandoffDraftPanel
        model={handoffPageModel}
        isPreviewOpen={isHandoffPreviewOpen}
        copyStatus={handoffCopyStatus}
        writeStatus={handoffWriteStatus}
        writtenPath={handoffWrittenPath}
        writeError={handoffWriteError}
        onCreate={createHandoffPreview}
        onCopy={copyHandoffMarkdown}
        onWrite={writeHandoffDraft}
        onClose={() => setIsHandoffPreviewOpen(false)}
      />

      <HandoffArtifactLibraryPanel
        agents={agents}
        state={handoffLibraryState}
        openStatus={handoffOpenStatus}
        openedPath={handoffOpenedPath}
        openError={handoffOpenError}
        statusUpdateStatus={handoffStatusUpdateStatus}
        statusUpdatedPath={handoffStatusUpdatedPath}
        statusUpdateError={handoffStatusUpdateError}
        dispatchPromptStatus={handoffDispatchPromptStatus}
        dispatchBranchName={handoffDispatchBranchName}
        dispatchReportPath={handoffDispatchReportPath}
        dispatchPromptError={handoffDispatchPromptError}
        workPackageStatus={handoffWorkPackageStatus}
        workPackagePath={handoffWorkPackagePath}
        workPackageBranchName={handoffWorkPackageBranchName}
        workPackageReportPath={handoffWorkPackageReportPath}
        workPackageError={handoffWorkPackageError}
        executionActionStatus={handoffExecutionActionStatus}
        executionAgentLabel={handoffExecutionAgentLabel}
        executionPackagePath={handoffExecutionPackagePath}
        executionError={handoffExecutionError}
        onRefresh={refreshHandoffArtifacts}
        onOpen={openHandoffArtifact}
        onUpdateStatus={updateHandoffArtifactStatus}
        onCopyDispatchPrompt={copyHandoffDispatchPrompt}
        onCreateWorkPackage={createHandoffWorkPackage}
        onOpenWorkPackage={openHandoffWorkPackage}
        onCopyWorkPackagePrompt={copyHandoffWorkPackagePrompt}
        onUpdateDispatchStatus={updateHandoffDispatchStatus}
        onLinkExecutionAgent={linkHandoffExecutionAgent}
        onUpdateExecutionStatus={updateHandoffExecutionStatus}
        onLaunchExecutor={launchHandoffExecutor}
        onRefreshCompletion={refreshHandoffCompletion}
        onOpenReport={openHandoffReport}
      />

      <section className="grid gap-3 border border-border bg-btn-bg p-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_160px_180px] 2xl:grid-cols-[minmax(220px,1fr)_150px_160px_180px_160px_170px_220px_220px_auto]">
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
        <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
          Time
          <select
            className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
            value={filters.timeWindow}
            onChange={(event) =>
              onTimeWindowChange(event.currentTarget.value as TimelineTimeWindowFilter)
            }
            aria-label="Filter timeline time window"
          >
            {(['all', 'today', 'last_24h', 'last_7_days'] as const).map((timeWindow) => (
              <option key={timeWindow} value={timeWindow}>
                {timelineTimeWindowLabel(timeWindow)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
          Category
          <select
            className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
            value={filters.categoryFilter}
            onChange={(event) =>
              onCategoryFilterChange(event.currentTarget.value as TimelineCategoryFilter)
            }
            aria-label="Filter timeline category"
          >
            {(
              [
                'all',
                'lifecycle',
                'tool',
                'action',
                'delegation',
                'permission',
                'run',
                'token',
                'other',
              ] as const
            ).map((category) => (
              <option key={category} value={category}>
                {timelineCategoryLabel(category)}
              </option>
            ))}
          </select>
        </label>
        <TimelineFilterSelect
          label="Kind"
          value={filters.kindFilter}
          allLabel="All kinds"
          options={model.kindOptions}
          onChange={onKindFilterChange}
          ariaLabel="Filter timeline kind"
        />
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
              .map((event) => (
                <TimelineEventRow
                  key={event.id}
                  event={event}
                  replayMarker={getTimelineReplayFrameMarker(event, replayState)}
                  onSelectReplay={() => selectReplayEvent(event)}
                />
              ))
          )}
        </div>
      </section>
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

function applyDelegationSummary(
  agent: AgentSummary,
  delegation: DelegationSummary | undefined,
): AgentSummary {
  if (!delegation || delegation.status === 'none' || delegationTotalCount(delegation) === 0) {
    return agent;
  }
  const delegationLabel = `${delegationStatusLabel(delegation.status)} / ${delegationWorkerLabel(
    delegation,
  )}`;
  const currentDetail = agent.detail ?? agent.activity;
  return {
    ...agent,
    status: 'supervising',
    statusGroup:
      agent.hidden || agent.isPaused || agent.statusGroup === 'paused'
        ? agent.statusGroup
        : 'delegating',
    activity: delegationLabel,
    detail: currentDetail ? `${delegationLabel} / ${currentDetail}` : delegationLabel,
    updatedAt: Math.max(agent.updatedAt ?? 0, delegation.updatedAt),
    delegation,
  };
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
    delegating: 0,
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
    } else if (agent.statusGroup === 'delegating') {
      counts.delegating += 1;
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
    if (isWorkingStatusGroup(agent.statusGroup)) project.activeCount += 1;
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
    if (isWorkingStatusGroup(agent.statusGroup)) team.activeCount += 1;
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

function statusFilterLabel(filter: StatusFilter): string {
  if (filter === 'needs_me') return 'Needs me';
  if (filter === 'delegating') return 'Delegating';
  return filter[0].toUpperCase() + filter.slice(1);
}
