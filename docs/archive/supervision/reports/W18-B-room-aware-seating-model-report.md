# W18-B Room-Aware Seating Model Report

## Summary

Implemented the first Project Rooms behavior slice for office seating. `OfficeLayout.projectRooms?`
is now typed and normalized when present, and `OfficeState` uses room-aware candidate priority while
preserving the existing workstation/rest truth model.

No renderer, editor UI, backend, provider discovery, Handoff, Work Queue, Usage, Timeline, package,
or installed VSIX behavior was changed.

## Files Changed

- `webview-ui/src/constants.ts`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/projectRooms.ts`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/test/seating-invariants.test.ts`
- `docs/roadmap/supervision/reports/W18-B-room-aware-seating-model-report.md`

## Final Room-Aware Seating Behavior

- Layouts without `projectRooms` keep the previous global seating behavior.
- Room metadata is optional. When present, malformed room records are dropped and bounds are clamped
  to the current layout instead of failing the whole layout.
- Active top-level agents still require a valid workstation seat: `seatKind === "work"` and
  `zoneSource === "workstation"`.
- Active agents with a matching project room prefer room-local work seats before fallback seats.
- Idle top-level agents prefer room-local rest seats.
- Persisted `seatId`, `workSeatId`, and `restSeatId` remain preferences, not truth. Repair reassigns
  stale or out-of-room seats when a better room-local candidate exists.
- Refresh/randomize now selects from the best room-priority candidate set first and still prevents
  duplicate seat ownership globally.
- Idle update/reclaim behavior is scoped to the same room-priority rest candidate set, so later
  wandering does not silently pull an idle agent into another project's room.
- Sub-agents still spawn near the parent and do not claim top-level seats.
- Delegation-driven supervisors are treated as active and use project-room work seats when available.

## Fallback Behavior

- Known project with matching room:
  - work: own project room, then unassigned room, then global/non-other-project fallback, then other
    project room only if no safer fallback exists.
  - rest: own project room, then public/rest rooms, then unassigned, then global fallback.
- Known project without a matching room:
  - unassigned room first, then public/global fallback.
- Unknown project:
  - unassigned room first, then public/global fallback.
- If no valid work seat exists anywhere, active top-level agents remain logically active but do not
  enter `TYPE` at empty air or rest seats.

## Tests Added

Added focused webview seating tests covering:

- active agents use valid work seats inside their own project room first;
- two projects with capacity do not claim each other's work seats;
- idle agents prefer rest seats inside their own room;
- idle agents fall back to public rest seats when their room lacks rest seats;
- unknown project agents use unassigned fallback;
- restored persisted seats outside the project room are repaired;
- duplicate seat ownership across rooms is repaired deterministically;
- room-scoped refresh/randomize avoids stacking;
- no local or fallback work seat means no top-level `TYPE` in place;
- sub-agents stay near parent and do not claim normal room seats;
- delegation-driven supervisors use valid project-room work seats;
- no-room layouts preserve global seating behavior.

## Validation

- `git diff --check`
  - Passed.
- `npm run test:webview`
  - Passed: 186 tests.
- `npm run test:server`
  - Passed: 284 tests.
- `npm run build`
  - Passed.
  - Existing Vite warning remains: one webview chunk is larger than 500 kB after minification.

## Remaining Follow-Up And Risk

- W18-C should add room boundary and doorplate render models without changing seating truth.
- W18-D should decide whether auto-room creation is automatic, prompt-gated, or setting-gated.
- W18-E should add deliberate room editor support and decide overlap rules for public/rest/meeting
  rooms.
- Current room assignment uses existing safe `folderName` metadata in the webview. Stronger
  projectDir/projectName metadata can be wired later using the same room-key helper path.
- Overlapping project rooms are tolerated by priority rules but not actively surfaced to the user.
  Editor validation should make that clearer in W18-E.
