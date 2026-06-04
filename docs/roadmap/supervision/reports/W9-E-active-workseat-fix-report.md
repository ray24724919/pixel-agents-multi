# W9-E Active Workseat Fix Report

## Summary

Fixed a webview restore race where Agent Center / overlay lifecycle state could show an agent as active while the office character stayed idle or in a rest seat.

Root cause: lifecycle/tool/status messages can arrive before the corresponding `OfficeState` character exists, especially during reload or restore. The UI state kept the active lifecycle record, but the one-time `os.setAgentActive()` call was dropped because there was no character yet. Restored agents then defaulted to `initialActive: false`.

## Changes

- Added a latest office-activity ref in `webview-ui/src/hooks/useExtensionMessages.ts`.
- Replayed the latest activity state when restored agents are added after layout load.
- Routed lifecycle, tool start/clear, and agent status messages through the shared office-activity helper.
- Added focused tests for lifecycle-driven office work and active restore seating.

## Verification

- `npm run build` passed.
- `npm run test:webview` passed: 103 tests.
- `git diff --check` passed.

## Notes

- Work was done in a separate worktree on `product/w9-e-active-workseat-fix` to avoid touching the active W9-D work in the main folder.
- Initial `npm run test:webview` failed before dependencies were installed in this worktree (`tsx` missing). After local dependency install, tests passed.
