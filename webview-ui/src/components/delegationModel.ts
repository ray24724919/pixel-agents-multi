export type DelegationStatus = 'none' | 'delegating' | 'waiting_for_delegate' | 'delegate_error';

export type DelegationSource =
  | 'terminal'
  | 'hook'
  | 'codex_app_worker'
  | 'claude_worker'
  | 'unknown';

export interface DelegationSummary {
  supervisorAgentId: number;
  providerId: string;
  status: DelegationStatus;
  activeDelegateCount: number;
  completedDelegateCount: number;
  failedDelegateCount: number;
  delegateSource: DelegationSource;
  teamName?: string;
  delegateLabels: string[];
  updatedAt: number;
}

export interface DelegationAgentContext {
  id: number;
  name: string;
  providerId: string;
  statusGroup: 'active' | 'paused' | 'waiting' | 'needs_me' | 'error' | 'delegating';
  teamName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  updatedAt?: number;
}

export interface DelegationSubagentContext {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
}

export interface DelegationToolContext {
  toolId?: string;
  status: string;
  done: boolean;
}

export interface DelegationModelInput {
  agents: readonly DelegationAgentContext[];
  subagentCharacters: readonly DelegationSubagentContext[];
  subagentTools: Record<number, Record<string, readonly DelegationToolContext[]>>;
  parentTools?: Record<number, readonly DelegationToolContext[]>;
  nowMs?: number;
}

interface MutableDelegationSummary extends DelegationSummary {
  sources: Set<DelegationSource>;
}

export function buildDelegationSummaries({
  agents,
  subagentCharacters,
  subagentTools,
  parentTools = {},
  nowMs = Date.now(),
}: DelegationModelInput): Map<number, DelegationSummary> {
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const summaries = new Map<number, MutableDelegationSummary>();

  for (const subagent of subagentCharacters) {
    const supervisor = agentsById.get(subagent.parentAgentId);
    if (!supervisor) continue;
    const tools = subagentTools[supervisor.id]?.[subagent.parentToolId] ?? [];
    const parentTool = parentTools[supervisor.id]?.find(
      (tool) => tool.toolId === subagent.parentToolId,
    );
    const failed =
      tools.some((tool) => isFailureStatus(tool.status)) ||
      (parentTool ? isFailureStatus(parentTool.status) : false);
    const completed =
      (tools.length > 0 && tools.every((tool) => tool.done)) || parentTool?.done === true;
    const summary = ensureSummary(summaries, supervisor, nowMs, 'hook');
    addDelegate(summary, {
      label: subagent.label || `Worker #${subagent.id}`,
      active: !failed && !completed,
      completed: !failed && completed,
      failed,
      source: 'hook',
      updatedAt: supervisor.updatedAt ?? nowMs,
    });
  }

  const teamMembersByLead = new Map<number, DelegationAgentContext[]>();
  for (const member of agents) {
    if (member.leadAgentId === undefined || member.leadAgentId === member.id) continue;
    const members = teamMembersByLead.get(member.leadAgentId) ?? [];
    members.push(member);
    teamMembersByLead.set(member.leadAgentId, members);
  }
  for (const lead of agents) {
    if (!lead.isTeamLead || !lead.teamName) continue;
    const inferredMembers = agents.filter(
      (member) =>
        member.id !== lead.id &&
        member.teamName === lead.teamName &&
        member.leadAgentId === undefined,
    );
    if (inferredMembers.length > 0) {
      const members = teamMembersByLead.get(lead.id) ?? [];
      members.push(...inferredMembers);
      teamMembersByLead.set(lead.id, members);
    }
  }

  for (const [leadId, members] of teamMembersByLead) {
    const supervisor = agentsById.get(leadId);
    if (!supervisor) continue;
    const summary = ensureSummary(summaries, supervisor, nowMs, 'terminal');
    for (const member of dedupeAgents(members)) {
      addDelegate(summary, {
        label: member.name,
        active: member.statusGroup === 'active' || member.statusGroup === 'needs_me',
        completed: member.statusGroup === 'waiting' || member.statusGroup === 'paused',
        failed: member.statusGroup === 'error',
        source: 'terminal',
        updatedAt: member.updatedAt ?? supervisor.updatedAt ?? nowMs,
      });
    }
  }

  return new Map(
    [...summaries.entries()].map(([agentId, summary]) => {
      const { sources, ...publicSummary } = summary;
      publicSummary.delegateSource = chooseDelegateSource(sources);
      publicSummary.status = delegationStatusFor(publicSummary);
      return [agentId, publicSummary];
    }),
  );
}

export function delegationTotalCount(summary: DelegationSummary | undefined): number {
  if (!summary) return 0;
  return summary.activeDelegateCount + summary.completedDelegateCount + summary.failedDelegateCount;
}

export function delegationWorkerLabel(summary: DelegationSummary | undefined): string {
  const count = delegationTotalCount(summary);
  return `${count} ${count === 1 ? 'worker' : 'workers'}`;
}

export function delegationStatusLabel(status: DelegationStatus): string {
  if (status === 'delegating') return 'Supervising';
  if (status === 'waiting_for_delegate') return 'Waiting on workers';
  if (status === 'delegate_error') return 'Delegate error';
  return 'No delegation';
}

function ensureSummary(
  summaries: Map<number, MutableDelegationSummary>,
  supervisor: DelegationAgentContext,
  nowMs: number,
  source: DelegationSource,
): MutableDelegationSummary {
  const existing = summaries.get(supervisor.id);
  if (existing) {
    existing.sources.add(source);
    return existing;
  }
  const summary: MutableDelegationSummary = {
    supervisorAgentId: supervisor.id,
    providerId: supervisor.providerId,
    status: 'none',
    activeDelegateCount: 0,
    completedDelegateCount: 0,
    failedDelegateCount: 0,
    delegateSource: source,
    teamName: supervisor.teamName,
    delegateLabels: [],
    updatedAt: supervisor.updatedAt ?? nowMs,
    sources: new Set([source]),
  };
  summaries.set(supervisor.id, summary);
  return summary;
}

function addDelegate(
  summary: MutableDelegationSummary,
  delegate: {
    label: string;
    active: boolean;
    completed: boolean;
    failed: boolean;
    source: DelegationSource;
    updatedAt: number;
  },
): void {
  summary.sources.add(delegate.source);
  if (!summary.delegateLabels.includes(delegate.label)) {
    summary.delegateLabels.push(delegate.label);
  }
  summary.updatedAt = Math.max(summary.updatedAt, delegate.updatedAt);
  if (delegate.failed) {
    summary.failedDelegateCount += 1;
  } else if (delegate.active) {
    summary.activeDelegateCount += 1;
  } else if (delegate.completed) {
    summary.completedDelegateCount += 1;
  } else {
    summary.activeDelegateCount += 1;
  }
}

function delegationStatusFor(summary: DelegationSummary): DelegationStatus {
  if (summary.failedDelegateCount > 0) return 'delegate_error';
  if (summary.activeDelegateCount > 0) return 'delegating';
  if (summary.completedDelegateCount > 0) return 'waiting_for_delegate';
  return 'none';
}

function chooseDelegateSource(sources: Set<DelegationSource>): DelegationSource {
  if (sources.has('terminal')) return 'terminal';
  if (sources.has('codex_app_worker')) return 'codex_app_worker';
  if (sources.has('claude_worker')) return 'claude_worker';
  if (sources.has('hook')) return 'hook';
  return 'unknown';
}

function dedupeAgents(agents: readonly DelegationAgentContext[]): DelegationAgentContext[] {
  const seen = new Set<number>();
  return agents.filter((agent) => {
    if (seen.has(agent.id)) return false;
    seen.add(agent.id);
    return true;
  });
}

function isFailureStatus(status: string): boolean {
  return /\b(abort|aborted|cancelled|error|fail|failed|failure)\b/i.test(status);
}
