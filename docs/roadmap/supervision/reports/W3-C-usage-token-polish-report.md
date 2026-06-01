# W3-C usage and token display polish report

Date: 2026-06-01
Branch: `cleanup/w3-c-usage-token-polish`

## Summary

Polished the existing pixel Agent Center Usage tab without changing the dashboard layout or provider
adoption logic.

The Usage tab now keeps the existing visible states intact: populated usage, no-agent empty state,
and explicit render fallback. Token wording is clearer: provider rows distinguish exact
provider-reported totals from mixed exact/estimated usage, Codex and Claude are shown as separate
provider rows, artifact estimates are displayed separately from priced token totals, and cost text is
labeled as a proxy estimate rather than an actual subscription bill.

## Current behavior audited

- `AgentCenter` already had a Usage error boundary and an empty state:
  - `Usage data unavailable`
  - `No usage to show yet`
- Agent Center and the office overlay both render `TokenCostSummary` with the same visible agent ID
  set, so their provider totals share one aggregation path.
- The previous provider copy used concrete model names and "API proxy" wording that could look like
  real billing.
- The previous provider exact/estimated aggregate only checked `tokenUsageEstimated`; it missed
  `tokenUsageDetails.estimated`.
- Cache and reasoning were not priced twice in the parser, but the UI compressed cache into one
  number and always showed artifact estimates even when zero.

## External dashboard ideas

Reviewed `iangithub/llm-usage-dashboard` as inspiration only:

- Adopted:
  - clear Codex vs Claude provider breakdown
  - exact vs estimated status labels
  - quota reset text when Codex rate-limit snapshots exist
  - project-level grouping already present in Agent Center
  - explicit subscription/non-billing cost estimate wording
- Rejected for this package:
  - charts and date-window views, because W3-C must not redesign or crowd the pixel modal
  - provider API calls, because W3-C remains local/offline
  - copying implementation code

Reference: https://github.com/iangithub/llm-usage-dashboard

## Files changed

- `webview-ui/src/components/TokenCostSummary.tsx`
  - Uses generic `Codex usage proxy` / `Claude usage proxy` labels.
  - Labels rows as `Mixed exact/estimated` or `Exact provider-reported`.
  - Shows cache read and cache write separately.
  - Shows artifact estimates only when present and marks them `not priced`.
  - Changes cost copy to proxy-only subscription wording.

- `webview-ui/src/components/tokenCostSummaryModel.ts`
  - Extracts provider usage aggregation from the React component so it can be tested without
    violating React Fast Refresh rules.
  - Marks provider usage as estimated when either `tokenUsageEstimated` or
    `tokenUsageDetails.estimated` is true.
  - Keeps artifact estimates outside `inputCost`, `outputCost`, and `totalCost`.

- `webview-ui/src/components/AgentCenter.tsx`
  - Updates provider status labels to `Mixed exact/est.` / `Exact reported`.
  - Updates agent detail copy so API proxy costs are explicitly not actual billing.
  - Propagates `tokenUsageDetails.estimated` into agent usage summaries.

- `webview-ui/test/token-cost-summary.test.ts`
  - Adds coverage for always-visible Codex/Claude provider rows.
  - Adds coverage that artifact estimates are separated from priced totals.
  - Adds coverage for detail-level estimated usage.
  - Adds coverage for proxy/non-billing wording.

## Exact vs estimated behavior

- Codex exact usage remains exact when provider token_count records supply totals.
- Claude exact usage remains exact when provider usage objects supply totals.
- Claude/Codex estimated usage is marked mixed/estimated when transcript inference is used.
- `tokenUsageDetails.estimated` is now honored even if `tokenUsageEstimated` was not separately set.
- Artifact estimates are displayed as generated-code/patch estimates and are not added into billing
  proxy totals.
- Cache read/write and reasoning tokens remain visible sub-details and are not counted a second time
  beyond the provider totals already stored on the character.

## Tests and validation

Commands run:

```powershell
npm run test:webview
npm run check-types
npm run test:server
npm run build
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "pixel-agents"
```

Results:

```text
npm run test:webview: passed, 22 tests
npm run check-types: passed
npm run test:server: passed, 202 tests
npm run build: passed
npx vsce package: passed, pixel-agents-multi-1.3.0.vsix (250 files, 987.39KB)
code --install-extension --force: passed
code --list-extensions: raychen.pixel-agents-multi@1.3.0
```

Textual runtime evidence from the built bundle/source search:

```text
Usage data unavailable
No usage to show yet
Mixed exact/estimated
Exact provider-reported
Proxy estimate only; subscription plans may not bill per token.
Artifact estimate ... (not priced)
Cache read
Cache write
```

## Residual risks

- This package validates build/package/install and text presence, but it does not automate clicking
  the live VS Code webview Usage tab. The next manual check should reload VS Code, open Pixel Agents
  Multi, open Agent Center > Usage, and confirm the tab is no longer blank.
- W3-C intentionally does not touch Claude/Codex adoption. Remaining Claude visibility issues belong
  to the next adoption-focused package.
