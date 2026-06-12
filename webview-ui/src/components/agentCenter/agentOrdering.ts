import type { AgentListStatusGroup } from '../agentCenterListModel.js';
import type { AgentSummary } from './types.js';

export function compareTeamMembers(a: AgentSummary, b: AgentSummary): number {
  if (a.isTeamLead && !b.isTeamLead) return -1;
  if (!a.isTeamLead && b.isTeamLead) return 1;
  if (a.statusGroup === 'needs_me' && b.statusGroup !== 'needs_me') return -1;
  if (a.statusGroup !== 'needs_me' && b.statusGroup === 'needs_me') return 1;
  if (isWorkingStatusGroup(a.statusGroup) && !isWorkingStatusGroup(b.statusGroup)) return -1;
  if (!isWorkingStatusGroup(a.statusGroup) && isWorkingStatusGroup(b.statusGroup)) return 1;
  return a.name.localeCompare(b.name);
}

export function isWorkingStatusGroup(statusGroup: AgentListStatusGroup): boolean {
  return statusGroup === 'active' || statusGroup === 'delegating';
}
