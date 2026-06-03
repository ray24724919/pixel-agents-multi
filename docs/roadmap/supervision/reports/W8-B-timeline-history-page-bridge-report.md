# W8-B Timeline History Page Bridge Report

## Summary

W8-B makes the Timeline page visibly use the W8-A persisted timeline history bridge. The webview now tracks timeline history load metadata, surfaces local history status in the Timeline page header, supports a direct refresh action, and adds additional filters so persisted events remain legible after reload.

W8-A was confirmed on local `main` at `934b68d feat: persist timeline history locally` and pushed to `origin/main` before branching W8-B.

## Store And Schema

The W8-A store path and schema are unchanged:

- `~/.pixel-agents-multi/timeline/timeline-v1.jsonl`
- schema version `1`
- safe display fields only
- no payload blobs or raw prompt/tool/transcript content

W8-B does not modify the extension-side timeline store or backend provider behavior.

## Bridge And Page Behavior

- Added `TimelineHistoryState` in the webview message helper:
  - `loadedAtMs`
  - `unavailable`
  - `error`
  - `persistedRecordCount`
- `useExtensionMessages` now stores this state when `timelineHistoryLoaded` arrives.
- `App.tsx` threads the state into `AgentCenterSurface`.
- The Timeline page header now shows:
  - local history loading/loaded/unavailable status
  - persisted record count
  - relative load time
  - a `Refresh history` action wired to `refreshTimelineHistory`

Persisted records still merge into the existing `agentTimelineEvents` list by id, so action and delegation events stay visible through the same Timeline read model as live events.

## Filters Added

The Timeline read model now supports additional filters that combine with the existing provider, severity, project, agent, and search filters:

- category:
  - `all`
  - `lifecycle`
  - `tool`
  - `action`
  - `delegation`
  - `permission`
  - `run`
  - `token`
  - `other`
- exact event kind
- time window:
  - `all`
  - `today`
  - `last_24h`
  - `last_7_days`

The page also exposes kind options from indexed events and keeps retained action/delegation history available for removed agents.

## Privacy

W8-B does not add any new persistence surface. Timeline history state stores only load metadata and a valid persisted record count. The existing W8-A persistence helper still strips payloads before sending events to the extension.

No raw prompts, raw tool output, transcript text, raw absolute paths, or arbitrary payload blobs are added to the Timeline page model.

## Files Changed

- `webview-ui/src/App.tsx`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/timelinePageModel.ts`
- `webview-ui/src/constants.ts`
- `webview-ui/src/hooks/timelineHistoryMessages.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/test/timeline-history-messages.test.ts`
- `webview-ui/test/timeline-page-model.test.ts`

## Validation

- `npm run build`: passed
- `npm run test:webview`: 82 passed
- `npm run test:server`: 239 passed
- `git diff --check`: passed

Combined test count: 321, greater than the W8-A baseline of 318.

## Known Limitations / Follow-Up

- W8-B does not add Session Replay UI.
- The Timeline page still displays the merged recent history list rather than a separate archive browser.
- Store compaction and richer history management remain future W8 follow-up work.
