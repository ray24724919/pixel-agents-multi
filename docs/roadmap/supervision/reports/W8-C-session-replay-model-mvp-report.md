# W8-C Session Replay Model MVP Report

## Summary

W8-C adds a small Session Replay MVP for the Timeline page. Replay is derived from normalized Timeline events that already include W8-A/W8-B persisted history plus live merged timeline state. It is not screen recording, transcript replay, canvas replay, or terminal output replay.

The package keeps the W8-A timeline store path and schema unchanged.

## Replay Model Behavior

Added `webview-ui/src/components/timelineReplayModel.ts` with pure helpers:

- `buildTimelineReplaySessions(events)`
  - groups `TimelinePageItem[]` by provider, project, agent id, session id, and run id
  - sorts sessions newest first
  - sorts frames chronologically within each replay session
- `getTimelineReplayState(session, cursorIndex)`
  - clamps cursor safely
  - exposes current frame, previous/next availability, progress, status, severity, kind, and category
- `deriveTimelineReplayStatus(event)`
  - uses `statusAfter` first when present
  - otherwise derives lifecycle-ish state from safe event kind/category fallbacks:
    - `tool.started` -> `tool_running`
    - `permission.*` -> `waiting_permission`
    - `run.failed` -> `error`
    - `run.completed` / `delegation.completed` -> `completed`
    - `delegation.started` / `delegation.progress` -> `tool_running`

`TimelinePageItem` now carries the safe `statusAfter` field from normalized timeline events so replay can reconstruct state without reading payloads.

## UI Behavior

Added a compact Session Replay panel to the Timeline page:

- replay scope/session selector
- Previous / Play-Pause / Next controls
- speed selector
- event cursor and progress bar
- current event title, summary, status, kind, category, and relative time

Replay state is local React state only and is not persisted. Playback advances the event cursor through normalized frames; it does not move the office canvas, camera, characters, or transcript output.

## Privacy Notes

W8-C does not add any new persistence surface and does not modify the W8-A JSONL schema/path:

- `~/.pixel-agents-multi/timeline/timeline-v1.jsonl`

Replay consumes only safe Timeline display fields already present in `TimelinePageItem`. It does not expose raw prompts, raw tool output, raw transcript text, raw paths, or arbitrary payload blobs.

## Files Changed

- `webview-ui/src/components/timelineReplayModel.ts`
- `webview-ui/src/components/timelinePageModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/constants.ts`
- `webview-ui/test/timeline-replay-model.test.ts`

## Validation

- `npm run build`: passed
- `npm run test:webview`: 86 passed
- `npm run test:server`: 239 passed
- `git diff --check`: passed

Combined test count: 325, greater than the W8-B baseline of 321.

## Follow-Up

- Add richer replay navigation, such as jump-to-frame from the event list.
- Add a separate replay-focused route or expanded drawer if the compact panel becomes too dense.
- Add optional visual reconstruction later from normalized positions/status snapshots only; do not replay raw transcripts or screen recordings.
- Consider grouping related tool start/output/completion frames once the timeline event model exposes stronger tool call correlation.
