# W18-CDE - Project Rooms MVP

## Objective

Complete the remaining Project Rooms MVP in one larger implementation package. This package should
build on W18-B room-aware seating and deliver:

- W18-C: visible room boundaries and safe doorplates;
- W18-D: deterministic auto-creation of practical project rooms for visible top-level projects;
- W18-E: basic layout-editor support for selecting, naming, classifying, moving, resizing, and
  deleting room metadata.

The result should make Project Rooms usable as a local personal cockpit feature while preserving the
existing one-canvas office model and all W2-G/W9-E/W18-B seating truthfulness invariants.

## Branch

Start from current `main` after W18-B is merged:

```sh
git checkout main
git pull --ff-only origin main
git log -1 --oneline
git checkout -b product/w18-cde-project-rooms-mvp
```

The latest `main` should be `Merge W18-B: room-aware seating model` or later.

## Read First

- `AGENTS.md`
- `docs/roadmap/product/project-rooms-spec.md`
- `docs/roadmap/product/project-rooms-roadmap.md`
- `docs/roadmap/supervision/reports/W18-A-project-rooms-spec-report.md`
- `docs/roadmap/supervision/reports/W18-B-room-aware-seating-model-report.md`
- `docs/roadmap/supervision/work-packages/W18-C-doorplates-room-boundaries.md`
- `docs/roadmap/supervision/work-packages/W18-D-auto-room-creation.md`
- `docs/roadmap/supervision/work-packages/W18-E-room-editor-support.md`
- `webview-ui/src/constants.ts`
- `webview-ui/src/App.tsx`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/projectRooms.ts`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/layout/tileMap.ts`
- `webview-ui/src/office/layout/furnitureCatalog.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- `webview-ui/src/office/editor/editorActions.ts`
- `webview-ui/src/office/editor/editorState.ts`
- `webview-ui/src/office/editor/EditorToolbar.tsx`
- Existing webview tests under `webview-ui/test/`

## Files Likely To Modify

- `webview-ui/src/constants.ts`
- `webview-ui/src/App.tsx`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/projectRooms.ts`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- `webview-ui/src/office/editor/editorActions.ts`
- `webview-ui/src/office/editor/editorState.ts`
- `webview-ui/src/office/editor/EditorToolbar.tsx`
- Optional focused helpers:
  - `webview-ui/src/office/roomRendering.ts`
  - `webview-ui/src/office/projectRoomGeneration.ts`
  - `webview-ui/src/office/editor/roomEditorActions.ts`
- New or existing focused tests under `webview-ui/test/`
- `docs/roadmap/supervision/reports/W18-CDE-project-rooms-mvp-report.md`

Keep changes scoped to the office/project-room model, renderer, editor, and tests.

## Implementation Order

Implement this package in three internal slices, but commit as one final package after all
validation passes.

### Slice 1 - Room Rendering Model And Canvas Drawing

- Add a pure room render-model helper where practical.
- Normalize and skip malformed room records before producing draw instructions.
- Render subtle pixel-styled room boundaries after floor tiles and before furniture/characters.
- Render safe doorplate labels for project, public, rest, meeting, and unassigned rooms.
- Doorplates must show safe short labels only:
  - no raw absolute paths;
  - no transcript paths;
  - no prompts;
  - no tool output;
  - no credentials or secret-looking strings.
- Truncate or abbreviate labels to fit room bounds.
- Keep low-zoom behavior deterministic. If labels are too cramped, hide or abbreviate them.
- Avoid covering agents, bubbles, delegation markers, seat indicators, and editor controls where
  practical.
- Existing layouts without `projectRooms` must render unchanged.

### Slice 2 - Auto Room Creation

- Detect visible top-level project keys that lack a matching project room.
- Generate one default project room per missing normalized project key.
- Do not create project rooms for:
  - sub-agents;
  - hidden agents;
  - archived agents;
  - killed/removed agents;
  - transient unknown sessions without enough project identity.
- Unknown or weak project identity should use an unassigned/global fallback rather than a fake
  project-specific room.
- Generated project rooms must contain a practical workstation template:
  - a desk/table;
  - electronics;
  - a chair positioned/facing so W2-G/W18-B workstation detection accepts it.
- Add at least one room-local rest seat when space permits.
- Allocate rooms deterministically and avoid duplicate rooms across repeated scans/reloads.
- Respect `MAX_COLS` and `MAX_ROWS`.
- Prefer expanding or allocating in a predictable direction. Keep furniture and room bounds inside
  layout limits.
- If space is exhausted, do not crash and do not block agents. Use an unassigned/global fallback and
  surface a safe debug/editor note if there is an existing place for it.
- Persist generated room metadata and furniture through the existing layout save flow.
- Do not write repo files or create external artifacts from auto room generation. It only mutates
  the user layout state through the existing layout persistence path.

### Slice 3 - Basic Room Editor Support

- Add a room editor mode/tool in the layout editor.
- In room mode, selecting a room boundary should not select furniture underneath.
- Allow changing:
  - room label;
  - room kind: project, public, rest, meeting, unassigned;
  - safe project key/display metadata when practical;
  - room bounds.
- Support moving/resizing room bounds with validation or clear controls.
- Validate room edits:
  - positive width and height;
  - inside layout bounds;
  - safe label text;
  - safe project key;
  - malformed edits are rejected or clamped deterministically.
- Deleting a room deletes only room metadata by default. It must not delete furniture unless the user
  explicitly uses existing furniture tools.
- Export/import must round-trip `projectRooms`.
- Malformed imported room records should be normalized or dropped safely.
- Trigger seating repair after room metadata changes so active/idle agents move to valid seats.
- Keep existing furniture, floor, wall, zone paint, undo/redo, save/reset, and selection workflows
  intact.

## Required Tests

Add focused webview tests. Prefer pure helpers/model tests for renderer/generation/editor logic, and
keep canvas pixel tests minimal unless they are stable.

Required rendering tests:

- valid rooms produce bounded draw instructions;
- malformed rooms are skipped without crashing;
- project labels are sanitized/truncated and do not leak absolute paths;
- public/rest/meeting/unassigned labels are safe;
- doorplate placement stays inside or near room bounds;
- existing renderer behavior still works when `projectRooms` is missing.

Required generation tests:

- a new visible project with no room creates exactly one project room;
- generated room contains at least one valid workstation seat;
- generated room includes a rest seat when space permits;
- repeated generation does not duplicate rooms;
- generated room ids and project keys are stable;
- multiple Codex threads with the same cwd/project key produce one room;
- hidden/archived/killed agents do not trigger generation;
- sub-agents do not trigger generation;
- unknown/weak identity uses unassigned/global fallback rather than a fake project room;
- layout expansion/allocation respects `MAX_COLS` and `MAX_ROWS`;
- overflow does not crash and leaves agents visible.

Required editor/import tests:

- selecting a room in room mode does not select furniture underneath;
- renaming updates only room metadata;
- assigning a project key validates safe fields;
- changing room kind affects seating after repair;
- moving/resizing clamps or rejects invalid bounds;
- deleting room metadata preserves furniture;
- export/import round-trips `projectRooms`;
- malformed imported room records are repaired or dropped safely;
- no-room layouts remain backward compatible.

Required regression tests:

- W18-B room-aware active seating still prefers project-local workstation seats;
- active agents never type in rest seats;
- no valid work seat means no top-level `TYPE` in place;
- idle agents release work seats;
- sub-agents remain near parent and do not claim top-level room seats;
- delegation-driven supervisors still use valid project-room work seats;
- refresh/randomize remains duplicate-safe.

## Acceptance Criteria

- Project rooms are visually legible on the office canvas.
- Doorplates show safe short labels only.
- New visible projects can get usable generated rooms.
- Generated rooms do not violate workstation/rest truthfulness.
- No duplicate rooms are created for the same normalized project key.
- Users can manage rooms deliberately from the layout editor.
- Room metadata survives export/import.
- Invalid room metadata never breaks layout load, agent visibility, or seating repair.
- Existing layouts without `projectRooms` behave and render like before.
- Existing Handoff, Work Queue, Usage, Timeline, provider discovery, launch, and backend behavior are
  unchanged.

## Out Of Scope

- Multiple independent canvases.
- Team/Lab Mode.
- Cloud/shared rooms.
- Provider discovery changes.
- Handoff, Work Queue, Usage, Timeline, or replay changes.
- VSIX package/install QA.
- Broad editor redesign.
- Changing W18-B seating truth rules except when needed to repair a clear bug introduced by this
  package.

## Validation

Run at minimum:

```sh
git diff --check
npm run test:webview
npm run test:server
npm run build
```

Expected minimums after W18-B:

- webview tests must be at least 186 and should increase if tests are added;
- server tests must be at least 284.

Manual QA is optional for this package unless the implementation starts a local dev server or the
executor has safe access to a VS Code Extension Development Host. If manual visual QA is not
performed, say so clearly in the report and list what should be checked later:

- room boundaries visible at normal zoom;
- doorplates readable but not noisy;
- generated project rooms appear for two projects;
- room editor controls are usable without breaking furniture editing.

## Report Path

Write:

`docs/roadmap/supervision/reports/W18-CDE-project-rooms-mvp-report.md`

The report must include:

- files changed;
- final room rendering behavior;
- final auto-generation behavior;
- final room editor behavior;
- privacy decisions for doorplates/project labels;
- persistence/export/import behavior;
- seating invariants preserved;
- tests added and final counts;
- validation results;
- manual QA performed or skipped;
- known risks and recommended W18-F/W19 follow-up.

## Commit Instruction

Commit on the W18-CDE branch as a single commit after all validation passes.

Suggested commit message:

`feat: complete project rooms mvp`

Do not push.
Do not merge.
Do not amend or rebase.
Do not package or install the VSIX.

Final executor response should include:

- branch name;
- commit hash;
- files changed;
- test/check results with counts;
- manual QA status;
- open risks or deferred decisions.
