# W18-A Project Rooms Spec Report

## Summary

W18-A added the canonical Project Rooms product and technical specification package. This was a
docs-only package; no production source code, package files, lockfiles, or VSIX packaging behavior
were changed.

## Files Added Or Updated

Added:

- `docs/roadmap/product/project-rooms-spec.md`
- `docs/roadmap/supervision/work-packages/W18-B-room-aware-seating-model.md`
- `docs/roadmap/supervision/work-packages/W18-C-doorplates-room-boundaries.md`
- `docs/roadmap/supervision/work-packages/W18-D-auto-room-creation.md`
- `docs/roadmap/supervision/work-packages/W18-E-room-editor-support.md`
- `docs/roadmap/supervision/reports/W18-A-project-rooms-spec-report.md`

Updated:

- `docs/roadmap/product/project-rooms-roadmap.md`

## Key Product Decisions

- Project Rooms is local personal cockpit work, not Team/Lab Mode.
- The office remains one canvas and one `OfficeLayout`.
- Rooms are optional metadata on the layout via `OfficeLayout.projectRooms?`.
- Existing layouts without `projectRooms` must behave exactly like the current office.
- Room scoping filters candidate seats but does not redefine whether a seat is a valid work seat.
- Existing W2-G/W9-E seating truthfulness remains authoritative:
  - active top-level agents need real workstation seats to type;
  - idle agents release work seats;
  - sofas and coffee-table lounge seats remain rest seats;
  - stale and duplicate seat assignments are repaired.
- Doorplates must use safe short labels and must not render raw absolute paths.
- Unknown or weak project identity should fall back to an unassigned/global area instead of blocking
  visible agents.
- Project Rooms must happen before Team/Lab Mode so future shared views reuse a reliable local
  project-space model.

## Risk Boundaries

- No provider discovery, launch, adoption, handoff, Work Queue, Usage, Timeline, or backend behavior
  was changed.
- No package metadata or lockfiles were touched.
- No local VSIX was packaged or installed.
- Project Rooms is explicitly not cloud sync, team sharing, raw transcript surveillance, or
  multi-user presence.
- Full local paths are allowed as internal comparison inputs but not as canvas doorplate labels.

## Follow-On Packages Created

- W18-B: Room-Aware Seating Model.
  Recommended next package. It establishes room membership and seating rules before visuals or auto
  generation.
- W18-C: Doorplates And Room Boundaries.
  Adds safe visual rendering after room-aware seating is proven.
- W18-D: Auto Room Creation.
  Generates default project rooms only after model and rendering are stable.
- W18-E: Room Editor Support.
  Gives users deliberate control after model, visuals, and generation exist.

## Recommended Next Package

Run W18-B next:

`docs/roadmap/supervision/work-packages/W18-B-room-aware-seating-model.md`

Reason: room-aware seating must be correct before rendering doorplates or auto-generating furniture.
It is the lowest-risk functional slice and can be validated with pure webview model tests.

## Validation

- `git diff --check`
  - Passed.
- `npm run test:webview`
  - Passed: 174 tests.
- `npm run test:server`
  - Passed: 284 tests.
- `npm run build`
  - Passed.
  - Existing Vite warning: one webview chunk is larger than 500 kB after minification.

## Open Risks And Deferred Decisions

- Whether auto room creation should be automatic, setting-gated, or prompt-gated is deferred to
  W18-D.
- Whether public/rest/meeting rooms can overlap project rooms is deferred to W18-B/E.
- Whether generated rooms save immediately or wait for the next layout save is deferred to W18-D.
- Whether low-zoom doorplates hide or abbreviate is deferred to W18-C.
- Whether room labels should auto-update when project names change is deferred to W18-E.
