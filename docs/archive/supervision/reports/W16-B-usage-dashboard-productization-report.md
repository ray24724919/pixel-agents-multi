# W16-B Usage Dashboard Productization Report

## Summary

Productized the Agent Center Usage page into a clearer operational supervision dashboard while keeping it local-first and explicitly non-billing.

The Usage page now defaults to an Overview pane that combines current live agent telemetry with persisted local Usage Store history. Existing Live and History panes remain available, including the redacted CSV export path.

## Product Decisions

- Usage remains operational telemetry, not provider billing truth.
- Overview answers the highest-level supervisor questions first: active usage now, today, last 7 days, provider/project concentration, data reliability, and quota pressure.
- Live remains the detailed current-agent view.
- History remains the persisted local ledger/filter/export view.
- Visualizations use compact CSS bars and existing pixel-styled borders/backgrounds; no chart library or new design system was added.
- History export remains redacted by default and does not expose raw transcript paths.

## Files Changed

- `webview-ui/src/components/usageOverviewDashboardModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/test/usage-overview-dashboard-model.test.ts`
- `README.md`
- `README.zh-TW.md`
- `docs/pixel-agents-development-timeline.html`

## Final Behavior

- Usage page opens on `Overview`.
- Segmented control now offers `Overview`, `Live`, and `History`.
- Overview metrics show:
  - active live provider tokens and metered agent count
  - today persisted display tokens and local record count
  - last 7 days persisted display tokens and local record count
  - combined exact / estimated / mixed reliability cue
- Overview panels show:
  - last-7-days trend buckets
  - provider mix with live / today / 7d totals
  - project ranking from combined live and persisted usage
  - operational signals for unavailable history, estimate-heavy data, artifact-heavy usage, project concentration, and quota pressure
- Empty states stay visible for no telemetry, no recent history, unavailable history, and no project usage.
- Existing Live token summary, provider/project panels, ledger, History filters, and CSV copy remain available.

## Privacy / Local-First Notes

- No backend storage, filesystem path, usage ingestion, provider launch, or server behavior changed.
- The new overview model consumes already-redacted webview state and Usage History records.
- The UI continues to show proxy estimate / not billing language.
- No raw prompt, raw output, raw transcript body, absolute transcript path, credential, or external API data is introduced.

## Tests Added

Added `webview-ui/test/usage-overview-dashboard-model.test.ts` covering:

- combined live + persisted history totals for live, today, last 7 days, provider, project, and trend buckets
- operational insights for quota pressure, estimated/mixed data, and artifact-heavy usage
- useful no-telemetry empty state

## Validation

- `npm run build`: passed.
- `npm run test:webview`: passed, 166 tests.
- `npm run test:server`: passed, 284 tests.
- `git diff --check`: passed.
- `npm run release:local`: passed; built, verified identity, verified VSIX contents, packaged `pixel-agents-multi-1.3.0.vsix`, installed it locally, and verified installed extension identity as `raychen.pixel-agents-multi@1.3.0`.

Final expected combined automated test count: 450 tests.

## Documentation

- README English and Traditional Chinese usage descriptions now mention Overview / Live / History, provider/project trends, reliability cues, quota warnings, and proxy/non-billing framing.
- Development timeline now includes W16 Usage dashboard productization and recommends installed VSIX Usage Dashboard QA as the next package.

## Remaining Manual QA Gaps

- Installed VSIX/manual webview QA was not performed in this code package yet.
- Recommended follow-up: verify the Usage Overview in VS Code with real local usage records, including no-records, history-unavailable, quota-signal, redacted export, and pane-switching states.
