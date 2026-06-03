import type { DelegationSummary } from './delegationModel.js';
import { delegationTotalCount } from './delegationModel.js';

export type DelegationTimelineEventKind =
  | 'delegation.started'
  | 'delegation.progress'
  | 'delegation.completed'
  | 'delegation.failed'
  | 'delegation.cancelled';

export type DelegationTimelineEndReason = 'completed' | 'failed' | 'cancelled';

export interface DelegationTimelineAgentContext {
  id: number;
  name: string;
  providerId: string;
  projectName: string;
  sessionId?: string;
  runId?: string;
}

export interface DelegationTimelineTransitionHint {
  supervisorAgentId: number;
  reason: DelegationTimelineEndReason;
  timestamp?: number;
}

export interface DelegationTimelineEventIntent {
  agentId: number;
  providerId: string;
  projectName: string;
  sessionId?: string;
  runId?: string;
  timestamp: number;
  kind: DelegationTimelineEventKind;
  title: string;
  summary: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  source: 'agent' | 'system';
  payload: {
    activeDelegateCount: number;
    completedDelegateCount: number;
    failedDelegateCount: number;
    totalDelegateCount: number;
    delegateSource: string;
    teamName?: string;
  };
}

export interface DelegationTimelineTransitionInput {
  previous: ReadonlyMap<number, DelegationSummary>;
  current: ReadonlyMap<number, DelegationSummary>;
  agents: readonly DelegationTimelineAgentContext[];
  transitionHints?: readonly DelegationTimelineTransitionHint[];
  nowMs?: number;
}

export function buildDelegationTimelineEventIntents({
  previous,
  current,
  agents,
  transitionHints = [],
  nowMs = Date.now(),
}: DelegationTimelineTransitionInput): DelegationTimelineEventIntent[] {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const hintsBySupervisor = new Map<number, DelegationTimelineTransitionHint>();
  for (const hint of transitionHints) {
    hintsBySupervisor.set(hint.supervisorAgentId, hint);
  }
  const events: DelegationTimelineEventIntent[] = [];

  for (const [agentId, summary] of current) {
    if (delegationTotalCount(summary) === 0) continue;
    const previousSummary = previous.get(agentId);
    if (!previousSummary || delegationTotalCount(previousSummary) === 0) {
      events.push(createDelegationEvent('delegation.started', summary, agentById, nowMs));
      if (summary.status === 'delegate_error') {
        events.push(createDelegationEvent('delegation.failed', summary, agentById, nowMs));
      }
      continue;
    }

    const terminalKind = terminalKindForTransition(previousSummary, summary);
    if (terminalKind) {
      events.push(createDelegationEvent(terminalKind, summary, agentById, nowMs));
      continue;
    }

    if (delegationSignature(previousSummary) !== delegationSignature(summary)) {
      events.push(createDelegationEvent('delegation.progress', summary, agentById, nowMs));
    }
  }

  for (const [agentId, previousSummary] of previous) {
    if (current.has(agentId) || delegationTotalCount(previousSummary) === 0) continue;
    const hint = hintsBySupervisor.get(agentId);
    const terminalKind =
      terminalKindForHintedMissingCurrent(previousSummary, hint) ??
      terminalKindForMissingCurrent(previousSummary);
    if (!terminalKind) continue;
    events.push(
      createDelegationEvent(terminalKind, previousSummary, agentById, hint?.timestamp ?? nowMs),
    );
  }

  return events;
}

function terminalKindForTransition(
  previous: DelegationSummary,
  current: DelegationSummary,
): DelegationTimelineEventKind | undefined {
  if (current.status === 'delegate_error' && previous.status !== 'delegate_error') {
    return 'delegation.failed';
  }
  if (
    current.status === 'waiting_for_delegate' &&
    previous.status !== 'waiting_for_delegate' &&
    current.activeDelegateCount === 0 &&
    current.failedDelegateCount === 0
  ) {
    return 'delegation.completed';
  }
  return undefined;
}

function terminalKindForMissingCurrent(
  previous: DelegationSummary,
): DelegationTimelineEventKind | undefined {
  if (previous.status === 'delegating') return 'delegation.cancelled';
  return undefined;
}

function createDelegationEvent(
  kind: DelegationTimelineEventKind,
  summary: DelegationSummary,
  agentById: ReadonlyMap<number, DelegationTimelineAgentContext>,
  timestamp: number,
): DelegationTimelineEventIntent {
  const agent = agentById.get(summary.supervisorAgentId);
  const totalDelegateCount = delegationTotalCount(summary);
  return {
    agentId: summary.supervisorAgentId,
    providerId: summary.providerId,
    projectName: agent?.projectName ?? 'Unknown project',
    sessionId: agent?.sessionId,
    runId: agent?.runId,
    timestamp,
    kind,
    title: titleForKind(kind),
    summary: buildSafeSummary(summary, agent, totalDelegateCount),
    severity: severityForKind(kind),
    source: 'agent',
    payload: {
      activeDelegateCount: summary.activeDelegateCount,
      completedDelegateCount: summary.completedDelegateCount,
      failedDelegateCount: summary.failedDelegateCount,
      totalDelegateCount,
      delegateSource: summary.delegateSource,
      teamName: summary.teamName,
    },
  };
}

function buildSafeSummary(
  summary: DelegationSummary,
  agent: DelegationTimelineAgentContext | undefined,
  totalDelegateCount: number,
): string {
  const supervisorName = agent?.name ?? `Agent #${summary.supervisorAgentId}`;
  const parts = [
    `${supervisorName} #${summary.supervisorAgentId}`,
    `${providerLabel(summary.providerId)} provider`,
    `${totalDelegateCount} ${totalDelegateCount === 1 ? 'worker' : 'workers'}`,
    `${summary.activeDelegateCount} active`,
    `${summary.completedDelegateCount} completed`,
    `${summary.failedDelegateCount} failed`,
    `${summary.delegateSource} source`,
    summary.teamName ? `${summary.teamName} team` : undefined,
    agent?.projectName ? `${agent.projectName} project` : undefined,
    agent?.runId ? `${agent.runId} run` : undefined,
  ];
  return parts.filter(Boolean).join(' / ');
}

function titleForKind(kind: DelegationTimelineEventKind): string {
  if (kind === 'delegation.started') return 'Delegation started';
  if (kind === 'delegation.progress') return 'Delegation progress';
  if (kind === 'delegation.completed') return 'Delegation completed';
  if (kind === 'delegation.failed') return 'Delegation failed';
  return 'Delegation cancelled';
}

function severityForKind(
  kind: DelegationTimelineEventKind,
): 'info' | 'success' | 'warning' | 'error' {
  if (kind === 'delegation.completed') return 'success';
  if (kind === 'delegation.failed') return 'error';
  if (kind === 'delegation.cancelled') return 'warning';
  return 'info';
}

function delegationSignature(summary: DelegationSummary): string {
  return [
    summary.status,
    summary.activeDelegateCount,
    summary.completedDelegateCount,
    summary.failedDelegateCount,
    summary.delegateSource,
    summary.teamName ?? '',
  ].join('|');
}

function providerLabel(providerId: string): string {
  if (providerId === 'codex') return 'Codex';
  if (providerId === 'claude') return 'Claude';
  return providerId;
}

function terminalKindForHintedMissingCurrent(
  previous: DelegationSummary,
  hint: DelegationTimelineTransitionHint | undefined,
): DelegationTimelineEventKind | undefined {
  if (!hint) return undefined;
  if (previous.status === 'delegate_error') return undefined;
  if (previous.status === 'waiting_for_delegate') return undefined;
  if (hint.reason === 'failed') return 'delegation.failed';
  if (hint.reason === 'cancelled') return 'delegation.cancelled';
  return 'delegation.completed';
}
