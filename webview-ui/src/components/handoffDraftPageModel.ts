import {
  buildHandoffDraft,
  type HandoffDraft,
  type HandoffDraftInput,
  sanitizeHandoffText,
} from './handoffDraftModel.js';
import type { TimelinePageItem } from './timelinePageModel.js';
import type { TimelineReplayState } from './timelineReplayModel.js';

export type HandoffDraftSource = 'replay-session' | 'timeline-filtered' | 'none';
export type HandoffDraftNotice = 'no-timeline-events' | 'no-replay-session-selected';

export interface HandoffDraftPageModelInput {
  timelineEvents: readonly TimelinePageItem[];
  replayState: TimelineReplayState;
}

export interface HandoffDraftPageModel {
  source: HandoffDraftSource;
  sourceLabel: string;
  sourceDetail: string;
  canCreate: boolean;
  notice?: HandoffDraftNotice;
  draft?: HandoffDraft;
}

export function buildHandoffDraftPageModel(
  input: HandoffDraftPageModelInput,
): HandoffDraftPageModel {
  if (input.replayState.session) {
    const session = input.replayState.session;
    const timelineEvents = session.frames.map((frame) => frame.event);
    return {
      source: 'replay-session',
      sourceLabel: 'Selected replay session',
      sourceDetail: `${sanitizeHandoffText(session.label, 'Selected replay session')} / ${session.frameCount} ${frameCountLabel(session.frameCount)}`,
      canCreate: true,
      draft: buildHandoffDraft(
        withReplaySessionScope({
          timelineEvents,
          project: session.project,
          providerId: session.providerId,
          agentId: session.agentId,
          agentName: session.agentName,
          sessionId: session.sessionId,
          runId: session.runId,
          currentStatus: input.replayState.status,
        }),
      ),
    };
  }

  if (input.timelineEvents.length > 0) {
    return {
      source: 'timeline-filtered',
      sourceLabel: 'Current Timeline filters',
      sourceDetail: `${input.timelineEvents.length} filtered ${frameCountLabel(input.timelineEvents.length)}`,
      canCreate: true,
      notice: 'no-replay-session-selected',
      draft: buildHandoffDraft({
        title: 'Handoff Draft - Timeline filtered scope',
        timelineEvents: input.timelineEvents,
      }),
    };
  }

  return {
    source: 'none',
    sourceLabel: 'No timeline events available',
    sourceDetail: 'Run agents or clear Timeline filters before creating a handoff draft.',
    canCreate: false,
    notice: 'no-timeline-events',
  };
}

function withReplaySessionScope(input: HandoffDraftInput): HandoffDraftInput {
  return {
    ...input,
    title: `Handoff Draft - ${input.project ?? 'Replay session'}`,
  };
}

function frameCountLabel(count: number): string {
  return count === 1 ? 'event' : 'events';
}
