import type { UsageHistoryRecordV1 } from '../components/usageHistoryModel.js';

export interface UsageHistoryState {
  records: UsageHistoryRecordV1[];
  loadedAtMs?: number;
  unavailable: boolean;
  error?: string;
}

export interface UsageHistoryLoadedMessage {
  type: 'usageHistoryLoaded';
  records?: unknown;
  loadedAtMs?: unknown;
  unavailable?: unknown;
  error?: unknown;
}

export const initialUsageHistoryState: UsageHistoryState = {
  records: [],
  unavailable: false,
};

export function usageHistoryStateFromLoadedMessage(
  message: UsageHistoryLoadedMessage,
): UsageHistoryState {
  const loadedAtMs =
    typeof message.loadedAtMs === 'number' && Number.isFinite(message.loadedAtMs)
      ? message.loadedAtMs
      : undefined;
  const error =
    typeof message.error === 'string' && message.error.trim().length > 0
      ? message.error
      : undefined;
  return {
    records: Array.isArray(message.records) ? (message.records as UsageHistoryRecordV1[]) : [],
    loadedAtMs,
    unavailable: message.unavailable === true,
    error,
  };
}
