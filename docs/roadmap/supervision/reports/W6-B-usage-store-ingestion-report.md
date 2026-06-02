# W6-B Usage Store Ingestion Report

Date: 2026-06-02
Branch: `product/w6-b-usage-store-ingestion`
Worktree: `C:\Users\User\Documents\raychen\pixel-agents-multi-w6-b`

## Summary

Wired the W6-A normalized Usage Store foundation into live extension-side token ingestion without
changing the Usage page UI. Usage ingestion is append-only, local-first, best-effort, and scoped to
existing token update paths.

## Files Changed

- `src/usageIngestion.ts`
- `src/transcriptParser.ts`
- `src/agentManager.ts`
- `src/PixelAgentsViewProvider.ts`
- `server/__tests__/usageIngestion.test.ts`
- `docs/roadmap/supervision/reports/W6-B-usage-store-ingestion-report.md`

## Implementation Notes

- Added `ingestAgentUsageSnapshot()` to normalize cumulative/current agent token snapshots into
  `usage_delta`, `artifact_estimate`, and `rate_limit_snapshot` records.
- Dedupe state is module-local and keyed by provider, agent id, session id, and transcript path, so
  repeated identical snapshots produce no records.
- Provider usage writes only positive deltas. Codex cumulative `token_count` and transcript refresh
  snapshots are marked `isDeltaFromSnapshot=true`.
- Artifact estimates are written as separate `artifact_estimate` records and are not included in
  provider totals or API proxy estimates.
- Rate-limit snapshots are signature-deduped and append only when a first or changed snapshot is
  observed.
- Store append failures are caught and logged per record; ingestion never blocks status updates or
  webview token messages.
- Records pass project and transcript paths through the W6-A usage store helpers, so raw paths stay
  redacted by default.
- Evidence strings are limited to source/event names and stable usage keys; no prompt/output text is
  stored.

## Runtime Wiring

- `src/transcriptParser.ts`
  - Claude live usage and artifact estimates.
  - Codex artifact estimates.
  - Codex `token_count` usage and rate-limit snapshots.
- `src/agentManager.ts`
  - Codex thread adoption/follow-on token initialization.
  - Deferred transcript usage refresh for restored/opened panels.
- `src/PixelAgentsViewProvider.ts`
  - Codex external thread adoption token initialization.

## Tests Added

Added `server/__tests__/usageIngestion.test.ts` covering:

- First positive provider delta.
- Repeated snapshot no-op.
- Later positive delta only.
- Artifact estimates separated from provider usage.
- Rate-limit snapshot de-dupe and changed-snapshot append.
- Append failure swallowed after record construction.

## Validation

Commands run:

```powershell
npm run check-types
npx vitest run __tests__/usageIngestion.test.ts
npm run build
npm run test:webview
npm run test:server
```

Results:

- `npm run check-types`: passed.
- Focused ingestion tests: 6 passed.
- `npm run build`: passed.
- `npm run test:webview`: 37 passed.
- `npm run test:server`: 216 passed.
- Combined required test count: 253.

## Notes and Risks

- Bare Codex `thread.tokensUsed` adoption data is ingested as a best-effort provider snapshot when
  transcript details are unavailable. Later detailed transcript snapshots are deduped by cumulative
  total to avoid obvious double counting, but the coarse snapshot cannot recover category detail.
- No UI, charts, filters, export, thresholds, or webview usage modeling was changed in this package.
