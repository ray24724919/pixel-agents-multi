import type { DelegationSummary } from '../components/delegationModel.js';
import { delegationTotalCount } from '../components/delegationModel.js';
import type { DelegationVisualState } from './types.js';

export function buildDelegationVisualState(
  summary: DelegationSummary | undefined,
): DelegationVisualState | undefined {
  if (!summary || summary.status === 'none') return undefined;
  const totalDelegateCount = delegationTotalCount(summary);
  if (totalDelegateCount <= 0) return undefined;
  return {
    status: summary.status,
    activeDelegateCount: summary.activeDelegateCount,
    completedDelegateCount: summary.completedDelegateCount,
    failedDelegateCount: summary.failedDelegateCount,
    totalDelegateCount,
    delegateSource: summary.delegateSource,
    teamName: summary.teamName,
    isActive: summary.activeDelegateCount > 0,
  };
}

export function delegationVisualWorkerLabel(delegation: DelegationVisualState | undefined): string {
  const count = delegation?.totalDelegateCount ?? 0;
  return `${count} ${count === 1 ? 'worker' : 'workers'}`;
}

export function delegationVisualMarkerText(delegation: DelegationVisualState | undefined): string {
  const count = delegation?.totalDelegateCount ?? 0;
  return `${count}w`;
}

export function delegationVisualStatusLabel(delegation: DelegationVisualState | undefined): string {
  if (!delegation) return 'Delegation';
  if (delegation.failedDelegateCount > 0 && delegation.activeDelegateCount === 0) {
    return 'Worker error';
  }
  if (delegation.failedDelegateCount > 0) return 'Supervising with errors';
  if (delegation.isActive) return 'Supervising';
  return 'Workers done';
}
