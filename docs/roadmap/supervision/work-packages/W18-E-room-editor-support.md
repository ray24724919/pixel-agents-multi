# W18-E - Room Editor Support

## Objective

Add deliberate user control for Project Rooms in the layout editor. The user should be able to
select, rename, assign, resize, and classify rooms without changing provider behavior or creating a
Team/Lab sharing feature.

## Read First

- `AGENTS.md`
- `docs/roadmap/product/project-rooms-spec.md`
- `docs/roadmap/supervision/reports/W18-A-project-rooms-spec-report.md`
- `docs/roadmap/supervision/reports/W18-B-room-aware-seating-model-report.md`
- `docs/roadmap/supervision/reports/W18-C-doorplates-room-boundaries-report.md`
- `docs/roadmap/supervision/reports/W18-D-auto-room-creation-report.md`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/editor/editorActions.ts`
- `webview-ui/src/office/editor/editorState.ts`
- `webview-ui/src/office/editor/EditorToolbar.tsx`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- Existing editor/layout tests under `webview-ui/test/`

## Files Likely To Modify

- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/editor/editorActions.ts`
- `webview-ui/src/office/editor/editorState.ts`
- `webview-ui/src/office/editor/EditorToolbar.tsx`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/App.tsx`
- New or existing webview tests under `webview-ui/test/`

## Implementation Scope

- Add a room editor mode or tool.
- Allow selecting a room boundary without selecting furniture underneath when room tool is active.
- Allow changing:
  - room label;
  - room kind: project, public, rest, meeting, unassigned;
  - project assignment metadata where safe;
  - room bounds.
- Validate room bounds:
  - positive width and height;
  - inside layout;
  - no unsafe label/path content;
  - no malformed project key.
- Export/import `projectRooms` with the layout.
- Deleting a room deletes only room metadata by default, not furniture.
- Trigger seating repair after room metadata changes.

## Out Of Scope

- Provider discovery changes.
- Auto room generation changes beyond using W18-D helpers.
- Team/Lab Mode.
- Cloud/shared room metadata.
- Handoff/Work Queue/Usage/Timeline changes.
- Broad editor redesign.

## Required Tests

Add focused webview/editor tests covering:

- selecting a room in room mode does not select furniture underneath;
- renaming updates only room metadata;
- assigning a project key validates safe fields;
- changing room kind affects seating after repair;
- resizing/moving clamps or rejects invalid bounds;
- deleting room metadata preserves furniture;
- export/import round-trips `projectRooms`;
- malformed imported room records are repaired or dropped safely;
- no-room layouts remain backward compatible.

## Acceptance Criteria

- Users can manage rooms deliberately from the layout editor.
- Existing furniture workflows remain intact.
- Room metadata survives export/import.
- Invalid room edits do not break layout load or agent visibility.
- All behavior is covered by focused tests.

## Report Path

Write:

`docs/roadmap/supervision/reports/W18-E-room-editor-support-report.md`

The report must include editor behavior, files changed, validation behavior, tests added, validation
results with counts, and remaining product follow-up.

## Commit Instruction

Commit on the W18-E branch as a single commit.

Suggested commit message:

`feat: add project room editor support`
