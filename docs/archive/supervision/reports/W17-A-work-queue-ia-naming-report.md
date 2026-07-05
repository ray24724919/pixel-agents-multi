# W17-A Work Queue IA And Naming Report

## Summary

Implemented the first low-risk UI simplification pass from W16-D. The handoff/executor surface now presents the operational package-backed workflow as **Work Queue** and the artifact/reference area as **Handoff Library**, while preserving the existing Handoff Draft creation flow and all existing handoff actions.

No backend handoff parsing, metadata schema, message protocol, Codex launch behavior, or Claude launch behavior was changed.

## Visible Wording Changes

- Visible `Recent Handoffs` heading is now `Handoff Library`.
- Visible `Handoff Queue` heading is now `Work Queue`.
- The parent section heading is now `Handoff Workflow`, with copy that describes "local handoff artifacts and package-backed executor work."
- Library copy now describes `docs/agent-handoffs/` as local context artifacts for review and reuse.
- Work Queue copy now describes package-backed handoffs ready for executor supervision.
- Empty states were clarified:
  - Work Queue: package-backed handoffs appear after creating a work package from a handoff.
  - Handoff Library: generated handoffs appear after the user writes a handoff artifact.
- User-facing action labels were updated:
  - `Refresh completion` -> `Refresh report status`
  - `Open report` -> `Open executor report`
  - `Copy dispatch prompt` -> `Copy handoff prompt`
  - `Copy prompt` -> `Copy work-package prompt`
- Status/recommendation copy now uses report-status language instead of abstract completion language where visible to the supervisor.

## Section Ordering Behavior

Added a pure `buildHandoffWorkflowLayout()` helper in `handoffArtifactLibraryModel.ts`.

Behavior:

- If any loaded handoff has `dispatchPackage`, the section order is:
  1. Work Queue
  2. Handoff Library
- If no package-backed handoffs exist, the section order is:
  1. Handoff Library
  2. Work Queue

This keeps the library easy to reach in a new/empty workspace while making package-backed executor work the first operational surface once work packages exist.

## Files Changed

- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `docs/roadmap/supervision/reports/W17-A-work-queue-ia-naming-report.md`

## Tests Added

Added focused webview model tests for:

- Handoff Library / Work Queue visible label copy.
- Section ordering with no package-backed handoffs.
- Section ordering when package-backed handoffs exist.

## Validation

- `npm run test:webview`: passed, 168 tests.
- `npm run test:server`: passed, 284 tests.
- `npm run build`: passed.
- `git diff --check`: passed.

Expected minimums were met:

- webview tests: 168 >= 166.
- server tests: 284 >= 284.

## Follow-Up For W17-B / W17-C

- W17-B should introduce a row action display model so each row shows only the most relevant primary actions while keeping maintenance/status controls reachable in a quieter area.
- W17-C should consolidate executor state, completion review, and merge readiness into one decision strip so the supervisor does not have to parse multiple cue blocks.
- A later visual QA pass should verify the reordered sections with real long handoff lists and narrow VS Code panel widths.

## Safety Notes

- No persisted metadata field names were renamed.
- No webview message names were renamed.
- No backend parsing or filesystem behavior changed.
- No provider adoption, launch, usage tracking, office rendering, git mutation, push, merge, rebase, reset, stash, or clean behavior was added or changed.
