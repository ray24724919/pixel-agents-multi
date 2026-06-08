# W15-A Executor State Observability Report

## Branch / base

- Branch: `product/w15-a-executor-state-observability`
- Base: stacked on `product/w14-f-claude-handoff-launch-stuck`
- Dependency: `main` did not contain W14-F (`d26f421` / `8cc0897`) when this work began, so W15-A intentionally depends on the W14-F Claude launch-evidence fix.

## Summary

- Added a pure `buildHandoffExecutorStateModel()` helper for package-backed handoffs.
- The helper distinguishes no package, active, waiting for approval/input, blocked, completed, report-ready, and stale/unknown executor states.
- Report/completion review signals stay strongest, then visible linked agent state is used, then sidecar execution metadata is treated as weaker context.
- Codex and Claude use the same model path; provider labels are display-only.
- Recent Handoffs and Handoff Queue now render compact executor state cues and next-useful actions such as open report, refresh completion, or inspect terminal.
- Stale linked metadata, including active sidecars without a visible linked agent, is surfaced as stale/unknown instead of looking confidently active.
- README and the development timeline were updated to remove stale "Claude package launch deferred/planned" wording and reflect package-backed Codex / Claude launch plus executor-state observability.

## Safety notes

- No analytics UI, transcript replay, terminal replay, export, raw transcript, raw prompt, raw output, or path-recording behavior was added.
- Executor-state UI uses already-safe webview agent summaries and handoff metadata.
- The new model redacts unsafe live labels before display and test coverage asserts that absolute paths, prompt-like text, tool-output-like text, and secrets are not exposed.
- No git push, merge, rebase, reset, stash, clean, delete, or amend was performed.

## Validation

- `npm run check-types`: passed
- `npm run build`: passed after ESLint import-sort autofix on `webview-ui/src/components/AgentCenter.tsx`
- `npm run test:webview`: passed, 159 tests after supervisor follow-up
- `npm run test:server`: passed, 284 tests
- `npm run release:local`: passed
- `npm run verify:installed`: passed
- `git diff --check`: passed
- `git status --short --branch`: passed pre-stage with only expected W15-A changes and handoff/report artifacts

## Supervisor follow-up

- Fixed Handoff Queue all-group sorting so the same live executor state model used for grouping is
  also used for sort priority.
- Added coverage for a visible linked executor in error state so live-blocked packages sort before
  report-ready packages in the all queue.
