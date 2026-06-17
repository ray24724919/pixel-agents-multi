import type { AgentLifecycleState } from '../../hooks/useExtensionMessages.js';
import { zoneSourceLabel } from '../../office/zoneUtils.js';
import { vscode } from '../../vscodeApi.js';
import {
  delegationStatusLabel,
  type DelegationSummary,
  delegationWorkerLabel,
} from '../delegationModel.js';
import { pauseActionLabel } from '../pauseResume.js';
import { Button } from '../ui/Button.js';
import { compareTeamMembers } from './agentOrdering.js';
import {
  compactNumber,
  formatRateLimit,
  formatRelative,
  providerLabel,
  severityDot,
} from './formatters.js';
import { ProviderBadge } from './ProviderBadge.js';
import type {
  AgentStateCounts,
  AgentSummary,
  ProjectFilter,
  ProjectSummary,
  TeamFilter,
  TeamSummary,
  TimelineItem,
} from './types.js';

export function AgentStateSummary({
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
    { label: 'Delegating', value: counts.delegating, tone: 'border-accent text-text' },
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

export function AgentListEmptyState({
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

export function AgentRow({
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
          {agent.delegation && <DelegationBadge delegation={agent.delegation} />}
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
        {agent.delegation && (
          <div className="mt-1 truncate text-xs text-text-muted">
            {delegationStatusLabel(agent.delegation.status)} /{' '}
            {delegationWorkerLabel(agent.delegation)}
          </div>
        )}
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
  if (agent.statusGroup === 'delegating') return 'border-l-accent';
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
  if (agent.statusGroup === 'delegating') return 'border-accent bg-btn-bg text-text';
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
  if (agent.statusGroup === 'delegating') return 'bg-accent';
  if (agent.isPaused || agent.statusGroup === 'paused') return 'bg-status-permission';
  if (agent.statusGroup === 'active') return 'bg-status-active';
  return 'bg-status-success';
}

function attentionLabel(agent: AgentSummary): string {
  if (agent.hidden) return 'Hidden';
  if (agent.statusGroup === 'needs_me') return 'Needs me';
  if (agent.statusGroup === 'error') return 'Error';
  if (agent.statusGroup === 'delegating') return 'Supervising';
  if (agent.isPaused || agent.statusGroup === 'paused') return 'Paused';
  if (agent.statusGroup === 'active') return 'Active';
  return 'Waiting';
}

function DelegationBadge({ delegation }: { delegation: DelegationSummary }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 border border-accent bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-accent-bright">
      <span>{delegationWorkerLabel(delegation)}</span>
    </span>
  );
}

function TokenAccuracyLabel({ estimated }: { estimated: boolean }) {
  return (
    <div className="mt-1 truncate text-xs text-text-muted">{estimated ? 'Estimated' : 'Exact'}</div>
  );
}

export function ProjectDashboard({
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

export function TeamDashboard({
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

export function AgentDetail({
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
            Remove…
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
        {agent.delegation && (
          <DetailField
            label="Delegation"
            value={`${delegationStatusLabel(agent.delegation.status)} / ${delegationWorkerLabel(
              agent.delegation,
            )}`}
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

      {agent.delegation && (
        <div className="mt-4 border border-border bg-btn-bg p-3 text-sm text-text-muted">
          <div className="text-xs uppercase tracking-wide">Delegated workers</div>
          <div className="mt-1 flex flex-wrap gap-2 text-text">
            <span>{agent.delegation.activeDelegateCount} active</span>
            <span>{agent.delegation.completedDelegateCount} completed</span>
            <span>{agent.delegation.failedDelegateCount} failed</span>
            <span>{agent.delegation.delegateSource}</span>
          </div>
          {agent.delegation.delegateLabels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {agent.delegation.delegateLabels.slice(0, 8).map((label) => (
                <span key={label} className="border border-border bg-bg px-2 py-1 text-xs">
                  {label}
                </span>
              ))}
            </div>
          )}
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

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'needs approval' || status === 'waiting_permission' || status === 'waiting_user'
      ? 'bg-status-permission'
      : status === 'active' ||
          status === 'thinking' ||
          status === 'tool_running' ||
          status === 'supervising'
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
