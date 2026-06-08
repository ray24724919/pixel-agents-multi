# W18-C - Doorplates And Room Boundaries

## Objective

Make Project Rooms visible in the office canvas by rendering safe room boundaries and doorplates.
This package depends on W18-B room metadata and room-aware seating, but must not auto-create rooms
or add full editor support yet.

## Read First

- `AGENTS.md`
- `docs/roadmap/product/project-rooms-spec.md`
- `docs/roadmap/supervision/reports/W18-A-project-rooms-spec-report.md`
- `docs/roadmap/supervision/reports/W18-B-room-aware-seating-model-report.md`
- `webview-ui/src/constants.ts`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- `webview-ui/src/office/layout/layoutSerializer.ts`
- Existing renderer/model tests under `webview-ui/test/`

## Files Likely To Modify

- `webview-ui/src/constants.ts`
- `webview-ui/src/office/types.ts`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- Optional helper such as `webview-ui/src/office/roomRendering.ts`
- New or existing webview tests under `webview-ui/test/`

## Implementation Scope

- Add room boundary draw instructions or a small renderer helper for valid `projectRooms`.
- Render subtle pixel-styled room boundaries after floor tiles and before furniture/characters.
- Render safe doorplate labels for project/public/rest/meeting/unassigned rooms.
- Truncate or abbreviate labels so they fit inside room bounds.
- Ensure doorplates never display raw absolute paths, transcript paths, prompts, or tool output.
- Handle invalid or malformed room records by skipping them safely.
- Keep labels readable at normal zoom, and hide/abbreviate if low zoom becomes too cramped.
- Avoid covering agents, bubbles, delegation markers, seat indicators, and editor controls where
  practical.

## Out Of Scope

- Auto room creation.
- Room editor selection/resize/rename support.
- Changing seating rules.
- Provider discovery changes.
- Handoff/Work Queue/Usage/Timeline changes.
- Team/Lab Mode or shared rooms.

## Required Tests

Add focused tests covering:

- room label sanitization/truncation does not leak absolute paths;
- valid rooms produce bounded draw instructions;
- malformed rooms are skipped without crashing;
- public/rest/meeting/unassigned labels are safe;
- doorplate placement stays inside or near room bounds;
- low-zoom behavior is deterministic if implemented;
- existing renderer behavior still works when `projectRooms` is missing.

If canvas pixel tests are too brittle, add tests around a pure room rendering model and keep the
actual canvas call path thin.

## Acceptance Criteria

- Project rooms are visually legible on the office canvas.
- Doorplates show safe short labels only.
- Existing no-room layouts render unchanged.
- Room overlays do not make agents, bubbles, or editor controls unusable.
- All behavior is covered by focused model/renderer tests.

## Report Path

Write:

`docs/roadmap/supervision/reports/W18-C-doorplates-room-boundaries-report.md`

The report must include files changed, visual behavior, privacy decisions, tests added, validation
results with counts, and manual visual QA gaps.

## Commit Instruction

Commit on the W18-C branch as a single commit.

Suggested commit message:

`feat: render project room boundaries`
