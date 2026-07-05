# W14-B Handoff Queue Operator Summary Report

## Summary

W14-B adds a compact operator summary for the Handoff Queue. The summary is derived from all package-backed handoffs through a pure model helper, highlights the highest-priority queue group that needs supervisor attention, and gives the user a one-click way to switch the queue filter to that group.

## Files Changed

- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `docs/roadmap/supervision/reports/W14-B-handoff-queue-operator-summary-report.md`

## Final Behavior

- `buildHandoffQueueOperatorSummary(items)` now derives the next queue group to inspect without changing the existing queue summary, grouping, sorting, or row actions.
- Priority order is blocked, report ready, active or waiting, needs dispatch, done, then empty/all.
- The summary includes `status`, `label`, `detail`, `targetGroup`, and `actionLabel`.
- Handoff Queue now shows the compact operator cue near the existing queue counts.
- The cue action button calls `setQueueGroup(operatorSummary.targetGroup)` so the user can jump directly to the recommended group.
- Empty package-backed queues show a useful idle message and no misleading action button.

## Tests

- Added focused pure model tests for:
  - blocked priority winning over report ready, active/waiting, and needs dispatch
  - report ready priority when there are no blockers
  - active/waiting priority when there are no blockers or ready reports
  - needs dispatch priority for draft/ready-only queues
  - all done and empty states

## Validation

- `npm run test:webview`: passed, 153 tests
- `npm run test:server`: passed, 281 tests
- Combined test count: 434 tests
- `npm run build`: passed
- `git diff --check`: passed

## Risks / Follow-up

- No backend, launch, git mutation, or desktop automation behavior changed.
- No manual VS Code webview visual QA was performed in this package.
- A later dense-queue visual pass could tune wording or spacing after observing real long queues.
