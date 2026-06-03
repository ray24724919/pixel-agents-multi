import {
  buildUsageHistoryModel,
  type UsageHistoryFilters,
  type UsageHistoryModel,
  type UsageHistoryRecordV1,
} from './usageHistoryModel.js';

export type UsageHistoryTimeFilter = 'all' | 'today' | 'last_7_days';

export interface UsageHistoryPageFilters {
  providerId: 'all' | string;
  projectKey: 'all' | string;
  timeWindow: UsageHistoryTimeFilter;
}

export interface UsageHistoryPageOption {
  value: string;
  label: string;
  detail?: string;
}

export interface UsageHistoryPageModel {
  source: UsageHistoryModel;
  filtered: UsageHistoryModel;
  providerOptions: UsageHistoryPageOption[];
  projectOptions: UsageHistoryPageOption[];
  hasFilters: boolean;
  exportCsv: string;
  exportRowCount: number;
}

export interface UsageHistoryUnavailableMessage {
  title: string;
  detail: string;
}

export const DEFAULT_USAGE_HISTORY_PAGE_FILTERS: UsageHistoryPageFilters = {
  providerId: 'all',
  projectKey: 'all',
  timeWindow: 'all',
};

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

export function buildUsageHistoryPageModel(
  records: readonly UsageHistoryRecordV1[],
  filters: UsageHistoryPageFilters = DEFAULT_USAGE_HISTORY_PAGE_FILTERS,
  nowMs = Date.now(),
): UsageHistoryPageModel {
  const source = buildUsageHistoryModel(records, { nowMs });
  const modelFilters = buildUsageHistoryFilters(filters, source, nowMs);
  const filtered = buildUsageHistoryModel(records, { filters: modelFilters, nowMs });
  return {
    source,
    filtered,
    providerOptions: source.providers.map((provider) => ({
      value: provider.providerId,
      label: provider.label,
      detail: `${provider.recordCount} records`,
    })),
    projectOptions: source.projects.map((project) => ({
      value: project.projectKey,
      label: project.projectName,
      detail: project.projectDirHash,
    })),
    hasFilters:
      filters.providerId !== 'all' || filters.projectKey !== 'all' || filters.timeWindow !== 'all',
    exportCsv: filtered.exportData.csv,
    exportRowCount: filtered.exportData.rows.length,
  };
}

export function usageHistoryTimeFilterLabel(filter: UsageHistoryTimeFilter): string {
  if (filter === 'today') return 'Today';
  if (filter === 'last_7_days') return 'Last 7 days';
  return 'All history';
}

export function usageHistoryUnavailableMessage(
  unavailable: boolean | undefined,
  error: string | undefined,
): UsageHistoryUnavailableMessage | undefined {
  if (!unavailable) return undefined;
  return {
    title: 'Usage history unavailable',
    detail: error ?? 'Pixel Agents could not read the local usage store.',
  };
}

function buildUsageHistoryFilters(
  filters: UsageHistoryPageFilters,
  source: UsageHistoryModel,
  nowMs: number,
): UsageHistoryFilters | undefined {
  const modelFilters: UsageHistoryFilters = {};
  if (filters.providerId !== 'all') {
    modelFilters.providerIds = [filters.providerId];
  }
  if (filters.projectKey !== 'all') {
    const project = source.projects.find((item) => item.projectKey === filters.projectKey);
    if (project) {
      modelFilters.projectNames = [project.projectName];
      if (project.projectDirHash) modelFilters.projectDirHashes = [project.projectDirHash];
    } else {
      modelFilters.projectNames = ['__missing_project__'];
    }
  }
  if (filters.timeWindow !== 'all') {
    const todayStart = startOfLocalDay(nowMs);
    modelFilters.fromMs =
      filters.timeWindow === 'today' ? todayStart : todayStart - (7 - 1) * MS_PER_DAY;
    modelFilters.toMs = todayStart + MS_PER_DAY - 1;
  }
  return Object.keys(modelFilters).length > 0 ? modelFilters : undefined;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
