# W6-D Usage History Bridge Report

Date: 2026-06-03
Branch: `product/w6-d-usage-history-bridge`

## Summary

Added a small extension-to-webview bridge for persisted local Usage Store records. The bridge loads
records on `webviewReady`, supports explicit refresh from the webview, and stores the latest payload
in React state without redesigning the Usage page.

## Files Changed

- `src/usageHistoryBridge.ts`
  - Added `loadUsageHistoryForWebview()`.
  - Reads usage history through `readUsageRecords()`.
  - Returns `{ type: 'usageHistoryLoaded', records, loadedAtMs }`.
  - Returns `{ unavailable: true, error }` with empty records when a read fails.
  - Strips raw `project.dir` and `session.transcriptPath` before posting to the webview as an
    extra guard; redacted hashes remain available.
- `src/PixelAgentsViewProvider.ts`
  - Posts `usageHistoryLoaded` during `webviewReady`.
  - Handles `{ type: 'refreshUsageHistory' }`.
  - Refreshes usage history along with the existing Agent Center Refresh action.
- `webview-ui/src/hooks/usageHistoryMessages.ts`
  - Added browser-safe usage history message/state helper.
- `webview-ui/src/hooks/useExtensionMessages.ts`
  - Added `usageHistory` React state.
  - Stores `usageHistoryLoaded` messages and returns the state through the hook.
- `webview-ui/src/App.tsx`
  - Threads `usageHistory` into Agent Center.
- `webview-ui/src/components/AgentCenter.tsx`
  - Threads `usageHistory` into the Usage surface.
  - Adds a compact status chip for loading, record count, or unavailable history.
- `server/__tests__/usageHistoryBridge.test.ts`
  - Added extension bridge tests.
- `webview-ui/test/usage-history-messages.test.ts`
  - Added webview message-state tests.

## Behavior

- Missing usage store returns `records: []` and is not treated as an error.
- Malformed JSONL lines remain tolerated by the existing store reader; valid records still load.
- Read failures do not crash extension message handling. The webview receives an unavailable payload
  with `records: []` and an error string.
- No raw prompt/output content is read or sent.
- The bridge does not opt into raw path storage and does not write anything to the usage store.
- Canonical reads continue through the private fork store path:
  `~/.pixel-agents-multi/usage/usage-v1.jsonl`.
- Legacy `~/.pixel-agents/usage` behavior remains limited to the existing one-time migration path
  inside `readUsageRecords()`.

## Tests Added

- Successful usage history load payload.
- Missing store returns empty records.
- Malformed JSONL lines are tolerated.
- Read error/unavailable path returns a safe payload.
- Webview message helper stores `usageHistoryLoaded` records and unavailable state.

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
- `npm run test:webview`: 51 passed.
- `npm run test:server`: 225 passed.
- Combined test count: 276.
- `npm run verify:identity`: passed (`raychen.pixel-agents-multi@1.3.0`).
- `git diff --check`: passed.

## Notes

- This package intentionally does not add charts, export dialogs, filter UI, or a historical Usage
  page redesign.
- Runtime manual QA in VS Code was not performed; validation is automated build/test/identity
  coverage only.
