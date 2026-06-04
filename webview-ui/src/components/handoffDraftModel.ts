import { HANDOFF_DRAFT_MAX_IMPORTANT_EVENTS } from '../constants.js';
import type { TimelineLifecycleStatus, TimelinePageItem } from './timelinePageModel.js';
import {
  usageHistoryAccuracyLabel,
  type UsageHistoryModel,
  type UsageHistoryRateLimitSnapshot,
} from './usageHistoryModel.js';

export interface HandoffUsageSummaryInput {
  recordCount?: number;
  usageRecordCount?: number;
  providerLabel?: string;
  modelLabel?: string;
  displayTokens?: number;
  providerTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningOutputTokens?: number;
  artifactOutputTokens?: number;
  accuracyLabel?: string;
  apiProxyEstimateUsd?: number;
  rateLimitSummary?: string;
  nonBillingNote?: string;
}

export interface HandoffDraftInput {
  title?: string;
  project?: string;
  providerId?: string;
  agentName?: string;
  agentId?: number;
  sessionId?: string;
  runId?: string;
  currentStatus?: TimelineLifecycleStatus | string;
  timelineEvents?: readonly TimelinePageItem[];
  usageSummary?: HandoffUsageSummaryInput;
  maxImportantEvents?: number;
}

export interface HandoffDraftMetadata {
  title: string;
  project: string;
  providerId: string;
  agentName?: string;
  agentId?: number;
  sessionId?: string;
  runId?: string;
  fromMs?: number;
  toMs?: number;
  currentStatus: string;
  eventCount: number;
  includedEventCount: number;
  importantEventIds: string[];
  hasUsageSummary: boolean;
}

export interface HandoffDraft {
  markdown: string;
  metadata: HandoffDraftMetadata;
}

interface HandoffDraftScope {
  title: string;
  project: string;
  providerId: string;
  agentName?: string;
  agentId?: number;
  sessionId?: string;
  runId?: string;
  fromMs?: number;
  toMs?: number;
  currentStatus: string;
}

const UNKNOWN_PROJECT = 'Unknown project';
const UNKNOWN_PROVIDER = 'unknown';
const UNKNOWN_STATUS = 'unknown';
const MIXED_PROJECTS = 'Multiple projects';
const MIXED_PROVIDERS = 'multiple';
const MIXED_AGENTS = 'Multiple agents';
const MIXED_SESSIONS = 'multiple-sessions';
const MIXED_RUNS = 'multiple-runs';
const REDACTED_PATH = '[redacted path]';
const REDACTED_SECRET = '[redacted secret]';
const REDACTED_RAW_CONTENT = '[redacted content]';
const API_PROXY_NON_BILLING_NOTE = 'API proxy estimate only. Not actual subscription billing.';

const RAW_CONTENT_PATTERN =
  /\b(?:raw\s+prompt|prompt|raw\s+tool\s+output|tool\s+output|stdout|stderr|transcript(?:\s+text)?)\s*:\s*[^.\n\r;]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b[A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*[:=]\s*["']?[^\s"',;]+/gi;
const AUTHORIZATION_PATTERN = /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const WINDOWS_NAMESPACED_PATH_PATTERN =
  /\\\\\?\\(?:UNC\\[^\\/:*?"<>|\s]+\\[^\\/:*?"<>|\s]+|[A-Za-z]:)\\[^\s`'")\]}<>]+/g;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s`'")\]}<>]+/g;
const UNC_PATH_PATTERN = /\\\\[^\\/:*?"<>|\s]+\\[^\\/:*?"<>|\s]+(?:\\[^\s`'")\]}<>]+)*/g;
const POSIX_PATH_PATTERN =
  /(^|[\s(["'])\/(?:Users|home|var|tmp|private|mnt|Volumes)\/[^\s`'")\]}<>]+/g;

export function buildHandoffDraft(input: HandoffDraftInput): HandoffDraft {
  const events = (input.timelineEvents ?? []).slice().sort(compareEventsChronologically);
  const scope = buildHandoffDraftScope(input, events);
  const importantEvents = selectImportantTimelineEvents(
    events,
    input.maxImportantEvents ?? HANDOFF_DRAFT_MAX_IMPORTANT_EVENTS,
  );

  const metadata: HandoffDraftMetadata = {
    ...scope,
    eventCount: events.length,
    includedEventCount: importantEvents.length,
    importantEventIds: importantEvents.map((event) => event.id),
    hasUsageSummary: input.usageSummary !== undefined,
  };

  return {
    markdown: buildHandoffMarkdown(scope, importantEvents, input.usageSummary),
    metadata,
  };
}

export function buildHandoffUsageSummaryFromHistoryModel(
  model: UsageHistoryModel,
): HandoffUsageSummaryInput {
  const topProvider = model.providers[0];
  const topModel = model.models[0];
  return {
    recordCount: model.totals.recordCount,
    usageRecordCount: model.totals.usageRecordCount,
    providerLabel: topProvider?.label,
    modelLabel: topModel?.label,
    displayTokens: model.totals.displayTokens,
    providerTokens: model.totals.providerTokens,
    inputTokens: model.totals.inputTokens,
    outputTokens: model.totals.outputTokens,
    cacheReadTokens: model.totals.cacheReadTokens,
    cacheWriteTokens: model.totals.cacheWriteTokens,
    reasoningOutputTokens: model.totals.reasoningOutputTokens,
    artifactOutputTokens: model.totals.artifactOutputTokens,
    accuracyLabel: usageHistoryAccuracyLabel(model.totals.accuracy),
    apiProxyEstimateUsd: model.totals.apiProxyEstimateUsd,
    rateLimitSummary: summarizeRateLimits(model.latestRateLimits),
    nonBillingNote: API_PROXY_NON_BILLING_NOTE,
  };
}

export function sanitizeHandoffText(value: string | number | undefined, fallback = ''): string {
  const rawValue = value === undefined ? fallback : String(value);
  const normalized = rawValue.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized
    .replace(RAW_CONTENT_PATTERN, REDACTED_RAW_CONTENT)
    .replace(SECRET_ASSIGNMENT_PATTERN, REDACTED_SECRET)
    .replace(AUTHORIZATION_PATTERN, REDACTED_SECRET)
    .replace(WINDOWS_NAMESPACED_PATH_PATTERN, REDACTED_PATH)
    .replace(UNC_PATH_PATTERN, REDACTED_PATH)
    .replace(WINDOWS_PATH_PATTERN, REDACTED_PATH)
    .replace(POSIX_PATH_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED_PATH}`)
    .trim();
}

function buildHandoffDraftScope(
  input: HandoffDraftInput,
  events: readonly TimelinePageItem[],
): HandoffDraftScope {
  const project = sanitizeHandoffText(
    input.project ?? singleTextValue(events, (event) => event.project, MIXED_PROJECTS),
    UNKNOWN_PROJECT,
  );
  const providerId = sanitizeHandoffText(
    input.providerId ?? singleTextValue(events, (event) => event.providerId, MIXED_PROVIDERS),
    UNKNOWN_PROVIDER,
  );
  const agentId = input.agentId ?? singleNumberValue(events, (event) => event.agentId);
  const agentName = sanitizeOptionalText(
    input.agentName ?? singleTextValue(events, (event) => event.agentName, MIXED_AGENTS),
  );
  const sessionId = sanitizeOptionalText(
    input.sessionId ?? singleTextValue(events, (event) => event.sessionId, MIXED_SESSIONS),
  );
  const runId = sanitizeOptionalText(
    input.runId ?? singleTextValue(events, (event) => event.runId, MIXED_RUNS),
  );
  const timeWindow = getTimeWindow(events);
  const currentStatus = sanitizeHandoffText(
    input.currentStatus ?? deriveCurrentStatus(events),
    UNKNOWN_STATUS,
  );
  const title = sanitizeHandoffText(input.title ?? `Handoff Draft - ${project}`, 'Handoff Draft');

  return {
    title,
    project,
    providerId,
    agentName,
    agentId,
    sessionId,
    runId,
    fromMs: timeWindow.fromMs,
    toMs: timeWindow.toMs,
    currentStatus,
  };
}

function buildHandoffMarkdown(
  scope: HandoffDraftScope,
  importantEvents: readonly TimelinePageItem[],
  usageSummary: HandoffUsageSummaryInput | undefined,
): string {
  const sections = [
    `# ${scope.title}`,
    buildScopeSection(scope),
    buildTimelineSection(importantEvents),
    buildPlaceholderSection('Action / Decision Summary', [
      '- Decisions made:',
      '- Actions already taken:',
      '- Open decisions:',
    ]),
    buildPlaceholderSection('Validation / Test Summary', [
      '- Validation completed:',
      '- Tests run:',
      '- Known gaps:',
    ]),
    usageSummary ? buildUsageSummarySection(usageSummary) : undefined,
    buildPlaceholderSection('Follow-Up Checklist', [
      '- [ ] Confirm remaining owner and next step.',
      '- [ ] Re-run relevant validation before handing off externally.',
      '- [ ] Link or attach safe artifacts only.',
    ]),
    [
      '## Privacy Note',
      'This draft is built from normalized Timeline and Usage data only. It intentionally excludes raw prompts, raw tool output, transcript text, absolute local paths, credentials, and environment details.',
    ].join('\n'),
  ];

  return sections.filter((section): section is string => section !== undefined).join('\n\n');
}

function buildScopeSection(scope: HandoffDraftScope): string {
  return [
    '## Scope',
    `- Project: ${scope.project}`,
    `- Provider: ${scope.providerId}`,
    `- Agent: ${formatAgentIdentity(scope)}`,
    `- Session: ${scope.sessionId ?? 'Not supplied'}`,
    `- Run: ${scope.runId ?? 'Not supplied'}`,
    `- Time window: ${formatTimeWindow(scope.fromMs, scope.toMs)}`,
    `- Current / final status: ${scope.currentStatus}`,
  ].join('\n');
}

function buildTimelineSection(events: readonly TimelinePageItem[]): string {
  if (events.length === 0) {
    return [
      '## Important Timeline Events',
      'No timeline events were supplied for this handoff draft.',
    ].join('\n');
  }

  return [
    '## Important Timeline Events',
    ...events.map((event) => {
      const summary = sanitizeOptionalText(event.summary);
      const suffix = summary ? ` - ${summary}` : '';
      return `- ${formatTimestamp(event.timestamp)} [${sanitizeHandoffText(event.kind, 'event')}] ${sanitizeHandoffText(event.title, 'Untitled event')}${suffix}`;
    }),
  ].join('\n');
}

function buildUsageSummarySection(summary: HandoffUsageSummaryInput): string {
  const lines = [
    '## Usage Summary',
    `- Records: ${formatOptionalNumber(summary.recordCount)} total / ${formatOptionalNumber(summary.usageRecordCount)} usage records`,
    `- Provider / model: ${sanitizeHandoffText(summary.providerLabel, 'Unknown provider')} / ${sanitizeHandoffText(summary.modelLabel, 'Unknown model')}`,
    `- Tokens: ${formatOptionalNumber(summary.displayTokens)} display, ${formatOptionalNumber(summary.providerTokens)} provider, ${formatOptionalNumber(summary.inputTokens)} input, ${formatOptionalNumber(summary.outputTokens)} output`,
    `- Cache / reasoning: ${formatOptionalNumber(summary.cacheReadTokens)} cache read, ${formatOptionalNumber(summary.cacheWriteTokens)} cache write, ${formatOptionalNumber(summary.reasoningOutputTokens)} reasoning output`,
    `- Artifact estimate: ${formatOptionalNumber(summary.artifactOutputTokens)} tokens`,
    `- Accuracy: ${sanitizeHandoffText(summary.accuracyLabel, 'Not supplied')}`,
  ];
  if (summary.apiProxyEstimateUsd !== undefined) {
    lines.push(`- API proxy estimate: $${summary.apiProxyEstimateUsd.toFixed(4)}`);
  }
  if (summary.rateLimitSummary) {
    lines.push(`- Latest quota snapshot: ${sanitizeHandoffText(summary.rateLimitSummary)}`);
  }
  lines.push(
    `- Billing note: ${sanitizeHandoffText(summary.nonBillingNote, API_PROXY_NON_BILLING_NOTE)}`,
  );
  return lines.join('\n');
}

function buildPlaceholderSection(title: string, lines: readonly string[]): string {
  return [`## ${title}`, ...lines].join('\n');
}

function selectImportantTimelineEvents(
  events: readonly TimelinePageItem[],
  maxEvents: number,
): TimelinePageItem[] {
  const safeMax = Math.max(0, Math.floor(maxEvents));
  if (safeMax === 0) return [];
  const important = events.filter((event) => {
    return (
      event.severity === 'warning' ||
      event.severity === 'error' ||
      event.isActionLike ||
      event.isDelegationLike ||
      event.category === 'run' ||
      event.statusAfter === 'completed' ||
      event.statusAfter === 'error'
    );
  });
  const candidates = important.length > 0 ? important : events;
  return candidates.slice(Math.max(0, candidates.length - safeMax));
}

function deriveCurrentStatus(events: readonly TimelinePageItem[]): string {
  const latest = events.slice().sort(compareEventsNewestFirst)[0];
  if (!latest) return UNKNOWN_STATUS;
  if (latest.statusAfter) return latest.statusAfter;
  if (latest.severity === 'error') return 'error';
  if (latest.kind.endsWith('.completed')) return 'completed';
  if (latest.kind.endsWith('.failed')) return 'error';
  return latest.category;
}

function getTimeWindow(events: readonly TimelinePageItem[]): { fromMs?: number; toMs?: number } {
  if (events.length === 0) return {};
  const timestamps = events.map((event) => event.timestamp).filter(Number.isFinite);
  if (timestamps.length === 0) return {};
  return {
    fromMs: Math.min(...timestamps),
    toMs: Math.max(...timestamps),
  };
}

function summarizeRateLimits(
  rateLimits: readonly UsageHistoryRateLimitSnapshot[],
): string | undefined {
  if (rateLimits.length === 0) return undefined;
  return rateLimits
    .map((rateLimit) => {
      const used =
        rateLimit.usedPercent === undefined ? 'unknown' : `${rateLimit.usedPercent}% used`;
      const reset =
        rateLimit.resetAtMs === undefined
          ? 'reset unknown'
          : `resets ${formatTimestamp(rateLimit.resetAtMs)}`;
      return `${rateLimit.providerLabel} ${rateLimit.name}: ${used}, ${reset}`;
    })
    .join('; ');
}

function formatAgentIdentity(scope: HandoffDraftScope): string {
  const name = scope.agentName ?? 'Not supplied';
  return scope.agentId === undefined ? name : `${name} #${scope.agentId}`;
}

function formatTimeWindow(fromMs: number | undefined, toMs: number | undefined): string {
  if (fromMs === undefined || toMs === undefined) return 'Not supplied';
  if (fromMs === toMs) return formatTimestamp(fromMs);
  return `${formatTimestamp(fromMs)} to ${formatTimestamp(toMs)}`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? 'Not supplied' : Math.round(value).toLocaleString('en-US');
}

function sanitizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const sanitized = sanitizeHandoffText(value);
  return sanitized || undefined;
}

function singleTextValue(
  events: readonly TimelinePageItem[],
  valueFor: (event: TimelinePageItem) => string | undefined,
  mixedLabel: string,
): string | undefined {
  const values = [
    ...new Set(events.map(valueFor).filter((value): value is string => Boolean(value))),
  ];
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0];
  return mixedLabel;
}

function singleNumberValue(
  events: readonly TimelinePageItem[],
  valueFor: (event: TimelinePageItem) => number | undefined,
): number | undefined {
  const values = [
    ...new Set(events.map(valueFor).filter((value): value is number => value !== undefined)),
  ];
  return values.length === 1 ? values[0] : undefined;
}

function compareEventsChronologically(a: TimelinePageItem, b: TimelinePageItem): number {
  return a.timestamp - b.timestamp || a.id.localeCompare(b.id);
}

function compareEventsNewestFirst(a: TimelinePageItem, b: TimelinePageItem): number {
  return b.timestamp - a.timestamp || b.id.localeCompare(a.id);
}
