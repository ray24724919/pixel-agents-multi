import { type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { TIMELINE_REPLAY_SPEED_OPTIONS } from '../../constants.js';
import { timelineCategoryLabel } from '../timelinePageModel.js';
import type {
  TimelineReplayFrameMarker,
  TimelineReplaySession,
  TimelineReplayState,
} from '../timelineReplayModel.js';
import { Button } from '../ui/Button.js';
import { formatRelative, severityDot } from './formatters.js';
import { SectionHeader } from './SectionHeader.js';

export function TimelineReplayPanel({
  sessions,
  selectedSessionId,
  state,
  isPlaying,
  speed,
  onSessionChange,
  onFirst,
  onPrevious,
  onNext,
  onLast,
  onTogglePlay,
  onSpeedChange,
}: {
  sessions: TimelineReplaySession[];
  selectedSessionId: string;
  state: TimelineReplayState;
  isPlaying: boolean;
  speed: number;
  onSessionChange: (sessionId: string) => void;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onLast: () => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
}) {
  const frame = state.currentFrame;
  const selectedSessionMissing =
    state.unavailableReason === 'session-filtered-out' && selectedSessionId !== '';
  const replayHint = timelineReplayHintText(state);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (isReplayKeyboardTargetInteractive(event.target)) return;
    if (event.key === 'ArrowLeft' || event.key === 'Left') {
      if (!state.hasPrevious) return;
      event.preventDefault();
      onPrevious();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'Right') {
      if (!state.hasNext) return;
      event.preventDefault();
      onNext();
      return;
    }
    if (event.key === 'Home') {
      if (!state.hasFirst) return;
      event.preventDefault();
      onFirst();
      return;
    }
    if (event.key === 'End') {
      if (!state.hasLast) return;
      event.preventDefault();
      onLast();
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      if (!isPlaying && !state.hasNext) return;
      event.preventDefault();
      onTogglePlay();
    }
  };
  return (
    <section
      className="border border-border bg-bg outline-none focus:border-accent"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Session Replay controls"
    >
      <SectionHeader
        title="Session Replay"
        subtitle="Normalized event playback from local timeline history"
      />
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_auto_minmax(240px,0.9fr)]">
        <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
          Scope
          <select
            className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
            value={selectedSessionId}
            onChange={(event) => onSessionChange(event.currentTarget.value)}
            aria-label="Select replay scope"
            disabled={sessions.length === 0}
          >
            {sessions.length === 0 ? (
              <option value="">No replay sessions</option>
            ) : (
              <>
                {selectedSessionMissing && (
                  <option value={selectedSessionId}>Selected replay scope hidden by filters</option>
                )}
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.label} ({session.frameCount})
                  </option>
                ))}
              </>
            )}
          </select>
          {selectedSessionMissing && (
            <div className="mt-2 text-xs normal-case tracking-normal text-status-permission">
              The selected replay scope is outside the current filters.
            </div>
          )}
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant={state.hasFirst ? 'default' : 'disabled'}
            size="sm"
            disabled={!state.hasFirst}
            onClick={onFirst}
          >
            First
          </Button>
          <Button
            variant={state.hasPrevious ? 'default' : 'disabled'}
            size="sm"
            disabled={!state.hasPrevious}
            onClick={onPrevious}
          >
            Prev
          </Button>
          <Button
            variant={state.hasNext ? 'default' : 'disabled'}
            size="sm"
            disabled={!state.hasNext}
            onClick={onTogglePlay}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <Button
            variant={state.hasNext ? 'default' : 'disabled'}
            size="sm"
            disabled={!state.hasNext}
            onClick={onNext}
          >
            Next
          </Button>
          <Button
            variant={state.hasLast ? 'default' : 'disabled'}
            size="sm"
            disabled={!state.hasLast}
            onClick={onLast}
          >
            Last
          </Button>
          <label className="min-w-[104px] text-xs uppercase tracking-wide text-text-muted">
            Speed
            <select
              className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
              value={String(speed)}
              onChange={(event) => onSpeedChange(Number(event.currentTarget.value))}
              aria-label="Replay speed"
            >
              {TIMELINE_REPLAY_SPEED_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>
                  {option}x
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-w-0 border border-border bg-btn-bg p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${severityDot(state.severity)}`} />
            <span className="shrink-0 border border-border bg-bg px-2 py-1 text-xs uppercase tracking-wide text-text-muted">
              {state.statusLabel}
            </span>
            <span className="text-xs text-text-muted">{state.progressLabel}</span>
          </div>
          <div className="mt-2 h-2 border border-border bg-bg">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
          <div className="mt-3 min-w-0">
            <div className="truncate text-sm text-text">
              {frame ? frame.event.title : 'No replay frame selected'}
            </div>
            <div className="mt-1 break-words text-xs text-text-muted">
              {frame?.event.summary ?? replayHint}
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
              {state.kind && <span className="truncate">{state.kind}</span>}
              {state.category && <span>{timelineCategoryLabel(state.category)}</span>}
              {frame && <span>{formatRelative(frame.timestamp)}</span>}
              {state.isSingleFrame && <span>Single-frame replay</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function timelineReplayHintText(state: TimelineReplayState): string {
  if (state.unavailableReason === 'session-filtered-out') {
    return 'The selected replay scope is hidden by the current Timeline filters. Choose another scope or clear filters.';
  }
  if (state.unavailableReason === 'no-sessions') {
    return 'No replay sessions are available in the current Timeline filters.';
  }
  if (state.isSingleFrame) {
    return 'This replay has one frame, so previous and next controls stay disabled.';
  }
  return 'Choose a replay scope with timeline events.';
}

function isReplayKeyboardTargetInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

export function TimelineReplayPill({ marker }: { marker: TimelineReplayFrameMarker }) {
  return (
    <span
      className="shrink-0 border border-accent bg-bg px-2 py-1 text-xs uppercase tracking-wide text-accent-bright"
      title={marker.label}
    >
      Replay
    </span>
  );
}
