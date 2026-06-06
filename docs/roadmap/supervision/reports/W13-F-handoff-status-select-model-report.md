# W13-F Handoff Status Select Model Report

## Summary

W13-F made the compact handoff status-select behavior testable. The status select option construction now lives in a pure helper so current states that are not manual transition targets, such as execution `linked`, remain visible instead of rendering as a blank select.

## Files Changed

- `webview-ui/src/components/handoffArtifactLibraryModel.ts`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/test/handoff-artifact-library-model.test.ts`
- `docs/roadmap/supervision/reports/W13-F-handoff-status-select-model-report.md`

## Final Behavior

- `AgentCenter.tsx` still owns the JSX rendering for compact status controls.
- `buildHandoffStatusSelectModel()` now builds the select view model:
  - includes the current value when it already appears in transition actions
  - inserts a disabled current option when the current value is not a transition target
  - disables options during global busy states
  - disables the select when every transition is unavailable
- Execution status `linked` can display as the current status while still allowing supported manual transitions such as active, waiting, completed, blocked, and unknown.

## Safety / Guardrails

- No backend code was changed.
- No Codex or Claude launch behavior was changed.
- No child process, shell execution, automatic branch mutation, merge, push, rebase, reset, stash, or clean behavior was added.
- Available status transitions were not expanded; W13-F only keeps current non-transition states visible.

## Tests Added

Added focused model tests for:

- current value already present in the action array
- current value missing from actions, including `linked`
- global disabled state
- all-transition-disabled state
- enabled transitions from a non-transition current state

## Validation Results

- `npm run build`: passed
- `npm run test:webview`: passed, 148 tests
- `npm run test:server`: passed, 281 tests
- Combined test count: 429
- `git diff --check`: passed

## Known Limitations / Follow-Up

- This package does not perform live VS Code visual QA.
- It keeps the W13-E compact select UX unchanged except for moving option construction into a tested helper.
