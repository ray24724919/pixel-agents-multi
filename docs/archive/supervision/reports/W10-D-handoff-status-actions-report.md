# W10-D Handoff Status Actions Report

## Summary

Implemented local handoff status actions for repo-centered handoff artifacts. Recent Handoffs can now request local metadata status changes without changing the Markdown handoff body or implying cloud, git, or PR publishing.

## Files Changed

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
- `webview-ui/test/handoff-artifact-library-model.test.ts`

## Final Behavior

- Recent Handoffs now shows compact local status actions:
  - Mark reviewed
  - Mark stale
  - Reset draft
- The current status action is disabled.
- Markdown-only legacy handoffs remain visible, but status actions are disabled because there is no validated metadata sidecar to update.
- Successful status updates refresh the Recent Handoffs list and show a success state.
- Failed status updates keep the artifact list visible and show a failure state.

## Status Transition Semantics

- Allowed webview-requested local statuses are `draft`, `reviewed`, and `stale`.
- `published` remains a parseable metadata status for forward compatibility, but W10-D does not expose a "publish" UI action because no cloud/git publish flow exists.
- Status updates modify only the JSON sidecar fields:
  - `status`
  - `updatedAt`
- Markdown handoff content is preserved.

## Privacy And Path Safety

- The webview status update message sends only:
  - `requestId`
  - repo-relative `relativePath`
  - `nextStatus`
- The extension host validates and derives all filesystem paths.
- Status update validation rejects traversal, absolute paths, non-Markdown paths, missing sidecars, malformed sidecars, mismatched metadata, and invalid statuses.
- Sidecar updates are limited to `docs/agent-handoffs/`.
- No raw markdown body, raw transcript, absolute path, prompt text, tool output, credentials, staging, commits, pushes, or PR actions are added.

## Timeline Events

- Added persisted-safe timeline fields:
  - `previousStatus`
  - `nextStatus`
- Added `handoff.status_changed` timeline events.
- Status change events include only safe metadata such as artifact id, previous status, next status, filename, repo-relative path in the summary, provider/project/session/run metadata when already available.
- The event is retained by the existing handoff/action history path and persists through the local timeline store.

## Validation

- `npm run build`
  - Passed.
- `npm run test:webview`
  - Passed: 118 tests.
- `npm run test:server`
  - Passed: 254 tests.
- Combined test count:
  - 372 tests.
- `git diff --check`
  - Passed.

## Skipped Steps

- No manual VS Code or installed VSIX QA was performed; this work package is covered by code and automated tests.
