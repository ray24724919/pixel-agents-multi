import type { TimelinePageItem, TimelineSeverity } from '../timelinePageModel.js';
import { timelineSeverityLabel } from '../timelinePageModel.js';
import type { TimelineReplayFrameMarker } from '../timelineReplayModel.js';
import { Button } from '../ui/Button.js';
import { formatRelative, severityDot, timelineSeverityClass } from './formatters.js';
import { ProviderBadge } from './ProviderBadge.js';
import { TimelineReplayPill } from './TimelineReplayPanel.js';

export function TimelineFilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: Array<{ value: string; label: string; count: number }>;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <label className="min-w-0 text-xs uppercase tracking-wide text-text-muted">
      {label}
      <select
        className="mt-2 h-34 w-full border border-border bg-bg px-3 text-sm normal-case tracking-normal text-text outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label={ariaLabel}
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export function TimelineEmptyState({
  hasEvents,
  hasFilters,
  onClearFilters,
}: {
  hasEvents: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="p-8 text-center text-text-muted">
      <div className="text-lg text-accent-bright">
        {hasEvents ? 'No events match these filters' : 'No timeline events yet'}
      </div>
      <div className="mt-2 text-sm">
        {hasEvents
          ? 'Adjust search or filters to widen the event history.'
          : 'Lifecycle and action events will appear here as agents run.'}
      </div>
      {hasFilters && (
        <div className="mt-4">
          <Button variant="default" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

export function TimelineEventRow({
  event,
  replayMarker,
  onSelectReplay,
}: {
  event: TimelinePageItem;
  replayMarker: TimelineReplayFrameMarker;
  onSelectReplay: () => void;
}) {
  return (
    <button
      type="button"
      className={`grid w-full cursor-pointer gap-3 p-4 text-left hover:bg-btn-bg md:grid-cols-[98px_minmax(0,1.2fr)_minmax(180px,0.8fr)] ${
        replayMarker.isCurrent ? 'bg-active-bg' : 'bg-transparent'
      }`}
      onClick={onSelectReplay}
      title={replayMarker.isCurrent ? replayMarker.label : 'Cue replay to this event'}
    >
      <div className="text-xs text-text-muted">{formatRelative(event.timestamp)}</div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${severityDot(event.severity)}`} />
          <TimelineSeverityPill severity={event.severity} />
          {event.isActionLike && <TimelineHistoryPill event={event} />}
          {replayMarker.isCurrent && <TimelineReplayPill marker={replayMarker} />}
          <span className="min-w-[120px] max-w-full truncate text-sm text-text">{event.title}</span>
        </div>
        {event.summary && (
          <div className="mt-1 break-words text-xs text-text-muted">{event.summary}</div>
        )}
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className="truncate">{event.kind}</span>
          <span>{event.source}</span>
          {event.sessionId && <span className="truncate">{event.sessionId}</span>}
          {event.runId && <span className="truncate">{event.runId}</span>}
          {event.artifactId && <span className="truncate">{event.artifactId}</span>}
          {event.artifactStatus && <span className="truncate">{event.artifactStatus}</span>}
          {event.dispatchStatus && <span className="truncate">{event.dispatchStatus}</span>}
          {event.executionStatus && <span className="truncate">{event.executionStatus}</span>}
          {event.linkedAgentName && <span className="truncate">{event.linkedAgentName}</span>}
          {event.linkedAgentId !== undefined && (
            <span className="truncate">agent {event.linkedAgentId}</span>
          )}
          {event.packageRelativePath && (
            <span className="truncate">{event.packageRelativePath}</span>
          )}
          {event.reportRelativePath && <span className="truncate">{event.reportRelativePath}</span>}
          {event.previousStatus && event.nextStatus && (
            <span className="truncate">
              {event.previousStatus} -&gt; {event.nextStatus}
            </span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ProviderBadge providerId={event.providerId} />
          <span className="truncate text-sm text-text">{event.agentName}</span>
          <span className="shrink-0 text-xs text-text-muted">#{event.agentId}</span>
        </div>
        <div className="mt-1 truncate text-xs text-text-muted">{event.project}</div>
      </div>
    </button>
  );
}

function TimelineSeverityPill({ severity }: { severity: TimelineSeverity }) {
  return (
    <span
      className={`shrink-0 border px-2 py-1 text-xs uppercase tracking-wide ${timelineSeverityClass(
        severity,
      )}`}
    >
      {timelineSeverityLabel(severity)}
    </span>
  );
}

function TimelineHistoryPill({ event }: { event: TimelinePageItem }) {
  const label = event.kind.startsWith('handoff.')
    ? 'Handoff'
    : event.isDelegationLike
      ? 'Delegation'
      : 'Action';
  return (
    <span className="shrink-0 border border-accent bg-btn-bg px-2 py-1 text-xs uppercase tracking-wide text-accent-bright">
      {label}
    </span>
  );
}
