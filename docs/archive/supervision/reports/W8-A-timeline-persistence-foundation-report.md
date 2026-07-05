# W8-A Timeline Persistence Foundation Report

## Summary

W8-A adds a local-first persistence foundation for normalized Agent Center timeline events. Timeline records are appended to a JSONL store, loaded when the webview initializes, and merged with live timeline state by stable event id so Timeline/Agent Center history can survive reloads.

This package does not add Session Replay UI and does not redesign the Timeline page.

## Schema And Path Decisions

- Store path: `~/.pixel-agents-multi/timeline/timeline-v1.jsonl`
- Schema version: `1`
- Retention cap: latest 500 records, newest first on read.
- Read behavior:
  - missing store returns `[]`
  - malformed JSONL lines are skipped
  - records are de-duplicated by `id`
  - newest valid record wins for duplicate ids

Persisted fields are intentionally narrow:

- `id`
- `agentId`
- `providerId`
- `projectName`
- `sessionId`
- `runId`
- `timestamp`
- `kind`
- `title`
- `summary`
- `statusAfter`
- `severity`
- `source`
- `visibility`

## Privacy And Redaction Decisions

The timeline store drops arbitrary `payload` data and does not persist raw prompts, raw tool output, transcript contents, raw paths, or provider-specific blobs. The webview persistence helper also strips payload before sending events back to the extension for storage.

This keeps W8-A aligned with the local-first/private-fork storage model used by usage history.

## Bridge Behavior

- Extension to webview:
  - `timelineHistoryLoaded`
  - sent during `webviewReady`
  - also sent during `refreshAgents`
  - read failures are reported as `unavailable` with an error string instead of crashing the extension
- Webview to extension:
  - `persistTimelineEvent`
  - used for live backend-delivered timeline events after they reach the webview
  - used for webview-generated `delegation.*` events
- Optional refresh:
  - `refreshTimelineHistory` re-reads persisted records and posts `timelineHistoryLoaded`
- Webview merge:
  - persisted and live events are merged by `id`
  - records are sorted newest first
  - payload is not retained in persisted history entries

Backend-posted lifecycle/action events continue to flow through the existing `agentTimelineEvent` path, then are persisted once normalized in the webview. Webview-generated delegation events are persisted through the same safe field whitelist.

## Files Changed

- `src/constants.ts`
- `src/timelineStore.ts`
- `src/timelineHistoryBridge.ts`
- `src/PixelAgentsViewProvider.ts`
- `webview-ui/src/constants.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/hooks/timelineHistoryMessages.ts`
- `server/__tests__/timelineStore.test.ts`
- `server/__tests__/timelineHistoryBridge.test.ts`
- `webview-ui/test/timeline-history-messages.test.ts`

## Tests Added

- Timeline store path, append, read, malformed-line tolerance, de-duplication, and cap behavior.
- Timeline history bridge load, missing store, read failure, and persist behavior.
- Webview timeline history message normalization, merge/de-dupe ordering, cap behavior, and payload stripping.

## Validation

- `npm run build`: passed
- `npm run test:webview`: 79 passed
- `npm run test:server`: 239 passed
- `git diff --check`: passed

Combined test count: 318, greater than the W7-D baseline of 307.

## Known Limitations / W8-B Follow-Up

- W8-A stores normalized display events only; it does not implement Session Replay or transcript replay.
- There is no Timeline history management UI yet beyond loading and merging history into existing Timeline state.
- Store compaction is read-time capped for the MVP. A future package can add explicit file compaction if the append-only JSONL grows too large.
- Cross-window write coordination is intentionally simple for this MVP and follows append-only semantics.
