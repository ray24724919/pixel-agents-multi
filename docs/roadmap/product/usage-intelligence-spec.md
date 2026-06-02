# Usage Intelligence Spec

Date: 2026-06-02

## Product Objective

Usage Intelligence turns token counters into a local-first decision surface for supervising many AI
coding agents. It should help the user understand where usage went, whether anything looks unusual,
and which agents, projects, providers, models, and sessions are creating value.

This spec covers product and technical requirements only. It does not implement analytics UI,
storage, parsing, or provider changes.

## Scope

Usage Intelligence should support analytics across:

- Provider.
- Model.
- Project.
- Agent.
- Thread or session.
- Time window.
- Exact versus estimated usage.
- Cache, reasoning, and artifact token categories.
- API proxy estimate.

The first full UI should live in Agent Center 2.0 as a full Usage page, not a cramped modal. The
current office and compact Agent Center summaries can keep showing small provider totals, but the
analytics workflow needs room for charts, filters, tables, anomaly notes, thresholds, and export.

## Non-Goals

- Do not present token usage as real subscription billing.
- Do not upload transcripts, token records, project paths, or analytics data to a cloud service.
- Do not call provider APIs for usage data unless a future package explicitly adds opt-in support.
- Do not copy code from external dashboard projects.
- Do not treat estimated transcript usage as exact provider accounting.

## Questions Usage Intelligence Should Answer

- Where did usage go in the selected time window?
- Which provider, model, project, agent, team, or session consumed the most tokens?
- Which agents are using mostly input, output, cache, reasoning, or artifact tokens?
- Which usage is exact provider-reported usage, which is estimated, and which groups are mixed?
- Is the API proxy estimate trending upward, and which usage drove the change?
- Did a cache read/write pattern change unexpectedly?
- Did reasoning output spike for a model, agent, or project?
- Did an agent repeat work, loop, or consume many tokens without a visible outcome?
- Are Codex rate limits near a threshold or reset soon?
- Which projects appear valuable because they produced commits, fixes, or completed work packages?
- What can be exported for local review without exposing more path or transcript detail than needed?

## Current Data Sources Available

### Agent and Project Metadata

Current live state includes:

- `providerId` from agent creation and metadata messages.
- `projectDir`, `projectName`, `folderName`, and `transcriptPath`.
- Agent id, display name, team name, role name, lead/member metadata, hidden state, pause state, and
  lifecycle state.
- Session id and JSONL transcript path on the extension side.
- Agent lifecycle and timeline events already surfaced in Agent Center.

Relevant current files:

- `src/types.ts`
- `src/agentManager.ts`
- `src/PixelAgentsViewProvider.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/office/types.ts`

### Token Usage Summaries

Current token summaries include:

- Top-level `inputTokens`.
- Top-level `outputTokens`.
- `artifactOutputTokens`, estimated from generated code or patch tool payloads.
- `tokenUsageEstimated`, plus `tokenUsageDetails.estimated`.
- `TokenUsageDetails.input`.
- `TokenUsageDetails.output`.
- `TokenUsageDetails.reasoningOutput`.
- `TokenUsageDetails.cacheRead`.
- `TokenUsageDetails.cacheWrite`.
- `TokenUsageDetails.artifactEstimate`.
- Codex primary or secondary rate-limit snapshots when available.

Input totals currently include cache read/write tokens. Output totals currently include reasoning
output tokens. Artifact estimates are displayed separately and are not included in API proxy totals.

Relevant current files:

- `src/tokenUsage.ts`
- `src/transcriptParser.ts`
- `server/src/providers/file/codex/codex.ts`
- `webview-ui/src/components/tokenCostSummaryModel.ts`
- `webview-ui/src/components/TokenCostSummary.tsx`

### Provider-Specific Signals

Codex:

- `token_count` events can provide cumulative `total_token_usage`.
- `last_token_usage` exists for future turn-level aggregation.
- `rate_limits.primary` and `rate_limits.secondary` can provide quota percentage and reset data.
- Cumulative Codex snapshots need delta handling before they are stored as analytics events.

Claude:

- Provider usage objects can provide exact usage when present.
- Usage records are keyed by request/message identity when possible to avoid double-counting streamed
  updates.
- Transcript text fallback can estimate usage when exact usage objects are not present.
- Claude quota windows are not currently official provider quota readings in this codebase.

### Current UI Surfaces

The current Usage tab in `AgentCenter.tsx` already shows:

- A visible Usage state or empty state.
- Provider usage.
- Project usage.
- Agent usage ledger.
- Exact reported versus mixed exact/estimated status labels.
- Codex rate-limit reset text when available.

`TokenCostSummary` also shows Codex and Claude proxy rows with non-billing wording.

## Missing or Unreliable Data Sources

- No durable normalized usage store exists yet.
- No historical time buckets exist beyond what can be reconstructed from transcripts.
- Live character state is cumulative and in-memory, so it is not enough for historical analytics.
- Persisted agents do not persist token usage totals.
- Model id is not reliably surfaced for every provider/session.
- Provider usage events can be cumulative snapshots, streamed snapshots, or estimated deltas; they
  must be normalized before aggregation.
- Some transcript lines may lack reliable timestamps.
- `/clear`, session reassignment, restored terminals, external adoption, and Codex follow-on threads
  can change the relationship between an agent and transcript.
- Sub-agents and teammates may not always have separate durable transcripts or stable outcome data.
- Artifact tokens are estimates from tool payloads, not provider token accounting.
- API proxy rates are currently hardcoded display assumptions, not a billing source.
- Outcome quality is not yet normalized. Commits, fixed tests, completed work packages, and user
  approvals are not tied to usage records.
- Budget and threshold settings do not exist yet.

## Proposed Normalized Usage Record Schema

Store usage as append-only local records. A future implementation can use JSONL first and move to
SQLite if query performance or compaction requires it.

Recommended local path:

```text
~/.pixel-agents-multi/usage/usage-v1.jsonl
```

Each persisted record should represent a normalized delta or standalone observation, not an
uncorrected provider snapshot.

```ts
interface UsageRecordV1 {
  schemaVersion: 1;
  id: string;
  recordKind: 'usage_delta' | 'artifact_estimate' | 'rate_limit_snapshot' | 'session_summary';
  capturedAtMs: number;
  occurredAtMs?: number;
  bucketDateLocal?: string;

  provider: {
    id: string;
    label: string;
  };
  model?: {
    id?: string;
    displayName?: string;
    source: 'provider' | 'transcript' | 'unknown';
  };
  project: {
    name: string;
    dir?: string;
    dirHash?: string;
  };
  agent: {
    id: number;
    name: string;
    teamName?: string;
    roleName?: string;
    leadAgentId?: number;
    hidden?: boolean;
    archived?: boolean;
  };
  session: {
    id?: string;
    transcriptPath?: string;
    threadId?: string;
    turnId?: string;
  };

  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningOutputTokens: number;
    artifactOutputTokens: number;
  };
  totals: {
    providerInputTotal: number;
    providerOutputTotal: number;
    providerTotal: number;
    displayTotal: number;
  };
  accuracy: {
    tokenSource: 'exact_provider' | 'estimated_transcript' | 'mixed';
    artifactSource: 'estimated_tool_payload' | 'none';
    isDeltaFromSnapshot: boolean;
    evidence?: string;
  };
  apiProxyEstimate?: {
    currency: 'USD';
    inputRatePerMillion: number;
    outputRatePerMillion: number;
    inputProxy: number;
    outputProxy: number;
    totalProxy: number;
    rateSource: 'configured' | 'default';
    nonBillingLabel: 'API proxy estimate only';
  };
  rateLimits?: Array<{
    name: 'primary' | 'secondary';
    usedPercent?: number;
    remainingPercent?: number;
    resetAtMs?: number;
    resetAfterSeconds?: number;
    source: 'provider_exact' | 'estimated_window';
  }>;
}
```

### Schema Rules

- Aggregate `usage_delta` records, not raw cumulative provider snapshots.
- Preserve enough evidence to debug double-counting: transcript path, provider event type, usage key,
  and whether the record came from a snapshot delta.
- `providerInputTotal` equals input plus cache read plus cache write when those categories are split.
- `providerOutputTotal` equals output plus reasoning output when reasoning is split.
- `displayTotal` should exclude `artifactOutputTokens` unless the UI explicitly asks for artifact
  estimates.
- Artifact estimates stay separate from provider usage and API proxy totals.
- Groups containing any estimated records should be labeled mixed exact/estimated.
- `dirHash` should support redacted display/export without losing project grouping.

## Exact, Estimated, and Proxy Semantics

### Exact Provider Usage

Use `exact provider usage` only when the provider or CLI transcript supplies usage fields. Examples:

- Codex `token_count` data after snapshot-to-delta normalization.
- Claude usage objects after streamed snapshot de-duplication.

Exact usage can still be incomplete if model id, outcome, or timestamp is missing. The exact label
only describes token accounting.

### Estimated Usage

Use `estimated usage` when usage is derived from transcript text length or tool payloads. Estimated
usage should be marked at the record level and rolled up into mixed labels at aggregate levels.

Estimated transcript usage should not infer cache or reasoning categories unless a provider field
explicitly supplies them.

### Artifact Estimate

Use `artifact estimate` for generated code, patches, notebook edits, and similar tool payloads.
Artifact estimates are useful for understanding output volume, but they are not provider token
usage and are not priced in the API proxy estimate.

### API Proxy Estimate

Use `API proxy estimate` for cost-like displays computed from token totals and configured rates.
Required wording:

- `API proxy estimate only`
- `Not actual subscription billing`

Never label proxy values as `bill`, `charged`, `spent`, or `subscription cost`.

## Aggregation Dimensions

Usage Intelligence should aggregate by:

- Provider.
- Model.
- Project name and project directory hash.
- Agent id and agent name.
- Team name and role.
- Lead agent versus teammate.
- Thread/session id.
- Transcript path.
- Time window.
- Exact provider usage, estimated usage, and mixed usage.
- Token category: input, output, cache read, cache write, reasoning output, artifact estimate.
- API proxy estimate.
- Rate-limit snapshot.
- Hidden, archived, paused, active, waiting, needs-approval, and error states.
- Outcome markers when future packages normalize them.

## Time Bucketing

Usage records should keep millisecond timestamps and support local display buckets.

Recommended buckets:

- Last hour, grouped by 5-minute or 15-minute intervals.
- Today, grouped by hour.
- Last 7 days, grouped by day.
- Last 14 days, grouped by day.
- Last 30 days, grouped by day.
- Month to date, grouped by day.
- Custom date range, grouped by hour/day/week depending on range length.

Rules:

- Store `capturedAtMs` for ingestion/debugging.
- Store `occurredAtMs` from transcript/provider event timestamps when available.
- Attribute late-arriving transcript scans to `occurredAtMs`, not scan time, when reliable.
- Fall back to `capturedAtMs` when no event timestamp exists and mark the timestamp source in
  evidence.
- Display in the user's local timezone.
- Keep UTC-safe raw timestamps for export.

## Proposed Usage Page UI

### Top Summary

Show the selected scope and totals:

- Date range.
- Provider filter.
- Project filter.
- Agent/team filter.
- Total provider tokens.
- Input/output split.
- Cache and reasoning tokens.
- Artifact estimate.
- API proxy estimate with non-billing wording.
- Exact, estimated, and mixed record counts.

### Provider Breakdown

Show one row/card per provider:

- Provider label.
- Token total.
- Input/output/cache/reasoning split.
- API proxy estimate.
- Exact/mixed label.
- Codex rate-limit percentage and reset, when available.
- Provider-specific warning when data is estimated-only.

### Project Breakdown

Show ranked projects:

- Project name.
- Optional redacted path display.
- Provider/model mix.
- Token total.
- API proxy estimate.
- Last activity.
- Highest-usage agent.
- Trend delta versus previous comparable window.

### Agent Ledger

Show a sortable, filterable table:

- Agent id and name.
- Provider.
- Model.
- Project.
- Team/role.
- Session/thread.
- Status.
- Input.
- Output.
- Cache read/write.
- Reasoning.
- Artifact estimate.
- API proxy estimate.
- Accuracy label.
- Last activity.
- Transcript link/open action.

### Trend Chart

Show stacked bars or lines by time bucket:

- Provider token totals.
- Input/output split toggle.
- Cache/reasoning/artifact toggle.
- Exact versus estimated overlay or legend.
- Previous-window comparison.

### Anomaly and Threshold Area

Show local warnings such as:

- Provider or project usage above threshold.
- Agent usage spike versus its recent baseline.
- Cache read dropping sharply while input rises.
- Reasoning output spike.
- Agent consuming many tokens without a recent completed turn or outcome marker.
- Codex quota near threshold or reset soon.
- Estimated-only data dominating a view.

### Export Button

The Usage page should provide export from the current filtered scope. Export should be prominent but
not visually confused with provider billing.

## Empty and Error States

Required states:

- No agents: explain that usage appears after an agent starts or is restored.
- No usage yet: show provider rows and ledger shell with zero totals.
- All data filtered out: show active filters and a reset-filters action.
- Estimated-only: show data, but explain that transcript-derived usage is approximate.
- Unsupported provider: show provider metadata but no exact usage until a parser exists.
- Transcript missing: keep any stored records, but mark new scans unavailable.
- Parse error: show a local-only warning and continue displaying last known good records.
- Usage store unavailable: fall back to live session totals and explain history is unavailable.
- Export failure: show local filesystem error detail without losing the current view.

## Privacy and Local-First Expectations

- Usage records stay on the user's machine.
- Default storage lives under `~/.pixel-agents-multi/`.
- Do not upload usage, transcript paths, project paths, prompts, outputs, or analytics.
- Do not require provider API keys for the default experience.
- Exports should offer a redacted mode that replaces absolute project and transcript paths with
  stable local hashes.
- Raw transcript text should not be copied into usage records.
- Usage evidence should reference file paths and provider event identifiers, not full prompt/output
  content.
- Threshold notifications should be local and should not phone home.

## Export Format Proposal

Support JSON and CSV exports from the selected filtered scope.

### JSON Export

The JSON export should preserve record detail:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-02T00:00:00.000Z",
  "scope": {
    "dateRange": "last_14_days",
    "providers": ["codex", "claude"],
    "projects": ["pixel-agents-multi"],
    "redacted": true
  },
  "summary": {
    "providerTotalTokens": 0,
    "artifactEstimateTokens": 0,
    "apiProxyEstimateUsd": 0,
    "exactRecords": 0,
    "estimatedRecords": 0
  },
  "records": []
}
```

### CSV Export

The CSV export should be spreadsheet-friendly:

```text
occurred_at,provider,model,project,project_hash,agent_id,agent_name,team,session_id,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_output_tokens,artifact_output_tokens,token_source,api_proxy_estimate_usd,last_activity
```

Default export mode should redact absolute paths. Advanced export can include paths after an explicit
toggle.

## Budget and Threshold Notification Proposal

Thresholds should be local settings, not billing commitments.

Recommended threshold types:

- Provider token threshold per day, week, or month.
- Project token threshold per day, week, or month.
- Agent token threshold per session or hour.
- API proxy estimate threshold per day, week, or month.
- Codex rate-limit threshold, such as 80 percent used.
- Reasoning output spike threshold.
- Cache regression threshold.
- Estimated-data share threshold, such as more than 50 percent estimated in the selected scope.

Notification behavior:

- Show warnings in the Usage page anomaly area.
- Optionally show a local toast or existing notification sound.
- Debounce repeated warnings for the same threshold and scope.
- Include reset/dismiss controls.
- Wording must say `threshold` or `proxy estimate`, not `bill due` or `charged`.

## Implementation Phases

### Phase 1: Normalize and Store Usage

- Add a local append-only usage store.
- Convert Codex cumulative snapshots into deltas.
- Convert Claude streamed usage snapshots into stable deltas.
- Store artifact estimates as separate records.
- Store rate-limit snapshots separately from usage deltas.
- Backfill from existing transcripts without double-counting.
- Add tests for exact, estimated, mixed, artifact, cache, reasoning, and rate-limit records.

### Phase 2: Usage Page in Agent Center 2.0

- Build a full Usage page with filters, top summary, provider breakdown, project breakdown, agent
  ledger, trend chart, and export.
- Keep the existing compact provider summary compatible with the normalized aggregation model.
- Add empty, error, and estimated-only states.

### Phase 3: Thresholds and Anomalies

- Add local threshold settings.
- Add anomaly detection based on previous-window comparison and per-agent baselines.
- Add Codex quota warnings from exact rate-limit snapshots.
- Add clear non-billing wording to all proxy estimate warnings.

### Phase 4: Value and Outcome Context

- Add optional outcome markers from lifecycle/timeline data.
- Tie usage to completed work packages, commits, tests, or user-approved task completion when
  reliable signals exist.
- Add project and agent value views that compare usage to outcomes without pretending to score code
  quality automatically.

## Acceptance Criteria

- Usage Intelligence can aggregate provider, model, project, agent, session, time-window, token
  category, exactness, and API proxy estimate dimensions from normalized records.
- Exact provider usage is labeled exact only when provider usage fields are available.
- Estimated transcript usage is labeled estimated and rolls up into mixed aggregate labels.
- Artifact estimates are visible but excluded from API proxy estimate totals.
- Cache read/write and reasoning output are visible without double-counting provider totals.
- API proxy estimate wording always says it is not actual subscription billing.
- The Usage page includes top summary, provider breakdown, project breakdown, agent ledger, trend
  chart, anomaly/threshold area, and export button.
- Empty and error states render visible, useful content instead of a blank page.
- Export supports JSON and CSV, with redacted paths by default.
- Usage data remains local-first under `~/.pixel-agents-multi/`.
- Backfill and live ingestion tests cover Codex snapshots, Claude streamed snapshots, exact usage,
  estimated usage, artifact estimates, and rate-limit snapshots.
- No analytics UI or parser implementation is part of this W4-C package.

## External Inspiration

The optional `iangithub/llm-usage-dashboard` reference was inspected for product inspiration only:
<https://github.com/iangithub/llm-usage-dashboard>.

Relevant ideas:

- Local-first usage dashboard.
- Provider/project grouping.
- Daily trend chart.
- Quota reset display.
- Clear estimated-cost wording for subscription products.

Not adopted directly:

- Electron app structure.
- Provider scanner implementation.
- Any code or storage implementation.
