# Project Rooms Roadmap

Date: 2026-06-08

Canonical spec: `docs/roadmap/product/project-rooms-spec.md`

## Product Objective

Project Rooms turns the pixel office from one shared seating pool into a project-aware workspace.
Each project can get a visible room or work area with a doorplate, and agents for that project work,
rest, refresh, and regroup inside that room whenever possible.

The goal is not to make a decorative map first. The goal is to make multi-project supervision
legible:

- Which project is this agent working on?
- Why is this agent sitting here?
- Are agents from different projects mixing by accident?
- Can a new project appear without stacking agents on existing seats?
- Can the future Team/Lab view reuse the same project-space model?

## Position In The Roadmap

Project Rooms belongs inside the personal local cockpit and office experience. It should happen
after the W17 handoff/work-queue simplification, because Work Queue was the current operational
complexity hotspot. It should happen before Team/Lab Mode, because team collaboration needs a clear
project-space model before multiple people share state.

Integrated priority order:

1. Supervisor Workflow simplification.
   W17-A/B/C made Handoff Library and Work Queue easier to understand and operate.
2. Personal Local Cockpit / Office Experience.
   Project Rooms makes the office project-aware and keeps agent placement truthful.
3. Usage Intelligence productization.
   Usage views can then use project rooms as a visual project context.
4. Repo-centered Collaboration.
   Handoffs, work packages, reports, branches, commits, and PRs remain the shared project record.
5. Team / Lab Mode.
   After local project state is reliable, 3-5 people can opt into a shared lab view.

## Mental Model

The office remains one canvas, but project rooms create scoped areas within it.

- Project Room: a rectangular or named area assigned to a project key.
- Doorplate: visible label showing a safe short project name.
- Work seats: workstation seats inside the room.
- Rest seats: room-local rest seats when available, otherwise shared public rest zones.
- Public zones: shared meeting/rest/walkway areas that are not owned by one project.
- Unassigned area: fallback for unknown or stale project metadata.

This avoids a risky first implementation where the app has to generate and persist multiple
independent maps. The first version keeps one `OfficeLayout` and adds optional room metadata.

## Core Rules

1. A top-level agent is assigned to a project room from its project identity:
   `projectDir`, `projectName`, `folderName`, cwd hash, or a normalized fallback key.
2. Active agents prefer valid workstation seats inside their project room.
3. Idle agents prefer rest seats inside their project room.
4. If no room-local rest seat exists, idle agents may use public rest/neutral zones.
5. Sub-agents inherit the parent room context but do not claim top-level seats.
6. Teammate/background agents use their own project identity when available, or inherit lead context
   only when the link is explicit.
7. Refresh/randomize redistributes agents within their project room first.
8. A project without a room uses a safe unassigned/global fallback.
9. Room assignment must not allow agents to type in rest zones, type in empty air, or stand on
   chairs/furniture.

## Proposed Data Model

The canonical W18-A spec defines the full model. The short form is:

```ts
type ProjectRoomKind = 'project' | 'public' | 'rest' | 'meeting' | 'unassigned';

interface ProjectRoom {
  id: string;
  kind: ProjectRoomKind;
  bounds: { col: number; row: number; width: number; height: number };
  project?: {
    key: string;
    displayName: string;
    source: 'projectDir' | 'projectName' | 'folderName' | 'cwdHash' | 'unknown';
    providerIds?: string[];
    projectDirHash?: string;
  };
  label?: string;
  color?: ColorValue;
}

interface OfficeLayout {
  // existing fields...
  projectRooms?: ProjectRoom[];
}
```

`projectRooms` is optional. Existing layouts without it must continue to behave exactly like the
current office.

## Implementation Sequence

### W18-A - Project Rooms Product And Technical Spec

Status: complete when `docs/roadmap/product/project-rooms-spec.md` exists.

Deliverables:

- Define product goals and local-only scope.
- Define project key normalization and provider differences.
- Define room metadata and migration behavior.
- Define room assignment priority for top-level agents, sub-agents, and team members.
- Define fallback behavior for missing rooms and insufficient seats.
- Define tests required for W18-B/C/D/E.
- No production behavior changes.

### W18-B - Room-Aware Seating Model

Make seating respect project rooms without changing the visual map much.

Deliverables:

- Add room membership helpers for tiles, seats, and agents.
- Add project identity helpers for office-side room assignment.
- Active agents choose valid workstation seats in their own project room first.
- Idle agents choose room-local rest seats first, then public/unassigned/global fallbacks.
- Refresh/randomize stays room-scoped before fallback.
- Preserve W2-G/W9-E seating truthfulness.
- Add pure tests for multi-project agents, stale room seats, insufficient room capacity, unknown
  projects, delegation supervisors, and sub-agents.
- Keep old behavior as fallback when no rooms exist.

### W18-C - Doorplates And Room Boundaries

Render project rooms in the office.

Deliverables:

- Add a render-model helper or renderer path for room boundaries.
- Draw simple room boundaries or subtle floor bands.
- Draw doorplates with safe short project names.
- Truncate labels and avoid raw absolute paths.
- Keep labels readable at current zoom levels.
- Avoid covering agents, bubbles, delegation markers, or editor controls.
- Add focused model/renderer tests where practical.

### W18-D - Auto Room Creation For New Projects

When a new project appears, create a practical default room.

Deliverables:

- Detect visible top-level projects with agents but no room.
- Append or allocate a default room with desks, chairs, computers, and a doorplate.
- Keep layout size within `MAX_COLS` and `MAX_ROWS`.
- Avoid duplicate rooms for the same normalized project key.
- If space is exhausted, use an unassigned overflow room and report it in a safe UI surface.
- Persist generated rooms through layout persistence.
- Do not create rooms for hidden/archived/killed agents or sub-agents.

### W18-E - Editor Support

Let the user manage project rooms deliberately.

Deliverables:

- Select a room boundary in a room editor mode.
- Rename doorplate label.
- Assign or clear project key.
- Mark a room as project/public/rest/meeting/unassigned.
- Resize/move room bounds with validation.
- Export/import includes room metadata.
- Deleting room metadata does not delete furniture by default.

## Risks And Guardrails

- Do not break existing layouts. Missing `projectRooms` must behave like today's office.
- Do not over-generate rooms before the user understands the feature.
- Do not put full local paths on visible doorplates.
- Do not let room logic override workstation truthfulness.
- Do not block agents from working if room metadata is missing or stale.
- Keep Team/Lab Mode separate. Project Rooms is local visual organization, not cloud sharing.
- Keep provider symmetry. Codex, Claude Code, and Claude Cowork should use the same room model once
  safe project identity is available.

## Success Criteria

- With two or more projects, agents visually cluster by project.
- Refresh does not stack agents across unrelated projects.
- Active agents still use real workstation seats.
- Idle agents still avoid workstations unless no other safe option exists.
- Doorplates make project identity visible without turning the office into a dense dashboard.
- Markdown/handoff/work-queue flows remain unchanged.
- The model can later support Team/Lab project maps without exposing raw transcripts or private
  paths.
