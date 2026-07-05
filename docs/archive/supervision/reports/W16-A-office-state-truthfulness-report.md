# W16-A Office State Truthfulness Report

## Summary

Implemented a focused office-state truthfulness patch so visible office behavior better matches agent lifecycle state:

- `waiting_permission` and `paused` lifecycle states now stop office work animation instead of leaving agents visually typing.
- Permission events immediately stop office work animation while preserving the permission bubble.
- Delegating supervisors still move to valid workstation seats while active delegates exist, but the supervision posture now uses the existing reading animation path instead of pretending to type.
- Codex and Claude delegation continue to use the same provider-agnostic visual-state logic.

## Root Causes Found

- `lifecycleStatusStopsOfficeWork()` did not include `waiting_permission` or `paused`, so lifecycle updates could show Agent Center waiting/paused while the office character kept active typing state.
- `agentToolPermission` updated permission metadata and bubbles but did not explicitly stop office activity, so a permission-waiting agent could continue looking busy until another lifecycle/status message arrived.
- Delegation-driven supervisors used `currentTool = "Delegation"` but that tool name was not classified as a reading/supervision posture. Because unknown tools use the typing sprite path, supervisors with active delegates could look like they were typing even when only supervising.

## Files Changed

- `webview-ui/src/constants.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/office/engine/characters.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/test/office-activity-restore.test.ts`
- `webview-ui/test/office-delegation-visuals.test.ts`

## Final Visual / State Behavior

- Active agents with real thinking/tool-running lifecycle state still drive workstation seating and work animation.
- Waiting, permission-waiting, paused, completed, idle, and error lifecycle states stop office work animation.
- Permission-waiting agents keep the attention bubble but no longer keep active typing posture.
- Delegating supervisors with active workers stay in the active/supervising office path and prefer a valid workstation when available.
- Delegating supervisors use the reading animation path for `Delegation`, making the posture look like supervision/coordination rather than tool typing.
- If no valid workstation exists, existing seating invariants still keep active top-level agents non-typing rather than typing in place.

## Codex / Claude Symmetry

The patch does not branch on provider. Codex and Claude delegation summaries both become the same `DelegationVisualState`, and the office engine applies the same workstation and supervision-posture logic to both.

## Tests Added / Updated

- Added lifecycle helper coverage proving `waiting_permission` and `paused` stop office work animation.
- Added delegation visual coverage proving supervisors use the shared supervision tool name and reading posture.
- Added Codex/Claude symmetry coverage for delegation visual state at a workstation.

Final counts:

- Webview tests: 163 passed.
- Server tests: 284 passed.
- Combined: 447 passed.

## Validation

- `git diff --check`: passed.
- `npm run test:webview`: passed, 163 tests.
- `npm run test:server`: passed, 284 tests.
- `npm run build`: passed.
- `npm run release:local`: passed; built, verified identity, verified VSIX contents, packaged, installed local VSIX, and verified installed extension.
- `npm run verify:installed`: passed; installed extension verified as `raychen.pixel-agents-multi@1.3.0`.

## Supervisor Follow-up

- Tightened the delegation engine path so an inactive supervisor with active delegates always switches stale tool posture to the shared `Delegation` supervision tool instead of preserving an old typing tool such as `Bash`.
- Added regression coverage for stale tool posture while delegation still drives the supervisor active.
- Supervisor validation: `git diff --check`, `npm run test:webview`, `npm run test:server`, `npm run build`, and `npm run release:local` passed.

## Notes

- The prompt listed two W9 report names that are not present on current main: `W9-E-active-workstation-state-report.md` and `W9-F-active-workstation-invariants-report.md`. I used the actual current report `W9-E-active-workseat-fix-report.md` and the seating invariant report `W2-G-seating-invariants-report.md`.
- No desktop/manual visual QA was performed in this code package.
- Remaining manual QA gap: visually confirm in VS Code that waiting/permission/paused agents stop typing, and that Codex/Claude delegating supervisors read as supervising with the existing marker.
