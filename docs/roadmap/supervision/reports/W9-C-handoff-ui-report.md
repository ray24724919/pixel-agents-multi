# W9-C Handoff UI Report

## Summary

Added a local-only "Create Handoff" UI in the Timeline / Session Replay area. The UI uses the W9-B handoff draft model to generate a safe Markdown preview from normalized Timeline and Replay events.

No backend, server, filesystem write, git, sharing, sync, export bundle, or VS Code API behavior was added.

## UI Behavior

- Added a compact Handoff Draft panel below Session Replay on the Timeline page.
- The default handoff source is the currently selected replay session when available.
- If no replay session is selected but filtered Timeline events exist, the panel falls back to the current Timeline filtered scope.
- If no Timeline events are available, the Create Handoff action is disabled and the panel shows a no-events state.
- Create Handoff opens an inline Markdown preview panel.
- Copy Markdown uses the existing browser-safe clipboard helper path and reports:
  - Markdown copied
  - Clipboard copy failed
  - preview-only idle state
- The preview remains local-only and does not write files.

## Model Behavior

- Added `webview-ui/src/components/handoffDraftPageModel.ts`.
- The page model keeps source selection pure and testable:
  - `replay-session`
  - `timeline-filtered`
  - `none`
- Replay session source details are passed through W9-B `sanitizeHandoffText()` before display so source metadata follows the same safety posture as the Markdown preview.

## Privacy Notes

The UI does not inspect transcripts or raw payloads. It only passes normalized `TimelinePageItem` data and selected replay session frames into the W9-B handoff draft model.

The generated draft and source details reuse W9-B redaction for local paths, credential-looking strings, raw prompt markers, raw tool output markers, stdout/stderr markers, and transcript-text markers.

## Files Changed

- `webview-ui/src/components/AgentCenter.tsx`
  - Added Timeline Handoff Draft panel, preview state, and Copy Markdown action.
- `webview-ui/src/components/handoffDraftPageModel.ts`
  - Added pure handoff source-selection model.
- `webview-ui/test/handoff-draft-page-model.test.ts`
  - Added focused source-selection tests.
- `docs/roadmap/supervision/reports/W9-C-handoff-ui-report.md`
  - This report.

## Validation

- `npm run build`: passed
- `npm run test:webview`: passed, 100 tests
- `npm run test:server`: passed, 239 tests
- `git diff --check`: passed

## Known UI Limitations

- The preview is inline rather than a separate modal window.
- Clipboard success depends on webview/browser clipboard support; failure is shown explicitly.
- No manual Extension Host visual QA was performed in this package.
- The action/decision and validation/test sections remain W9-B placeholders for human completion.
