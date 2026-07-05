# W8-D Replay Usability Hardening Report

## Summary

W8-D hardens the W8-C Timeline Session Replay MVP without expanding replay into canvas movement, terminal replay, transcript replay, export, or persisted UI state.

The main usability improvement is that Event History rows can now cue the replay panel directly to the matching replay session and frame. The current replay frame is visibly marked in the event list.

## Replay Usability Behavior

- Clicking an Event History row selects the matching replay session and cursor frame.
- The currently selected replay frame is highlighted in the Event History list with a `Replay` marker.
- Replay remains scoped to the current Timeline filters.
- If filters remove the selected replay session, the panel keeps the stale selection visible and shows that the selected scope is outside the current filters instead of silently switching to unrelated history.
- Single-frame replays now report a single-frame state and keep previous/next/play controls disabled.
- Empty Timeline scopes show an explicit no replay sessions state.

## Model Behavior

`webview-ui/src/components/timelineReplayModel.ts` now includes pure helpers for:

- finding a replay session/frame by Timeline event id
- resolving replay selection when the selected session is missing from the current filtered scope
- exposing single-frame replay state
- deriving current replay frame marker metadata for the Event History list

These helpers keep UI behavior testable without VS Code click-through or browser automation.

## Privacy Notes

W8-D does not change the W8-A timeline store path or schema:

- `~/.pixel-agents-multi/timeline/timeline-v1.jsonl`

The replay UI continues to consume only normalized Timeline display fields already present in `TimelinePageItem`. It does not expose raw prompts, raw tool output, transcript text, raw paths, or arbitrary payload blobs.

## Files Changed

- `webview-ui/src/components/timelineReplayModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/test/timeline-replay-model.test.ts`

## Validation

- `npm run build`: passed
- `npm run test:webview`: 90 passed
- `npm run test:server`: 239 passed
- `git diff --check`: passed

Combined test count: 329, greater than the W8-C baseline of 325.

## Follow-Up Work

- Add optional jump controls inside the replay panel for first/last frame.
- Add richer keyboard navigation for replay frame stepping.
- Consider making the event-row current-frame marker scroll into view when playback advances.
- Keep future replay enhancements based on normalized timeline events, not raw transcripts or screen recordings.
