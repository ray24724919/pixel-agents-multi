# W5-C Usage Intelligence Live Page Report

Date: 2026-06-02
Branch: `product/w5-c-usage-intelligence-live-page`

## Summary

Implemented a live-session Usage Intelligence MVP for the Agent Center Usage page. The page now uses
a pure usage model to summarize visible live agents by provider, project, category, agent ledger, and
local live signals while preserving the existing API proxy estimate wording.

This package did not add durable usage storage, transcript backfill, provider API calls, export,
threshold settings, or parser changes.

## Files Changed

- `docs/roadmap/supervision/work-packages/W5-C-usage-intelligence-live-page.md`
- `docs/roadmap/supervision/reports/W5-C-usage-intelligence-live-page-report.md`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/usageIntelligenceModel.ts`
- `webview-ui/test/usage-intelligence-model.test.ts`

## Model Behavior

Added `usageIntelligenceModel.ts` as a pure helper that builds:

- live totals for provider tokens, artifact estimates, cache detail, and reasoning detail,
- exact, estimated, mixed, and no-usage accuracy labels,
- provider summaries with Codex and Claude rows retained even at zero usage,
- project summaries ranked by display tokens with provider mix and top agent,
- agent ledger rows sorted by display tokens,
- token category summaries,
- live insight rows for estimated-only usage, mixed accuracy, top-agent concentration,
  reasoning-heavy output, artifact-heavy views, no-agent/no-usage states, and Codex quota snapshots.

Provider token totals remain input plus output. Artifact estimates are displayed separately and do
not feed the API proxy estimate.

## UI Behavior

Updated the Usage page to render:

- a Usage Intelligence header with live/local/proxy scope labels,
- provider-token, accuracy, reasoning, and artifact summary metrics,
- the existing `TokenCostSummary` proxy rows,
- a token mix section,
- a live signals section,
- richer provider usage rows,
- richer project usage rows,
- a wider agent ledger with input/output/cache/reasoning/artifact/provider totals and accuracy
  labels.

The page still scopes to visible Agent Center agents and does not depend on the Office provider
filter.

## Tests Added

Added `webview-ui/test/usage-intelligence-model.test.ts` covering:

- provider totals, category detail, artifact separation, and accuracy,
- project and ledger ranking,
- live signal generation for concentration, reasoning-heavy output, and Codex quota snapshots,
- empty and zero-usage states.

## Validation

Commands run:

```powershell
npm run check-types
npm run build
npm run test:webview
npm run test:server
git diff --check
```

Results:

- `npm run check-types`: passed.
- `npm run build`: passed.
- `npm run test:webview`: 32 passed.
- `npm run test:server`: 204 passed.
- Combined test count: 236.
- `git diff --check`: passed.

## Visual QA

Browser mock smoke QA was performed against `http://127.0.0.1:5173/`:

- Office loaded and the Usage navigation button was uniquely reachable.
- Usage page rendered `Usage Intelligence`, `Token Mix`, `Live Signals`, `Provider Usage`,
  `Project Usage`, and `Agent Usage Ledger`.
- Empty live-agent state rendered visible content instead of a blank Usage page.
- Browser console logs had no `AgentCenter` or Usage render errors.

The screenshot capture API timed out during this pass, so visual QA is DOM/log based rather than
image-based. No Extension Host manual QA with live token-bearing agents was performed.

## Follow-Up

- Add durable normalized usage records under `~/.pixel-agents/usage/`.
- Add time-window filtering and trend charts after records exist.
- Add export with redacted paths by default.
- Add configurable local thresholds after storage and time buckets are available.
- Add live Extension Host QA with several agents that have nonzero exact and estimated token usage.
