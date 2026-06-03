import {
  appendTimelineRecord,
  readTimelineRecords,
  type TimelineRecordInput,
  type TimelineRecordV1,
  type TimelineStoreOptions,
} from './timelineStore.js';

export interface TimelineHistoryLoadedMessage {
  type: 'timelineHistoryLoaded';
  records: TimelineRecordV1[];
  loadedAtMs: number;
  unavailable?: boolean;
  error?: string;
}

export function loadTimelineHistoryForWebview(
  options: TimelineStoreOptions = {},
  loadedAtMs = Date.now(),
): TimelineHistoryLoadedMessage {
  try {
    return {
      type: 'timelineHistoryLoaded',
      records: readTimelineRecords(options),
      loadedAtMs,
    };
  } catch (error) {
    return {
      type: 'timelineHistoryLoaded',
      records: [],
      loadedAtMs,
      unavailable: true,
      error: timelineHistoryErrorMessage(error),
    };
  }
}

export function persistTimelineEventForWebview(
  event: TimelineRecordInput,
  options: TimelineStoreOptions = {},
): TimelineRecordV1 | undefined {
  return appendTimelineRecord(event, options);
}

function timelineHistoryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error || 'Unknown timeline history read error');
}
