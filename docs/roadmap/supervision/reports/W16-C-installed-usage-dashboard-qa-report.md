# W16-C Installed Usage Dashboard QA Report

## Summary

Validated the W16-B Usage Dashboard productization against the installed local VSIX. No product blockers were found, and no source code changes were made.

Live webview QA used Playwright/Electron to launch the installed VS Code application with the installed extension directory, open the Pixel Agents Multi panel, and inspect the Agent Center Usage page. This verified the real VS Code webview path rather than only unit tests.

## Branch / Package

- Branch: `qa/w16-c-installed-usage-dashboard-qa`
- Installed extension identity: `raychen.pixel-agents-multi@1.3.0`
- VSIX: `pixel-agents-multi-1.3.0.vsix`

## Installed Identity

- `npm run verify:installed`: passed.
- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"` showed only:
  - `raychen.pixel-agents-multi@1.3.0`

## Validation Commands

- `git diff --check`: passed.
- `npm run test:webview`: passed, 166 tests.
- `npm run test:server`: passed, 284 tests.
- `npm run build`: passed.
- `npm run release:local`: passed; rebuilt, verified identity, verified VSIX contents, packaged, installed local VSIX, and verified installed identity.

Combined automated test count: 450 tests.

## Live VS Code / Webview QA

Method:

- Launched installed VS Code via `Code.exe` with a temporary user-data directory.
- Used the installed extension directory at `C:\Users\User\.vscode\extensions`.
- Opened `C:\Users\User\Documents\raychen\pixel-agents-multi`.
- Ran `Pixel Agents Multi: Show Panel`.
- Opened Agent Center > Usage.
- Inspected Overview, Live, History, and a narrow-ish viewport.
- Repeated with an isolated temporary `HOME` / `USERPROFILE` to verify no-record empty states without touching the real usage store.

Observed real-profile state:

- Usage page was nonblank.
- Usage defaulted to Overview.
- Segmented control showed `Overview`, `Live`, and `History`.
- Overview rendered:
  - metrics for Active now, Today, Last 7 days, Reliability
  - Last 7 Days trend
  - Provider Mix
  - Project Ranking
  - Operational Signals
  - `Proxy estimate only`
- Live rendered the previous live panels:
  - provider proxy summaries
  - Provider tokens / Accuracy / Reasoning / Artifact estimate metrics
  - Token Mix
  - Live Signals
  - Provider Usage
  - Project Usage
  - Agent Usage Ledger
- History rendered:
  - `Persisted Usage History`
  - local store label `~/.pixel-agents-multi/usage/usage-v1.jsonl`
  - `API proxy estimate only`
  - `Not actual subscription billing`
  - Window / Provider / Project filters
  - Copy CSV action and redacted export wording

Observed empty-profile state:

- Overview displayed `No usage telemetry yet`.
- Header showed `0 history records`.
- Active now and Today metrics showed zero values.
- History displayed no-record state without crashing.

## Layout / Visual QA

- No blank Usage page regression was observed.
- No obvious overlapping core Usage controls were observed in Overview, Live, or History.
- Text remained readable in the default installed webview width.
- Narrow-ish width remained usable; controls wrapped into compact vertical flow.
- First-run `Updated to v1.3!` toast appeared in the temporary profile and partially covered the bottom toolbar in screenshots. This is the existing changelog toast, dismissible, and not specific to Usage Dashboard.

## Screenshots

Screenshots were captured to a temp directory and intentionally not committed:

- Overview: `C:\Users\User\AppData\Local\Temp\pixel-agents-w16-c-screenshots\w16-c-usage-overview-1780897181074.png`
- Live: `C:\Users\User\AppData\Local\Temp\pixel-agents-w16-c-screenshots\w16-c-usage-live-1780897181954.png`
- History: `C:\Users\User\AppData\Local\Temp\pixel-agents-w16-c-screenshots\w16-c-usage-history-1780897182801.png`
- Narrow overview: `C:\Users\User\AppData\Local\Temp\pixel-agents-w16-c-screenshots\w16-c-usage-narrow-1780897184055.png`
- Empty overview: `C:\Users\User\AppData\Local\Temp\pixel-agents-w16-c-screenshots\w16-c-empty-overview-max-1780897328526.png`
- Empty history: `C:\Users\User\AppData\Local\Temp\pixel-agents-w16-c-screenshots\w16-c-empty-history-max-1780897329258.png`

## Pass / Fail Checklist

- Installed identity is `raychen.pixel-agents-multi@1.3.0`: pass.
- Baseline validation passed: pass.
- `npm run release:local` run for this package: pass.
- Usage default pane is Overview: pass.
- Segmented control has Overview / Live / History: pass.
- Overview metrics render: pass.
- Overview trend renders: pass.
- Overview provider mix renders: pass.
- Overview project ranking renders: pass.
- Overview operational signals render: pass.
- Live pane still renders previous live token panels and ledger: pass.
- History pane still renders filters and redacted CSV/export behavior: pass.
- No blank Usage page regression: pass.
- Empty/no-record states are useful: pass.
- Non-billing/proxy estimate framing remains visible: pass.
- Narrow-ish width remains usable: pass.
- History unavailable state visible if reproducible: not reproduced in this QA pass.

## Bugs Found

None.

## Remaining Manual QA Gaps

- History unavailable state was not forced in live installed QA because that would require deliberately breaking or permission-blocking the local usage store. Existing webview tests cover unavailable payload behavior.
- No manual human screenshot review beyond the captured automated screenshots was required; the automated Playwright run inspected the installed VS Code webview text and layout smoke states.
