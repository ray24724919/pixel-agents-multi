import { useEffect, useMemo, useState } from 'react';

import type {
  AgentLifecycleEvent,
  AgentLifecycleState,
  AgentRuntimeMetadata,
  AgentTimelineEvent,
  SubagentCharacter,
} from '../../hooks/useExtensionMessages.js';
import type { OfficeState } from '../../office/engine/officeState.js';
import type { ToolActivity } from '../../office/types.js';
import { inferAgentZone } from '../../office/zoneUtils.js';
import { vscode } from '../../vscodeApi.js';
import { isAgentVisibleWithHiddenToggle } from '../agentCenterFilters.js';
import {
  type AgentListSortKey,
  type AgentListStatusGroup,
  filterAndSortAgentList,
} from '../agentCenterListModel.js';
import type { AgentCenterPage } from '../agentCenterPages.js';
import {
  buildDelegationSummaries,
  delegationStatusLabel,
  type DelegationSummary,
  delegationTotalCount,
  delegationWorkerLabel,
} from '../delegationModel.js';
import { isPausedStatus } from '../pauseResume.js';
import {
  buildTimelinePageItems,
  buildTimelinePageModel,
  type TimelineCategoryFilter,
  type TimelinePageFilters,
  type TimelineSeverityFilter,
  type TimelineTimeWindowFilter,
} from '../timelinePageModel.js';
import { isWorkingStatusGroup } from './agentOrdering.js';
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
} from './types.js';

/**
 * The Agent Center surface's derived-state chain: agent summaries (with delegation overlays),
 * visibility/filter/sort pipelines, project/team rollups, and the Timeline page model, plus the
 * filter state they read from. Extracted verbatim from AgentCenterSurface; hook call order is
 * unchanged, so React semantics are identical.
 */
export function useAgentCenterState({
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
  officeState,
}: {
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
  officeState: OfficeState;
}) {
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

  return {
    providerFilter,
    setProviderFilter,
    statusFilter,
    setStatusFilter,
    projectFilter,
    setProjectFilter,
    teamFilter,
    setTeamFilter,
    searchQuery,
    setSearchQuery,
    sortKey,
    setSortKey,
    timelineSearchQuery,
    setTimelineSearchQuery,
    setTimelineProviderFilter,
    setTimelineSeverityFilter,
    setTimelineProjectFilter,
    setTimelineAgentFilter,
    setTimelineCategoryFilter,
    setTimelineKindFilter,
    setTimelineTimeWindow,
    detailAgentId,
    setDetailAgentId,
    summaries,
    visibleSummaries,
    filteredAgents,
    projectSummaries,
    teamSummaries,
    visibleAgentIds,
    hiddenCount,
    agentStateCounts,
    hasAgentListFilters,
    timelineFilters,
    timelineModel,
    clearAgentListFilters,
    clearTimelineFilters,
    refreshAgentCenter,
    refreshTimelineHistory,
  };
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

export function buildAgentTimeline(
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
