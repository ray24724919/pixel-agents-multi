# W11-A Handoff Dispatch Workflow Report

## Summary

Implemented the first executor dispatch workflow for repo-backed handoff artifacts. Recent Handoffs now has a local "Copy dispatch prompt" action that turns a handoff Markdown artifact into a ready-to-send executor prompt without embedding the handoff body.

## Files Changed

- `src/constants.ts`
- `src/handoffArtifacts.ts`
- `src/PixelAgentsViewProvider.ts`
- `src/timelineEvents.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `server/__tests__/handoffArtifacts.test.ts`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `webview-ui/test/timeline-page-model.test.ts`

## Final Behavior

- Recent Handoffs shows `Copy dispatch prompt` beside Open and local status actions.
- The webview sends only `requestId` and repo-relative `relativePath`.
- The extension validates the artifact path, derives the current workspace repo root, builds a safe executor prompt, and returns bounded prompt text to the webview.
- The webview copies the returned prompt to the clipboard and shows branch/report feedback.
- Clipboard failure shows a visible error state and does not hide the handoff library.

## Dispatch Prompt Content

The generated prompt includes:

- `cwd` set to the current workspace repo root.
- The handoff Markdown repo-relative path.
- Instructions to read the handoff first and inspect relevant source before editing.
- Branch creation instructions under `product/handoff-<safe-slug>`.
- Executor report path under `docs/roadmap/supervision/reports/<safe-slug>-executor-report.md`.
- Guardrails forbidding push, merge, amend, rebase, stash, reset, clean, and file deletion.
- Commit instruction for completed work.
- Testing expectations covering `npm run build`, targeted webview/server tests, broad `npm test` when needed, and `git diff --check`.
- Blocked-flow instruction to write a clear report and stop without dirty cross-branch changes.

## Branch And Report Naming

- Slugs are derived conservatively from metadata title, artifact id, or Markdown filename.
- Slugs use the existing handoff filename sanitizer and are capped by the handoff slug length limit.
- Branch names use `product/handoff-<slug>`.
- Reports use `docs/roadmap/supervision/reports/<slug>-executor-report.md`.
- Tests cover unsafe path-like title input, traversal rejection, absolute path rejection, non-Markdown rejection, branch safety, and report filename length.

## Privacy And Safety

- The full handoff Markdown body is never embedded in the dispatch prompt.
- The prompt references the handoff path instead.
- The only absolute path intentionally included is the required `cwd`.
- No raw transcript, tool output, credentials, or arbitrary payloads are included.
- The extension host derives and validates filesystem paths; the webview cannot choose arbitrary paths.

## Timeline Event

- Added `handoff.dispatch_prompt_created`.
- The event includes safe handoff metadata only: filename/relative path in summary, artifact id/status when present, and existing provider/project/session/run metadata when available.
- No handoff body, raw transcript, raw output, or absolute artifact path is posted.

## Validation

- `npm run build`
  - Passed.
- `npm run test:webview`
  - Passed: 122 tests.
- `npm run test:server`
  - Passed: 257 tests.
- Combined test count:
  - 379 tests.
- `git diff --check`
  - Passed.

## Skipped Or Deferred

- No manual VS Code or installed VSIX QA was performed.
- Stretch status automation such as "mark reviewed after copy" was not added; W11-A keeps status actions explicit.
- No git staging, commit, push, PR, or external dispatch integration was added.
