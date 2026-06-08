# W18-D - Auto Room Creation

## Objective

Automatically create practical local project rooms when visible top-level agents belong to projects
that do not yet have a room. This package should use the W18-B model and W18-C rendering, stay
within the existing one-canvas layout, and keep existing layouts safe.

## Read First

- `AGENTS.md`
- `docs/roadmap/product/project-rooms-spec.md`
- `docs/roadmap/supervision/reports/W18-A-project-rooms-spec-report.md`
- `docs/roadmap/supervision/reports/W18-B-room-aware-seating-model-report.md`
- `docs/roadmap/supervision/reports/W18-C-doorplates-room-boundaries-report.md`
- `webview-ui/src/constants.ts`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/editor/editorActions.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/layout/furnitureCatalog.ts`
- Relevant webview tests under `webview-ui/test/`

## Files Likely To Modify

- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/editor/editorActions.ts`
- Optional helper such as `webview-ui/src/office/projectRoomGeneration.ts`
- `webview-ui/src/App.tsx` or office message plumbing only if needed to persist generated rooms
- New or existing webview tests under `webview-ui/test/`

## Implementation Scope

- Detect visible top-level project keys that lack a matching room.
- Generate one default project room per missing project key.
- Include a small valid workstation template:
  - desk/table;
  - electronics;
  - chair facing/adjacent so W2-G workstation detection accepts it.
- Add a room-local rest seat when space permits.
- Allocate rooms deterministically and avoid duplicates across repeated scans.
- Respect `MAX_COLS` and `MAX_ROWS`.
- Prefer expanding to the right/down or placing in empty visible floor space.
- Persist generated room metadata and furniture through existing layout save flow.
- Use unassigned/global fallback and a safe warning if space is exhausted.

## Out Of Scope

- Manual room editor controls.
- Multiple independent canvases.
- Team/Lab Mode.
- Cloud/shared rooms.
- Provider discovery changes.
- Handoff/Work Queue/Usage/Timeline changes.
- Auto-staging, commits, or repo file writes beyond existing layout persistence.

## Required Tests

Add focused webview/model tests covering:

- a new project with no room creates exactly one project room;
- generated room contains at least one valid workstation seat;
- repeated generation does not duplicate rooms;
- generated room ids and project keys are stable;
- Codex multiple threads with the same cwd produce one project room;
- hidden/archived/killed agents do not trigger generation;
- sub-agents do not trigger generation;
- missing Claude/Cowork cwd uses unknown/unassigned fallback;
- layout expansion respects `MAX_COLS`/`MAX_ROWS`;
- overflow does not crash and leaves agents visible.

## Acceptance Criteria

- New visible projects can get usable rooms automatically.
- Generated rooms do not violate seating truthfulness.
- No duplicate rooms are created for the same normalized project key.
- Space exhaustion is safe and visible without blocking agents.
- Existing layouts without generated rooms still work.

## Report Path

Write:

`docs/roadmap/supervision/reports/W18-D-auto-room-creation-report.md`

The report must include generation rules, files changed, persistence behavior, overflow behavior,
tests added, validation results with counts, and manual QA gaps.

## Commit Instruction

Commit on the W18-D branch as a single commit.

Suggested commit message:

`feat: auto-create project rooms`
