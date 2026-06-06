# W14-C Handoff Checklist Copy Ergonomics Report

## Summary

Refined the handoff checklist copy model so package-backed handoffs no longer show merge-specific copy wording for non-merge-ready states. The copy flow remains read-only, copy-only, and manual-first.

## Files Changed

- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `docs/roadmap/supervision/reports/W14-C-handoff-checklist-copy-ergonomics-report.md`

## Final Behavior

- Added `buildHandoffChecklistCopyModel(item)` as the pure model for checklist copy labels, copied feedback, disabled state, and copy text.
- Ready-to-inspect handoffs still show `Copy merge checklist` and copy a `Manual Merge Checklist`.
- Needs-review handoffs show `Copy review checklist` and copy a `Manual Review Checklist`.
- Blocked handoffs show `Copy blocker checklist` and copy a `Manual Blocker Checklist`.
- Active, needs-report, and unknown handoffs show `Copy status checklist` and copy a `Manual Status Checklist`.
- Already-merged handoffs show `Copy closeout checklist` and copy a `Manual Closeout Checklist`.
- Handoffs without a dispatch package produce a disabled copy model with no text.
- Agent Center now uses the model-provided action and copied labels instead of hard-coded merge wording.

## Tests

- Added focused webview model coverage for merge, review, blocker, status, closeout, and no-dispatch copy states.
- Updated the existing safe checklist test to validate the new copy model while preserving repo-relative and no-raw-body safety checks.

## Validation

- `npm run test:webview` - passed, 154 tests
- `npm run test:server` - passed, 281 tests
- Combined test count: 435 tests
- `npm run build` - passed
- `git diff --check` - passed

## Risks / Follow-up

- No backend, launch, release identity, or git mutation behavior changed.
- The checklist remains a textual supervisor aid and does not inspect branches directly.
- No manual VS Code webview visual QA was performed in this package.
