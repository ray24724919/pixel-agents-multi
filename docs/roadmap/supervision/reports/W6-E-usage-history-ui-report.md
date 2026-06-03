# W6-E Usage History UI Integration Report

Date: 2026-06-03
Branch: `product/w6-e-usage-history-ui`

## Summary

Integrated persisted local Usage History records into the Agent Center Usage page. The Usage page now
keeps the live session dashboard as the default view and adds a History view backed by the W6-C
`buildUsageHistoryModel()` read model and the W6-D `usageHistory` webview state.

## Files Changed

- `webview-ui/src/components/AgentCenter.tsx`
  - Added a Live / History segmented view inside the Usage page.
  - Kept the existing live session dashboard, `TokenCostSummary`, provider/project panels, insights,
    and live agent ledger visible in the Live view.
  - Added persisted history filters for provider, project, and time window.
  - Added historical provider, project, model, quota snapshot, and ledger sections.
  - Added visible no-records, all-filtered-out, and unavailable states.
  - Added browser-safe CSV copy for the current filtered history scope.
- `webview-ui/src/components/usageHistoryPageModel.ts`
  - Added a small page model wrapper around `buildUsageHistoryModel()`.
  - Converts UI filters into W6-C model filters.
  - Provides provider/project filter options, filtered export CSV, filter state, time labels, and
    unavailable-state copy.
- `webview-ui/test/usage-history-page-model.test.ts`
  - Added focused W6-E tests for historical summaries, filters, empty/unavailable states, and
    redacted export.
- `docs/roadmap/supervision/reports/W6-E-usage-history-ui-report.md`
  - This report.

## Product Behavior

- The Usage page distinguishes:
  - Live session usage.
  - Persisted local history.
  - Exact, estimated, mixed, and no-usage accuracy.
  - API proxy estimates versus actual subscription billing.
- Persisted history is summarized by:
  - Stored and shown record counts.
  - Usage records and rate-limit snapshot counts.
  - Provider totals.
  - Project totals.
  - Model totals when model metadata exists.
  - Latest rate-limit snapshots when present.
  - Historical agent/session ledger rows.
- History filters support:
  - Provider.
  - Project.
  - All history, Today, and Last 7 days.
- CSV copy uses the filtered W6-C export data and keeps paths redacted by default.
- The page stays nonblank for:
  - No records.
  - All records filtered out.
  - Unavailable/read-error state.

## Privacy And Identity

- The UI reads only records already supplied by the W6-D webview bridge.
- No `src/**` or `server/**` changes were made.
- No prompt text, output text, raw transcript text, or raw absolute paths are displayed or exported.
- The displayed store path remains the private fork path:
  `~/.pixel-agents-multi/usage/usage-v1.jsonl`.
- No default reads or writes under `~/.pixel-agents/usage` were introduced.

## Tests Added

Added 4 webview tests covering:

- Persisted history summary support for provider, project, model, proxy, and quota snapshot data.
- Provider, project, and Today/Last 7 days style filtering changing historical totals.
- No-records, all-filtered-out, and unavailable-state model behavior.
- Filtered CSV export keeping raw project/transcript paths redacted by default.

## Validation

Commands run:

```powershell
npm run build
npm run test:webview
npm run test:server
npm run verify:identity
git diff --check
```

Results:

- `npm run build`: passed.
- `npm run test:webview`: 55 passed.
- `npm run test:server`: 225 passed.
- Combined test count: 280.
- `npm run verify:identity`: passed (`raychen.pixel-agents-multi@1.3.0`).
- `git diff --check`: passed.

## Notes

- This package intentionally did not add charts, export dialogs, Team/Lab features, provider/server
  behavior, or usage-store read/write changes.
- Runtime manual QA in VS Code was not performed; validation is automated build/test/identity
  coverage only.
