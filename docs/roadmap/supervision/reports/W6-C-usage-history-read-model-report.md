# W6-C Usage History Read Model Report

Date: 2026-06-02
Branch: `product/w6-c-usage-history-read-model`
Worktree: `C:\Users\User\Documents\raychen\pixel-agents-multi-w6-c`

## Summary

Added a browser-safe normalized usage history read model for future persisted `UsageRecordV1` data.
The model is pure webview code: it does not import `src/usageStore.ts`, read local files, wire
extension runtime messages, or change the live Usage page.

## Files Changed

- `webview-ui/src/components/usageHistoryModel.ts`
- `webview-ui/test/usage-history-model.test.ts`
- `docs/roadmap/supervision/reports/W6-C-usage-history-read-model-report.md`

## Model Behavior

`buildUsageHistoryModel(records, options)` now prepares:

- Browser-safe `UsageHistoryRecordV1` input types mirroring the normalized store shape needed by the
  webview.
- Provider, model, project, agent, session, ledger, and common time-window summaries.
- Exact provider-reported, estimated, mixed, and no-usage accuracy rollups.
- Separate provider token totals, artifact estimate totals, cache read/write totals, reasoning
  totals, and API proxy estimate totals.
- Latest rate-limit snapshots per provider.
- Deterministic trend buckets for today by hour and last 7 days by day.
- Ledger rows sorted by display tokens, then provider tokens, then activity.
- Empty-state metadata for no records, all data filtered out, and zero-usage filtered scopes.
- Export-ready rows and CSV text with project and transcript paths redacted by default. Raw paths are
  included only when `includeRawPaths: true` is passed.

Non-billing wording remains explicit through `API proxy estimate only` and
`Not actual subscription billing`.

## Tests Added

Added 12 focused webview tests covering:

- Provider, project, model, and session aggregation.
- Mixed exact/estimated rollups.
- Artifact estimates excluded from provider and API proxy totals.
- Cache read/write and reasoning category totals.
- Today and last-7-days trend bucket ordering.
- Latest provider rate-limit snapshots.
- All-filtered-out empty state.
- Redacted export rows and opt-in raw path export.
- Combined provider/model/project/agent/session/time filters.
- Ledger sorting by display and provider tokens.
- No-records state with empty trend shells.

## Validation

Commands run:

```powershell
npm run build
npm run test:webview
npm run test:server
git diff --check
```

Results:

- `npm run build`: passed.
- `npm run test:webview`: 49 passed.
- `npm run test:server`: 210 passed.
- Combined test count: 259.
- `git diff --check`: passed.

## Notes

- The first attempted webview test run in this fresh worktree failed before tests executed because
  `webview-ui/node_modules` was absent. Dependencies were restored with `npm ci` in root,
  `webview-ui`, and `server`, then validation passed.
- No React UI, extension message handling, disk reads, export dialogs, threshold settings, charts,
  backend ingestion, or `src/**` changes were added in this package.
