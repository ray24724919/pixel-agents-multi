# W18-B - Room-Aware Seating Model

## Objective

Implement the first Project Rooms behavior slice: room-aware agent assignment and seating. This
package should not render room boundaries or auto-create rooms yet. Existing layouts without
`projectRooms` must behave exactly as they do today.

## Read First

- `AGENTS.md`
- `docs/roadmap/product/project-rooms-spec.md`
- `docs/roadmap/product/project-rooms-roadmap.md`
- `docs/roadmap/supervision/reports/W18-A-project-rooms-spec-report.md`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/layout/tileMap.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/engine/characters.ts`
- `webview-ui/src/office/zoneUtils.ts`
- `webview-ui/test/seating-invariants.test.ts`
- `webview-ui/test/office-delegation-visuals.test.ts`

## Files Likely To Modify

- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/zoneUtils.ts`
- `webview-ui/test/seating-invariants.test.ts`
- `webview-ui/test/office-delegation-visuals.test.ts`
- Optional new helper/test files under `webview-ui/src/office/` and `webview-ui/test/`

## Implementation Scope

- Add optional `OfficeLayout.projectRooms?` types and safe room kind/project metadata types.
- Add pure helpers for:
  - validating/clamping room records;
  - finding the room containing a tile/seat;
  - deriving an agent's room assignment from existing safe character metadata;
  - selecting room-local work/rest candidates before fallback candidates.
- Update `OfficeState` seating paths so:
  - active top-level agents prefer valid workstation seats inside their project room;
  - idle top-level agents prefer room-local rest seats;
  - idle fallback can use public/rest and unassigned/rest seats;
  - unknown projects can use unassigned/global fallback;
  - no-room layouts use the current global behavior.
- Update `repairSeatingAssignments`, `chooseSeatForAgent`, and `randomizeTopLevelSeats` through
  small focused changes.
- Preserve existing W2-G/W9-E invariants:
  - top-level active agents never type in rest seats;
  - no valid work seat means no top-level `TYPE` in place;
  - idle agents release work seats;
  - stale/duplicate seat ownership repairs deterministically.

## Out Of Scope

- Rendering room boundaries or doorplates.
- Auto-creating rooms/furniture.
- Room editor UI.
- Team/Lab Mode.
- Provider discovery changes.
- Handoff, Work Queue, Usage, Timeline, or backend behavior changes.

## Required Tests

Add focused webview tests covering:

- active agents use valid work seats inside their own project room first;
- two projects with capacity do not claim each other's room-local work seats;
- idle agents prefer rest seats inside their own project room;
- idle agents fall back to public rest seats when their room lacks rest seats;
- unknown project agents use an unassigned room/fallback;
- restored persisted seat outside the agent's project room is repaired;
- duplicate seat ownership across rooms is repaired deterministically;
- room-scoped refresh/randomize avoids stacking;
- no room-local or fallback work seat means no top-level `TYPE` in place;
- sub-agent behavior remains near parent and does not claim normal room seats;
- delegation-driven supervisors still use valid project-room work seats.

## Acceptance Criteria

- Existing no-room layouts pass all previous seating tests unchanged.
- Room layouts route agents to project-local seats when safe capacity exists.
- Room fallback never violates workstation/rest truthfulness.
- Refresh/randomize is room-aware and still globally duplicate-safe.
- Tests are pure model tests and do not require VS Code manual QA.

## Report Path

Write:

`docs/roadmap/supervision/reports/W18-B-room-aware-seating-model-report.md`

The report must include files changed, final seating behavior, fallback behavior, tests added,
validation results with counts, and any remaining W18-C/D/E follow-up.

## Commit Instruction

Commit on the W18-B branch as a single commit.

Suggested commit message:

`feat: add room-aware seating model`
