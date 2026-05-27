import { useEffect, useMemo, useState } from 'react';

import type {
  AgentLifecycleEvent,
  AgentLifecycleState,
  AgentRuntimeMetadata,
  AgentTimelineEvent,
} from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import {
  type AgentZone,
  type AgentZoneSource,
  inferAgentZone,
  zoneSourceLabel,
} from '../office/zoneUtils.js';
import { vscode } from '../vscodeApi.js';
import { TokenCostSummary } from './TokenCostSummary.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

type ProviderFilter = 'all' | 'codex' | 'claude';
type StatusFilter = 'all' | 'active' | 'waiting' | 'needs_me' | 'error';
type ProjectFilter = 'all' | string;
type TeamFilter = 'all' | string;

interface AgentCenterProps {
  isOpen: boolean;
  onClose: () => void;
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  agentLifecycleStatuses: Record<number, AgentLifecycleState>;
  agentLifecycleEvents: AgentLifecycleEvent[];
  agentTimelineEvents: AgentTimelineEvent[];
  agentRuntimeMetadata: Record<number, AgentRuntimeMetadata>;
  officeState: OfficeState;
  onCloseAgent: (id: number) => void;
}

interface AgentSummary {
  id: number;
  name: string;
  project: string;
  providerId: string;
  status: string;
  statusGroup: StatusFilter;
  activity: string;
  detail?: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  artifactOutputTokens: number;
  tokenUsageEstimated: boolean;
  zone: AgentZone;
  zoneSource: AgentZoneSource;
  projectDir?: string;
  transcriptPath?: string;
  teamName?: string;
  roleName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
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

export function AgentCenter({
  isOpen,
  onClose,
  agents,
  selectedAgent,
  agentTools,
  agentStatuses,
  agentLifecycleStatuses,
  agentLifecycleEvents,
  agentTimelineEvents,
  agentRuntimeMetadata,
  officeState,
  onCloseAgent,
}: AgentCenterProps) {
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
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
          officeState,
        ),
      ),
    [agents, agentRuntimeMetadata, agentTools, agentLifecycleStatuses, agentStatuses, officeState],
  );

  const filteredAgents = useMemo(
    () =>
      summaries.filter((agent) => {
        const providerMatches = providerFilter === 'all' || agent.providerId === providerFilter;
        const statusMatches = statusFilter === 'all' || agent.statusGroup === statusFilter;
        const projectMatches = projectFilter === 'all' || agent.project === projectFilter;
        const teamMatches = teamFilter === 'all' || agent.teamName === teamFilter;
        return providerMatches && statusMatches && projectMatches && teamMatches;
      }),
    [projectFilter, providerFilter, statusFilter, summaries, teamFilter],
  );
  const projectSummaries = useMemo(() => getProjectSummaries(summaries), [summaries]);
  const teamSummaries = useMemo(() => getTeamSummaries(summaries), [summaries]);

  useEffect(() => {
    officeState.setMeetingTeam(teamFilter === 'all' ? null : teamFilter);
  }, [officeState, teamFilter]);

  useEffect(() => {
    if (!isOpen) return;
    if (detailAgentId !== null && filteredAgents.some((agent) => agent.id === detailAgentId)) {
      return;
    }
    if (selectedAgent !== null && filteredAgents.some((agent) => agent.id === selectedAgent)) {
      setDetailAgentId(selectedAgent);
      return;
    }
    setDetailAgentId(filteredAgents[0]?.id ?? null);
  }, [detailAgentId, filteredAgents, isOpen, selectedAgent]);

  const selectedSummary =
    filteredAgents.find((agent) => agent.id === detailAgentId) ?? filteredAgents[0];
  const selectedTimeline = selectedSummary
    ? buildAgentTimeline(selectedSummary.id, agentTimelineEvents, agentLifecycleEvents)
    : [];
  const selectedTeamMembers = selectedSummary?.teamName
    ? summaries.filter((agent) => agent.teamName === selectedSummary.teamName)
    : [];
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agent Center"
      className="flex h-[min(86vh,760px)] w-[min(96vw,1120px)] flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pr-7">
        <div className="mb-4 grid shrink-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <TokenCostSummary agents={agents} officeState={officeState} />
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedButtons
              values={['all', 'codex', 'claude']}
              active={providerFilter}
              label={(provider) => (provider === 'all' ? 'All' : providerLabel(provider))}
              onChange={setProviderFilter}
            />
            <Button
              variant="default"
              size="sm"
              onClick={() => vscode.postMessage({ type: 'refreshAgents' })}
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          <SegmentedButtons
            values={['all', 'active', 'waiting', 'needs_me', 'error']}
            active={statusFilter}
            label={statusFilterLabel}
            onChange={setStatusFilter}
          />
        </div>

        <ProjectDashboard
          projects={projectSummaries}
          activeProject={projectFilter}
          onProjectChange={setProjectFilter}
          onOpenProject={(projectDir) =>
            vscode.postMessage({ type: 'openProjectPath', projectDir })
          }
        />

        <TeamDashboard teams={teamSummaries} activeTeam={teamFilter} onTeamChange={setTeamFilter} />

        <div className="grid border border-border lg:grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)]">
          <div className="border-b border-border lg:border-b-0 lg:border-r">
            {filteredAgents.length === 0 ? (
              <div className="p-8 text-center text-text-muted">No agents match these filters</div>
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
          />
        </div>
      </div>
    </Modal>
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
    <button
      type="button"
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 p-4 text-left hover:bg-btn-hover ${isSelected ? 'bg-active-bg' : 'bg-bg'}`}
      onClick={onSelect}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <ProviderBadge providerId={agent.providerId} />
          <span className="truncate text-lg text-accent-bright">{agent.name}</span>
          <span className="shrink-0 text-xs text-text-muted">#{agent.id}</span>
        </div>
        <div className="mt-1 truncate text-sm text-text-muted">{agent.project}</div>
        {agent.teamName && (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="truncate border border-border bg-btn-bg px-2 py-1">
              {agent.teamName}
            </span>
            <span>{agent.isTeamLead ? 'Lead' : (agent.roleName ?? 'Member')}</span>
          </div>
        )}
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
          <StatusBadge status={agent.status} />
          <span className="max-w-full truncate text-sm text-text">{agent.activity}</span>
        </div>
      </div>
      <div className="min-w-[72px] text-right text-xs text-text-muted">
        {agent.tokens > 0 ? `${compactNumber(agent.tokens)} tok` : 'No tokens'}
      </div>
    </button>
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
}: {
  agent?: AgentSummary;
  lifecycle?: AgentLifecycleState;
  timeline: TimelineItem[];
  teamMembers: AgentSummary[];
  onCloseAgent: (id: number) => void;
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
          <Button variant="default" size="sm" onClick={() => onCloseAgent(agent.id)}>
            Actions
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DetailField label="Lifecycle status" value={agent.status} badge />
        <DetailField label="Provider" value={providerLabel(agent.providerId)} />
        <DetailField label="Project" value={agent.project} />
        <DetailField label="Last event" value={lastEvent?.title ?? 'No recent events'} />
        <DetailField label="Zone" value={`${agent.zone} (${zoneSourceLabel(agent.zoneSource)})`} />
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
          {agent.projectDir && <DetailField label="Project path" value={agent.projectDir} />}
          {agent.transcriptPath && <DetailField label="Transcript" value={agent.transcriptPath} />}
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
        <TokenBox label="Artifact" value={agent.artifactOutputTokens} />
        <TokenBox label="Total" value={agent.tokens} />
      </div>
      <div className="mt-2 text-xs text-text-muted">
        {agent.tokenUsageEstimated
          ? 'Token count estimated from transcript text; API proxy cost is approximate.'
          : 'Token count from provider usage fields when available; API proxy cost is approximate.'}
        {agent.artifactOutputTokens > 0
          ? ' Artifact is generated code/patch estimate and is not included in billing proxy total.'
          : ''}
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
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="min-w-0 border border-border bg-btn-bg p-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 min-w-0 truncate text-sm text-text">
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
  officeState: OfficeState,
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

  return {
    id,
    name: ch?.agentName ?? `Agent #${id}`,
    project: ch?.folderName ?? 'Unknown project',
    providerId: ch?.providerId ?? 'claude',
    status: displayStatus,
    statusGroup: getStatusGroup(displayStatus),
    activity,
    detail: lifecycle?.detail,
    tokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    artifactOutputTokens,
    tokenUsageEstimated: ch?.tokenUsageEstimated ?? false,
    zone: zone.zone,
    zoneSource: zone.source,
    projectDir: metadata?.projectDir,
    transcriptPath: metadata?.transcriptPath,
    teamName: ch?.teamName,
    roleName: ch?.agentName,
    isTeamLead: ch?.isTeamLead,
    leadAgentId: ch?.leadAgentId,
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

function getStatusGroup(status: string): StatusFilter {
  if (status === 'error') return 'error';
  if (status === 'needs approval' || status === 'waiting_permission' || status === 'waiting_user') {
    return 'needs_me';
  }
  if (status === 'active' || status === 'thinking' || status === 'tool_running') return 'active';
  return 'waiting';
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

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return value.toLocaleString();
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 2) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
