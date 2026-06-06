# W13-E Compact Handoff Status Controls Report

## Summary

W13-E reduces the remaining status-maintenance noise in Agent Center handoff rows. Dispatch and execution status changes are now compact pixel-styled selects inside the existing Status group, while all primary, reference, local artifact, launch, link, and status update capabilities stay on the same shared `HandoffRowActions` presentation path.

## Files Changed

- `webview-ui/src/components/AgentCenter.tsx`
- `docs/roadmap/supervision/reports/W13-E-compact-handoff-status-controls-report.md`

## Final Behavior

- Recent Handoffs and Handoff Queue still use the shared `HandoffRowActions` renderer.
- Primary actions remain prominent:
  - `Mark reviewed` when available
  - `Launch Codex`
  - `Launch Claude`
  - `Open report`
  - `Refresh completion`
  - `Create work package`
- Reference actions remain available:
  - `Open handoff`
  - `Copy dispatch prompt`
  - `Open work package`
  - `Copy prompt`
  - `Link agent`
- Local artifact maintenance remains quiet with the existing buttons:
  - `Mark stale`
  - `Reset draft`
- Dispatch status maintenance is now a compact `Dispatch` select that can set every existing dispatch status: `ready`, `dispatched`, `completed`, `blocked`, and `draft`.
- Execution status maintenance is now a compact `Execution` select that can set every existing execution status: `active`, `waiting`, `completed`, `blocked`, and `unknown`.
- Status selects show the current status, including non-target current states such as `linked`, disable unavailable/current options, and call only the existing status update handlers when a different enabled status is selected.

## Safety / Guardrails

- No backend code was changed.
- No Codex or Claude launch behavior was changed.
- No child process, shell execution, automatic branch mutation, merge, push, rebase, reset, stash, or clean behavior was added.
- Existing safe handlers and handoff message builders remain the behavior boundary; this package only changes row-action presentation.
- Dispatch controls remain disabled while work-package actions are busy.
- Execution controls remain disabled while execution actions are busy.

## Tests Added Or Why No New Tests Were Needed

No new tests were added because this package only changes JSX presentation in `AgentCenter.tsx`. The underlying pure handoff model helpers, status action arrays, message builders, and queue grouping logic were not changed. Existing tests continue to cover those helper/model paths.

## Validation Results

- `npm run build`: passed
- `npm run test:webview`: passed, 143 tests
- `npm run test:server`: passed, 281 tests
- Combined test count: 424
- `git diff --check`: passed

## Known Limitations / Follow-Up

- No manual VS Code webview visual QA was performed in this package.
- A future visual pass could tune select widths or option wording after seeing dense real-world handoff queues, but all existing status capabilities are preserved in the compact controls.
