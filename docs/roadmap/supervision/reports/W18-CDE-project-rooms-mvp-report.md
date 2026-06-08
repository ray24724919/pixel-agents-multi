# W18-CDE Project Rooms MVP Report

## Summary

W18-CDE completed the remaining Project Rooms MVP on top of W18-B room-aware seating:

- visible project room boundaries and safe doorplates on the office canvas;
- deterministic, user-triggered room generation for visible top-level projects;
- basic layout editor support for selecting, creating, renaming, classifying, moving, resizing, and deleting room metadata.

No backend, provider discovery, Handoff, Work Queue, Usage, Timeline, launch, or VSIX packaging behavior was changed.

## Files Changed

- `webview-ui/src/constants.ts`
- `webview-ui/src/App.tsx`
- `webview-ui/src/hooks/useEditorActions.ts`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/projectRooms.ts`
- `webview-ui/src/office/roomRendering.ts`
- `webview-ui/src/office/projectRoomGeneration.ts`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- `webview-ui/src/office/editor/EditorToolbar.tsx`
- `webview-ui/src/office/editor/editorState.ts`
- `webview-ui/src/office/editor/roomEditorActions.ts`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/office/layout/furnitureCatalog.ts`
- `webview-ui/test/project-room-rendering.test.ts`
- `webview-ui/test/project-room-generation.test.ts`
- `webview-ui/test/project-room-editor-actions.test.ts`

## Room Rendering Behavior

Project rooms now render as subtle pixel-styled floor overlays after floor tiles and before furniture, walls, agents, bubbles, and delegation markers. Seat indicators and editor overlays still render above the room bands.

Doorplates are generated from room label, project display name, or safe room-kind fallback. Labels are truncated to a short deterministic length and clipped inside the doorplate. Invalid or malformed room records are normalized or skipped before rendering.

Existing layouts without `projectRooms` produce no room render instructions and visually remain unchanged.

## Doorplate Privacy Decisions

Doorplate labels never render raw absolute paths, transcript filenames, raw prompt/tool-output-looking text, or secret-looking strings. Windows and POSIX absolute paths are reduced to a basename when safe; otherwise they fall back to generic labels such as `Project`, `Public`, `Rest`, `Meeting`, or `Unassigned`.

The renderer receives only the safe, bounded label from the room render model.

Supervisor QA hardening also covers plain Windows UNC paths and broader POSIX absolute paths during room normalization, so imported room labels and project display names are sanitized before rendering.

## Auto-Generation Behavior

Auto room creation is deliberately user-triggered from the layout editor via `Rooms > Auto rooms`. This avoids surprising existing no-room layouts while still providing deterministic room creation for visible top-level projects.

The generation helper:

- derives normalized project keys from visible top-level agent `folderName`;
- skips sub-agents and agents filtered out of the current Office view;
- skips unknown project identity instead of creating fake project rooms;
- creates at most one room per normalized project key;
- uses stable room ids such as `project-alpha`;
- appends rooms in a deterministic down-then-right allocation strategy;
- respects `MAX_COLS` and `MAX_ROWS`;
- paints usable floor tiles in the generated room area;
- adds a workstation template with desk, electronics, and a chair chosen from the loaded furniture catalog;
- adds a room-local rest seat when a suitable rest chair/sofa/bench asset is available and the room is wide enough.

Generated rooms and furniture mutate the in-memory `OfficeLayout` through the existing editor apply/save path, so normal layout persistence, undo/redo, and seating repair still apply.

## Room Editor Behavior

The layout editor now includes a `Rooms` tool. In room mode:

- clicking an existing room selects room metadata instead of selecting furniture underneath;
- clicking empty floor creates a default unassigned room;
- the toolbar can select rooms from a compact list;
- labels, room kind, project key/name, and bounds can be edited;
- invalid bounds are clamped inside the layout;
- deleting a room removes only room metadata and preserves furniture;
- changing room metadata rebuilds the layout and triggers existing seating repair.

Import/export already round-trips `projectRooms` through `OfficeLayout`; malformed room records continue to be normalized or dropped by the existing layout migration path.

## Seating Invariants Preserved

W18-CDE does not relax W2-G/W9-E/W18-B seating truthfulness:

- active top-level agents still require a valid workstation seat to enter `TYPE`;
- active agents do not type in rest seats or empty air;
- idle agents still release work seats and prefer rest seats;
- sub-agents remain near their parent and do not claim normal top-level room seats;
- delegation-driven supervisors still use valid project-room work seats;
- stale or duplicate seat ownership remains repaired by `OfficeState.repairSeatingAssignments`.

## Tests Added

Added focused webview tests for:

- safe room render instructions and doorplate label redaction;
- malformed room records;
- generated rooms, stable ids, workstation/rest-seat contents, duplicate prevention, hidden/subagent skipping, unknown identity fallback, and overflow safety;
- room selection over furniture, metadata-only rename/delete, project-key normalization, bounds clamping, import/export round-trip, and seating effects after room kind changes.

## Validation Results

- `npm run build`
  - Passed.
  - Existing Vite warning: webview chunk larger than 500 kB after minification.
- `npm run test:webview`
  - Passed: 208 tests after supervisor QA hardening.
- `npm run test:server`
  - Passed: 284 tests.
- `git diff --check`
  - Passed.

Combined automated tests: 492.

## Manual QA

Manual VS Code / canvas QA was not performed in this code-only package. Recommended follow-up:

- inspect room boundary readability at normal and low zoom;
- confirm doorplates are visible but not noisy in a real layout;
- click `Rooms > Auto rooms` with two visible projects and confirm generated rooms appear;
- edit/move/delete room metadata in the layout editor and confirm furniture editing remains usable;
- save/reload the layout and confirm room metadata persists.

## Known Risks And Follow-Up

- Auto room creation is intentionally explicit rather than background automatic; W18-F can decide whether to add a setting or first-run prompt.
- Generated furniture uses the currently loaded catalog and may skip generation if a desk, surface electronics item, or chair is unavailable.
- Room editing uses compact form controls rather than drag handles; future polish can add direct resize/move gestures.
- Doorplate visual tuning should be checked in installed-extension QA before broader release.
