# W17-BC Work Queue Row Simplification Report

## Summary

Implemented W17-B and W17-C together for the Agent Center handoff workflow. Work Queue rows now show a compact decision strip that answers stage, evidence, warnings, and next best action before showing secondary controls. Handoff Library rows keep the existing richer artifact/reference behavior.

No backend handoff parsing, persisted metadata schema, webview message protocol, Codex launch behavior, or Claude launch behavior was changed.

## Display Model Fields Added

Added `buildWorkQueueRowDecisionModel(item, agents)` in `webview-ui/src/components/handoffArtifactLibraryModel.ts`.

The model combines the existing helper paths instead of duplicating the workflow logic:

- `buildHandoffExecutorStateModel`
- `buildHandoffReviewRecommendedAction`
- `buildHandoffMergeReadiness`
- `handoffQueueGroupForItem`

It exposes safe display fields:

- `stageLabel`
- `stageTone`
- `queueGroup`
- `evidenceLine`
- `warningCount`
- `warningLabel`
- `primaryActionLabel`
- `primaryActionKind`
- `primaryActionDisabled`
- `primaryActionDetail`
- `secondarySummary`
- `detailRows`
- optional `providerLabel`, `executorLabel`, and visible `linkedAgentId`

The model uses existing redaction helpers for display strings. It does not include raw prompts, raw tool output, full report bodies, absolute transcript paths, or arbitrary payload data.

## Work Queue UI Changes

Updated `webview-ui/src/components/AgentCenter.tsx` so Work Queue rows now show:

- a compact stage badge;
- one evidence line;
- warning count when present;
- a `Next:` line with the primary recommended action;
- compact detail chips for queue group, executor/provider, branch, report, validation, and warnings;
- right-side action groups:
  - `Next step`
  - `Reference`
  - `Executor`
  - `Maintenance`

The Work Queue no longer renders the full executor cue, review cue, and merge readiness block all at once. Those details are consolidated into the decision strip.

Handoff Library behavior remains richer and reference-oriented. Markdown-only handoffs remain non-launchable.

## Actions Preserved

The following actions remain available:

- Open handoff
- Create work package
- Open work package
- Copy handoff prompt
- Copy work-package prompt
- Launch Codex
- Launch Claude
- Link executor
- Update dispatch status
- Update execution status
- Refresh report status
- Open executor report
- Mark reviewed
- Mark stale
- Reset draft

When a visible executor is linked and the next action is terminal inspection, the Work Queue primary action focuses that existing agent through the existing `focusAgent` webview message.

## Tests Added / Updated

Added focused webview model tests for:

- ready package without executor -> primary action is launch executor;
- active/waiting executor -> primary action is terminal inspection;
- review-ready report -> primary action is open executor report;
- blocked packages with and without reports;
- merged work does not recommend another launch;
- unsafe labels are redacted or omitted.

Existing Handoff Library, Work Queue grouping, status, launch-message, timeline, usage, and office tests continue to pass.

## Validation

- `npm run test:webview`: passed, 174 tests.
- `npm run test:server`: passed, 284 tests.
- `npm run build`: passed.
- `git diff --check`: passed.

Expected minimums were met:

- webview tests: 174 >= 168.
- server tests: 284 >= 284.

## Files Changed

- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `docs/roadmap/supervision/reports/W17-BC-work-queue-row-simplification-report.md`

## Follow-Up Recommendations

- Do a narrow installed VSIX visual QA pass with several real package-backed rows at normal and narrow panel widths.
- Consider a later disclosure/overflow treatment if the `Reference`, `Executor`, and `Maintenance` groups still feel too tall with many agents.
- Keep W17-D or later focused on visual density and copy polish only; this package intentionally did not alter launch, metadata, or backend review semantics.
