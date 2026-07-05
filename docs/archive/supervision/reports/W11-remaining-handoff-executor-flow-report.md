# W11 Remaining Handoff Executor Flow Report

## Summary

Completed the remaining W11 handoff executor workflow:

- Launch an executor directly from a package-backed handoff.
- Track launched executor metadata back into the `.handoff.json` sidecar.
- Detect local completion signals from the expected report file and local branch state.
- Add a queue-oriented Handoff Queue section beside Recent Handoffs.
- Persist safe timeline events for executor launch, completion refresh, and report opens.

## Launch Executor Behavior

- Recent Handoffs and Handoff Queue now expose `Launch executor` for handoffs that already have a work package.
- The webview sends only `requestId`, repo-relative handoff `relativePath`, and optional `providerId`.
- The extension derives the repo root, validates the handoff/work-package sidecar, builds the existing work-package prompt, and launches through `launchNewTerminal`.
- Codex is the supported launch provider for this package. Claude launch is explicitly rejected for now because the current Claude terminal path does not yet pass the work-package prompt into the CLI. If launch returns no agent, the sidecar is not linked.
- After a successful launch, the sidecar records execution metadata with status `active` and dispatch status `dispatched` unless the package was already explicitly `completed` or `blocked`.

## Completion Detection

- Completion scan is read-only.
- Scan results are added to the handoff library summary as `completion` metadata, not written to the sidecar:
  - `reportExists`
  - `reportRelativePath`
  - `reportModifiedAt`
  - `reportSizeBytes`
  - `branchName`
  - `branchExists`
  - `branchMergedToMain`
  - `checkedAt`
- Branch checks use safe local git reads only:
  - `git show-ref --verify --quiet refs/heads/<branch>`
  - `git merge-base --is-ancestor <branch> main`
- No checkout, stage, commit, merge, push, clean, reset, stash, delete, or rebase is performed.
- If the report exists, the UI enables `Open report`; the extension validates the report path stays under `docs/roadmap/supervision/reports/` before opening it.

## Handoff Queue View

- Added a dedicated Handoff Queue section within the Timeline/Handoff area.
- Queue grouping supports:
  - All packages
  - Needs dispatch
  - Active / waiting
  - Blocked
  - Report ready
  - Done
- Queue rows show handoff status, dispatch status, execution status, completion/report/branch state, work-package path, and compact actions:
  - Open handoff
  - Open work package
  - Copy prompt
  - Launch executor
  - Refresh completion
  - Open report
  - Dispatch and execution status actions

## Timeline Events

Added safe persisted timeline events:

- `handoff.executor_launched`
- `handoff.completion_refreshed`
- `handoff.report_opened`

Timeline persistence now retains safe branch/report fields:

- `branchName`
- `reportExists`
- `branchExists`
- `branchMergedToMain`

No raw prompt, raw transcript, raw tool output, credentials, absolute transcript paths, or Markdown body are persisted.

## Files Changed

- `src/agentManager.ts`
- `src/handoffArtifacts.ts`
- `src/PixelAgentsViewProvider.ts`
- `src/timelineEvents.ts`
- `src/timelineStore.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/timelinePageModel.ts`
- `webview-ui/src/hooks/timelineHistoryMessages.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `server/__tests__/handoffArtifacts.test.ts`
- `server/__tests__/timelineStore.test.ts`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `webview-ui/test/timeline-page-model.test.ts`

## Validation

- `npm run build`: passed
- `npm run test:webview`: passed, 137 tests
- `npm run test:server`: passed, 267 tests
- `git diff --check`: passed

Combined test count: 404.

## Known Limitations

- No desktop/Extension Host manual QA was performed in this code package.
- Claude executor launch remains a follow-up because the existing Claude terminal launcher does not yet inject the work-package prompt. Codex is the supported executor launch path for W11 remaining.
- Completion detection is display-only and does not auto-mark a package completed.
- Branch merged detection is local-main based and reports unknown if git cannot be queried safely.
