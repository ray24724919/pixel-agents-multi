import { readUsageRecords, type UsageRecordV1, type UsageStoreOptions } from './usageStore.js';

export interface UsageHistoryLoadedMessage {
  type: 'usageHistoryLoaded';
  records: UsageRecordV1[];
  loadedAtMs: number;
  unavailable?: boolean;
  error?: string;
}

export function loadUsageHistoryForWebview(
  options: UsageStoreOptions = {},
  loadedAtMs = Date.now(),
): UsageHistoryLoadedMessage {
  try {
    return {
      type: 'usageHistoryLoaded',
      records: readUsageRecords(options).map(redactRawPathsForWebview),
      loadedAtMs,
    };
  } catch (error) {
    return {
      type: 'usageHistoryLoaded',
      records: [],
      loadedAtMs,
      unavailable: true,
      error: usageHistoryErrorMessage(error),
    };
  }
}

function redactRawPathsForWebview(record: UsageRecordV1): UsageRecordV1 {
  const project = { ...record.project };
  const session = { ...record.session };
  delete project.dir;
  delete session.transcriptPath;
  return {
    ...record,
    project,
    session,
  };
}

function usageHistoryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error || 'Unknown usage history read error');
}
