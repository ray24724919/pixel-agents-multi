# Project Rooms Roadmap

Date: 2026-06-08

## Product Objective

Project Rooms turns the pixel office from one shared seating pool into a project-aware workspace.
Each project gets a visible room or work area with a doorplate, and agents for that project work,
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
after the W17 handoff/work-queue simplification, because Work Queue is the current operational
complexity hotspot. It should happen before Team/Lab Mode, because team collaboration needs a clear
project-space model before multiple people share state.

Integrated priority order:

1. Supervisor Workflow simplification.
   W17-A/B/C make Handoff Library and Work Queue easier to understand and operate.
2. Personal Local Cockpit / Office Experience.
   Project Rooms makes the office project-aware and keeps agent placement truthful.
3. Usage Intelligence productization.
   Usage views can then use project rooms as a visual project context.
4. Repo-centered Collaboration.
   Handoffs, work packages, reports, branches, commits, and PRs become the shared project record.
5. Team / Lab Mode.
   After local project state is reliable, 3-5 people can opt into a shared lab view.

## Mental Model

The office remains one canvas, but project rooms create scoped areas within it.

- Project Room: a rectangular or named area assigned to a project key.
- Doorplate: visible label showing the short project name.
- Work seats: workstation seats inside the room.
- Rest seats: room-local rest seats when available, otherwise shared public rest zones.
- Public zones: shared meeting/rest/walkway areas that are not owned by one project.

This avoids a risky first implementation where the app has to generate and persist multiple
independent maps. The first version should keep one `OfficeLayout` and add room metadata.

## Core Rules

1. A top-level agent is assigned to a project room from its project identity:
   `projectDir`, `projectName`, `folderName`, or a normalized fallback key.
2. Active agents prefer valid workstation seats inside their project room.
3. Idle agents prefer rest seats inside their project room.
4. If no room-local rest seat exists, idle agents may use public rest/neutral zones.
5. Sub-agents and teammate agents inherit the parent or lead project room.
6. Refresh/randomize redistributes agents within their project room first.
7. A project without a room uses a safe fallback room or an unassigned project area.
8. Room assignment must not allow agents to type in rest zones or stand on chairs.

## Proposed Data Model

Keep the initial model small and local to the webview office layer.

```ts
interface ProjectRoom {
  id: string;
  projectKey: string;
  projectName: string;
  projectDirHash?: string;
  col: number;
  row: number;
  width: number;
  height: number;
  kind: 'project' | 'public' | 'unassigned';
}

interface OfficeLayout {
  // existing fields...
  projectRooms?: ProjectRoom[];
}
```

Suggested project key priority:

1. Normalized repo/workspace path when available.
2. Project name plus provider-safe hash when path is hidden.
3. Folder name fallback.
4. `unknown-project`.

## Implementation Sequence

### W18-A - Project Rooms Product And Technical Spec

Create the detailed implementation spec.

Deliverables:

- Define project key normalization.
- Define room metadata and migration behavior.
- Define room assignment priority for top-level agents, sub-agents, and team members.
- Define fallback behavior for missing rooms and insufficient seats.
- Define tests required for W18-B/C/D.
- No production behavior changes.

### W18-B - Room-Aware Seating Model

Make seating respect project rooms without changing the visual map much.

Deliverables:

- Add room membership helpers for seats and tiles.
- Active agents choose work seats in their own project room first.
- Idle agents choose room-local rest seats first, then public rest seats.
- Refresh/randomize stays room-scoped.
- Add tests for multi-project agents not stacking or crossing rooms.
- Keep old behavior as fallback when no rooms exist.

### W18-C - Doorplates And Room Boundaries

Render the project rooms in the office.

Deliverables:

- Draw simple room boundaries or subtle floor bands.
- Draw doorplates with short project names.
- Keep labels readable at current zoom levels.
- Avoid covering agents, bubbles, or editor controls.
- Add focused canvas/model tests where practical.

### W18-D - Auto Room Creation For New Projects

When a new project appears, create a practical default room.

Deliverables:

- Detect projects with agents but no room.
- Append or allocate a default room with desks, chairs, computers, and a doorplate.
- Keep layout size within `MAX_COLS` and `MAX_ROWS`.
- If space is exhausted, use an unassigned overflow room and report it in Debug/Agent Center.
- Persist generated rooms through layout persistence.

### W18-E - Editor Support

Let the user manage project rooms deliberately.

Deliverables:

- Select a room boundary.
- Rename/assign project room.
- Mark a room as public/rest/meeting/unassigned.
- Optional room color or doorplate style.
- Export/import includes room metadata.

## Risks And Guardrails

- Do not break existing layouts. Missing `projectRooms` must behave like today's office.
- Do not over-generate rooms before the user understands the feature.
- Do not put full local paths on visible doorplates.
- Do not let room logic override workstation truthfulness.
- Do not block agents from working if room metadata is missing or stale.
- Keep Team/Lab Mode separate. Project Rooms is local visual organization, not cloud sharing.

## Success Criteria

- With two or more projects, agents visually cluster by project.
- Refresh does not stack agents across unrelated projects.
- Active agents still use real workstation seats.
- Idle agents still avoid workstations unless no other safe option exists.
- Doorplates make project identity visible without turning the office into a dense dashboard.
- The model can later support Team/Lab project maps without exposing raw transcripts or private
  paths.
