# Project Rooms Product And Technical Specification

Date: 2026-06-08

Status: W18-A canonical specification

## 1. Product Goal

Project Rooms makes the Pixel Agents office project-aware without turning the product into a team
server or a second workspace manager. The office remains one local canvas, but agents are visually
clustered into rooms that correspond to the projects they are working on.

The user story:

> As a solo supervisor running Codex, Claude Code, and Claude Cowork agents across multiple local
> projects, I want each project to have a visible room so I can tell which agents belong together,
> where active work is happening, and why an agent is sitting or resting in a particular area.

The product should answer these questions at a glance:

- Which project is each visible agent working on?
- Are multiple agents for the same project grouped together?
- Are active agents at credible workstations inside their project area?
- Are idle agents resting in an appropriate local or public area?
- Did a new project appear without stacking agents on existing chairs?
- Can future Team/Lab Mode reuse this project-space model without exposing private paths or raw
  transcript content?

## 2. Local Personal Cockpit, Not Team/Lab Mode

Project Rooms is part of the personal local cockpit. It is not Team/Lab Mode.

In scope:

- Local visual organization inside the existing Pixel Agents office.
- Per-project room metadata stored with the local office layout.
- Room-scoped seating, refresh, labels, and fallback behavior.
- Local-only project identity derived from existing safe agent metadata.
- A future-ready model that Team/Lab Mode can reuse later.

Out of scope for W18:

- Shared rooms across users.
- Cloud sync.
- Presence for other human teammates.
- Raw transcript surveillance.
- Cross-machine project maps.
- Permission or access control.
- Multi-user cursors, chat, or live collaboration.

The privacy stance is the same as the repo-centered handoff workflow: local-first, review-first, and
safe labels by default.

## 3. Room Mental Model

### One Canvas, Multiple Scoped Rooms

The office remains a single `OfficeLayout`. Project Rooms add metadata describing named rectangular
areas inside that one layout. Rendering, pathfinding, furniture placement, save/load, and camera
behavior continue to operate on a single tile grid.

This avoids the first-version complexity of multiple independent maps, per-room canvases, or hidden
layout switching.

### Project Rooms

A project room is a bounded area assigned to one project key. It can contain:

- workstation seats: chairs/benches facing a desk or table with electronics;
- room-local rest seats: sofas/chairs that are not valid workstations;
- walkable floor;
- optional walls, decor, meeting furniture, and doorplate label.

Agents whose project identity maps to that room prefer it for work, idle rest, and refresh.

### Public, Rest, Meeting, And Unassigned Areas

Rooms do not replace existing tile zones. Instead:

- `project`: project-owned work/rest area.
- `public`: shared lobby, walkways, rest, or meeting space.
- `rest`: a shared rest-only area, usually public.
- `meeting`: a shared meeting area for future coordination or team gathering behavior.
- `unassigned`: fallback area for agents whose project key has no room or whose room is stale.

The existing `zones?: Array<ZoneType | null>` tile metadata remains useful inside and outside rooms.
Rooms are coarse spatial ownership. Zones are tile-level intent.

### Doorplates

A doorplate is a compact label rendered at or near a room boundary. It should show a short safe
project label, not a raw absolute path.

Doorplates are for orientation, not navigation. They should not cover agents, speech bubbles,
delegation markers, or editor controls.

### Room-Scoped Work And Rest Seating

Room scoping filters candidate seats. It does not redefine whether a seat is a valid work seat.

Existing W2-G seating truth remains authoritative:

- A work seat must be a credible workstation.
- Sofas and coffee-table lounge seats remain rest seats.
- Top-level active agents must not type without a valid work seat.
- Idle agents should not occupy work seats.
- Duplicate and stale seat ownership is repaired.

Project Rooms add this preference order:

- active top-level agents prefer valid work seats inside their project room;
- idle top-level agents prefer rest seats inside their project room;
- idle fallback can use public rest seats;
- unknown projects use the unassigned room/fallback area.

## 4. Project Identity Model

Project identity should be stable enough for room assignment, but safe enough for UI labels.

### Inputs

Use metadata already carried through the extension and webview:

- `projectDir`: provider cwd, project directory, or transcript project directory.
- `projectName`: display project name when available.
- `folderName`: workspace folder name, especially for multi-root workspaces.
- `providerId`: `codex`, `claude`, or another future provider.
- session/thread identifiers when needed only for debugging or fallback.

### Canonical Key Fields

Proposed project metadata:

```ts
type ProjectIdentitySource = 'projectDir' | 'projectName' | 'folderName' | 'cwdHash' | 'unknown';

interface ProjectKeyMetadata {
  key: string;
  displayName: string;
  folderName?: string;
  providerIds: string[];
  source: ProjectIdentitySource;
  normalizedProjectDir?: string;
  cwdHash?: string;
  isUnknown: boolean;
}
```

### Key Priority

Use this priority when assigning a room:

1. `projectDir`, normalized as a path comparison key.
2. Provider cwd from Codex SQLite or Claude session metadata when `projectDir` is missing.
3. `projectName` plus a provider-safe hash if no path is available.
4. `folderName` plus provider id.
5. `unknown-project`.

`projectDir` and cwd equality must use the same Windows-safe comparison behavior added during W2-F:

- resolved absolute paths;
- Windows `\\?\C:\...` and `C:\...` treated as the same path;
- Windows case-insensitive comparison;
- POSIX behavior preserved.

### Display Name Priority

Doorplate and UI labels use:

1. explicit room label, if the user set one;
2. `projectName`;
3. `folderName`;
4. basename of normalized `projectDir`;
5. `Unknown project`.

Never render raw absolute paths on the doorplate. Longer labels should be truncated with an
ellipsis or abbreviated middle, and the full raw path should not appear in canvas text.

### Provider Differences

Codex:

- External threads can have cwd values from SQLite.
- Multiple threads can share one cwd and should map to the same project room.
- Archived Codex threads should not create rooms by themselves because they are not active visible
  agents.

Claude Code:

- Terminal-launched Claude uses the configured cwd and `~/.claude/projects` style transcript
  metadata when present.
- Claude CLI absence diagnostics should not create a fake agent or room.

Claude Cowork/Desktop:

- Sessions may come from `%APPDATA%\Claude\local-agent-mode-sessions`.
- cwd/project metadata may be weaker or absent.
- If cwd is absent, use safe session/project metadata labels and place agents in the unassigned room
  until a stronger project key appears.

Unknown fallback:

- If all identity signals are missing, use `unknown-project`.
- Unknown agents must remain visible and must not block normal seating or pathfinding.

## 5. Proposed TypeScript Data Model

Use literal unions and `as const` constants in implementation; do not introduce TypeScript `enum`.

```ts
type ProjectRoomKind = 'project' | 'public' | 'rest' | 'meeting' | 'unassigned';

interface ProjectRoomBounds {
  col: number;
  row: number;
  width: number;
  height: number;
}

interface ProjectRoomProjectKey {
  key: string;
  displayName: string;
  source: 'projectDir' | 'projectName' | 'folderName' | 'cwdHash' | 'unknown';
  providerIds?: string[];
  projectDirHash?: string;
}

interface ProjectRoom {
  id: string;
  kind: ProjectRoomKind;
  bounds: ProjectRoomBounds;
  project?: ProjectRoomProjectKey;
  label?: string;
  color?: ColorValue;
  createdAtMs?: number;
  updatedAtMs?: number;
}

interface OfficeLayout {
  version: 1;
  cols: number;
  rows: number;
  tiles: TileType[];
  furniture: PlacedFurniture[];
  tileColors?: Array<ColorValue | null>;
  zones?: Array<ZoneType | null>;
  projectRooms?: ProjectRoom[];
  layoutRevision?: number;
}
```

### Why Optional `OfficeLayout.projectRooms?`

`projectRooms` must be optional for backward compatibility. Existing saved layouts, bundled
defaults, and imported layouts without rooms should continue to behave exactly as they do today.

When `projectRooms` is missing or empty:

- seating uses the current global logic;
- `inferTileZone` still falls back to zone paint/default split;
- renderer does not draw room boundaries or doorplates;
- editor does not show room controls unless room mode is enabled;
- agents still work and rest according to W2-G/W9-E invariants.

### Migration Behavior

`deserializeLayout` / `migrateLayoutColors` should preserve unknown future-safe fields only if the
implementation chooses to do so deliberately. For W18, migration should:

- validate room arrays when present;
- drop malformed room records rather than failing the whole layout;
- clamp room bounds to layout size;
- preserve existing `zones`, `tileColors`, and furniture;
- add `projectRooms: []` only if useful for normalized internal state, not required for saved JSON.

### Data Ownership

Room metadata belongs to the webview office layout model. It should not live in provider-specific
backend state. The backend can provide project identity metadata, but the office decides how to
place and render rooms.

## 6. Room Assignment Rules

### Top-Level Agents

Top-level agents map to one room:

1. Build `ProjectKeyMetadata` from agent identity.
2. Find a `project` room with matching `project.key`.
3. If none exists, use `unassigned` room if present.
4. If no unassigned room exists, use global fallback behavior.

Room assignment should be recalculated on:

- `existingAgents` restore;
- new `agentCreated`;
- provider metadata updates;
- layout import/rebuild;
- room editor save;
- auto-room creation.

### Sub-Agents

Sub-agents are not full terminal-backed top-level office agents. They inherit the parent agent's
room context for placement and rendering decisions, but W18 should preserve current behavior:

- spawn near the parent when possible;
- do not claim normal top-level seats;
- do not create project rooms;
- do not force them into permanent desks.

If parent room data exists, near-parent placement should prefer walkable tiles inside the same room,
but should fall back to the current nearest-walkable behavior.

### Teammate And Background Agents

Terminal-backed teammate/background agents are top-level agents for seating purposes. They should
map by their own project identity when available, or inherit the lead/supervisor project room when
team metadata clearly links them and project identity is missing.

Do not infer project identity from raw transcript text.

### Hidden, Archived, And Killed Agents

Hidden, archived, and killed agents should not reserve room seats. They also should not auto-create
rooms on their own.

Existing timeline/handoff history remains independent of room assignment. Historical events can
still reference project names safely, but room creation is based on visible/live office agents.

### Restored Persisted Agents

Persisted `seatId` remains a preference, not truth. On restore:

- recompute project identity;
- validate the preferred seat against room and mode;
- active agents need valid work seats;
- idle agents need valid rest seats;
- stale/moved room bounds repair the assignment.

This extends the W9-E active workseat restore fix rather than replacing it.

## 7. Seating Rules

### Active Agents

Active top-level agents:

1. Prefer valid workstation seats inside their assigned project room.
2. If no room-local work seat exists, use valid workstation seats in an unassigned room.
3. If no unassigned work seat exists, use global valid workstation fallback.
4. If no work seat exists or is reachable, stay active logically but visually non-typing/non-seated.

They must never type in rest seats or type in place at empty air.

### Idle Agents

Idle top-level agents:

1. Release work seats.
2. Prefer rest seats inside their assigned project room.
3. Then prefer public/rest room seats.
4. Then prefer unassigned/rest seats.
5. Then use existing idle walkable tile fallback.

Idle agents should not stand on chairs/furniture. Current `nudgeInactiveStandingOffSeats` behavior
should remain compatible with room scoping.

### Waiting Or Delegating Agents

Agents with active delegation are treated as supervising/working per W7-C. They should follow the
active work-seat rule in their project room.

Waiting permission/user states can remain near a workstation because the user may need to inspect
or act on that agent. They should still require a valid work seat if they are visually typing or
supervising.

### Public Rest Fallback

Public rest areas are shared. They should not be assigned to a project key. If a project room has no
rest seats, idle agents can rest in public areas.

### Unassigned Room Fallback

The unassigned room is the fallback for:

- unknown projects;
- projects whose room was deleted;
- auto-room overflow;
- provider sessions with insufficient metadata.

It should be visibly labeled in a safe way, e.g. `Unassigned`, not with raw paths.

## 8. Refresh And Randomize Behavior

`randomizeTopLevelSeats()` currently randomizes across all valid seats. W18-B should make this
room-aware:

1. Partition top-level agents by assigned room id.
2. For each room, randomize active agents across room-local work seats.
3. Randomize idle agents across room-local rest seats.
4. If a room has insufficient seats, apply the fallback order from the seating rules.
5. Avoid duplicate seat ownership globally.

The behavior should be deterministic enough for tests:

- isolate candidate sorting from randomness;
- allow tests to override `Math.random` as current tests do;
- sort agent ids and seat ids before selecting fallback candidates;
- repair duplicates after randomize.

Refresh must not stack agents, move active agents to rest seats, or move idle agents to work seats
just because the room has insufficient capacity.

## 9. Visual Rendering Plan

### Room Boundaries

Render subtle room boundaries after floor tiles and before furniture/characters. Boundaries should:

- be visible at common zoom levels;
- avoid noisy full-grid overlays;
- not hide wall sprites or furniture;
- not imply blocked tiles unless the layout actually blocks them.

Suggested first visual:

- thin pixel border around room bounds;
- translucent floor tint or corner marks;
- stronger highlight only on hover/selection/editor mode.

### Doorplates

Doorplates should render near the top edge or door side of each room:

- label text from safe display name;
- max character limit, e.g. 18 to 24 visible characters;
- no absolute paths;
- no raw transcript paths;
- no provider credentials or environment data;
- optional provider/project badge later, but not required in W18-C.

Doorplate collision priority:

1. Avoid editor toolbar/controls.
2. Avoid bubbles, delegation markers, and selected character overlays.
3. Avoid covering active agents when possible.
4. If unavoidable, render labels only in editor/hover mode or with a compact clipped label.

### Zoom And Readability

At low zoom:

- boundaries remain visible;
- labels can collapse to abbreviated names or hide below a threshold;
- hover/selection can reveal full safe label in a tooltip/overlay.

At high zoom:

- labels should stay pixel-styled;
- text must not overlap adjacent room labels;
- do not scale font size by viewport width.

### Editor Interactions

Room boundaries in editor mode can be selectable. Selection outline should not conflict with
furniture selection. If needed, room selection can require a dedicated room tool in W18-E.

## 10. Auto Room Creation Plan

### When To Generate

Auto-create rooms when:

- one or more visible top-level agents have a project key with no matching room;
- the layout has room metadata enabled or the user accepts generation;
- an unassigned fallback alone is no longer sufficient to keep multi-project work legible.

Do not auto-create rooms for:

- hidden/archived/killed agents;
- sub-agents;
- historical timeline-only projects;
- malformed provider metadata;
- CLI missing diagnostics that did not create an agent.

### Where To Place Rooms

Preferred placement strategy:

1. Reuse empty visible floor areas if they can fit the default room template.
2. Extend the layout to the right or downward within `MAX_COLS` and `MAX_ROWS`.
3. Append rooms in deterministic order by project key.
4. Keep public/unassigned area accessible.

If no space remains:

- use the unassigned room/fallback seating;
- emit a debug/operator signal in a safe UI surface;
- do not block agent creation or active status.

### Default Room Contents

Default generated project rooms should include:

- at least one valid workstation: desk/table + electronics + chair facing/adjacent correctly;
- at least one room-local rest seat when space permits;
- walkable entry path;
- simple doorplate;
- optional neutral floor tint.

The default template should be small enough to fit multiple projects:

- recommended first size: 8 to 10 columns by 7 to 8 rows;
- must respect `MAX_COLS` and `MAX_ROWS`;
- must not place furniture on walls/void unless the catalog entry supports it.

### Persistence

Generated rooms and generated furniture are persisted through existing layout save flows. The user
must be able to export/import them with the layout.

Auto-created room metadata should not be regenerated repeatedly after save. Use stable room ids and
project keys.

## 11. Editor Support Plan

W18-E should add deliberate room editing, not a broad layout editor redesign.

Minimum editor support:

- select room boundary;
- rename doorplate label;
- assign or clear project key;
- mark room kind: project, public, rest, meeting, unassigned;
- resize/move room bounds with validation;
- delete room metadata without deleting furniture by default;
- export/import room metadata with layout JSON.

Useful later controls:

- room color/tint;
- "create room for current project";
- "move selected furniture into room";
- "repair seats in this room";
- "show agents assigned to this room".

Editor validation:

- no negative width/height;
- clamp to layout bounds;
- warn on overlapping project rooms but allow public/rest overlap only if deliberately supported;
- do not allow full raw path labels;
- keep agents working if a room is invalid or deleted.

## 12. Privacy And Safety

Project Rooms must not leak private details into the canvas.

Rules:

- Do not put absolute local paths on doorplates.
- Do not infer labels from raw prompts, raw tool output, or transcript text.
- Do not expose provider credentials or environment variables.
- Do not sync room metadata to cloud in W18.
- Missing/stale room metadata must not block agents from appearing.
- Debug-only views may show more metadata, but should still prefer redacted paths.

Doorplate labels should be safe by default. If full paths are ever shown, they belong in an
explicit debug/details surface, not in the office canvas.

## 13. Test Matrix For W18-B/C/D/E

### W18-B Room-Aware Seating Model

Add or extend pure webview tests, likely in `webview-ui/test/seating-invariants.test.ts`:

- active agents use valid work seats inside their own project room first;
- agents from two projects do not claim each other's room-local work seats when each room has
  capacity;
- idle agents prefer rest seats inside their own project room;
- idle agents fall back to public rest seats when their room has no rest seats;
- unknown project agents use the unassigned room/fallback;
- restored persisted seat outside the agent's room is repaired;
- duplicate seat ownership across rooms is repaired deterministically;
- no work seat in assigned room or fallback means no top-level `TYPE` in place;
- sub-agents stay near parent and do not claim top-level room seats;
- delegation-driven supervisors remain in project-room work seats.

### W18-C Doorplates And Room Boundaries

Add pure renderer/model tests where practical:

- room label truncation never returns raw absolute paths;
- room boundary draw model is generated for each valid room;
- invalid/malformed rooms are skipped without crashing;
- public/rest/unassigned room labels are safe;
- doorplate placement remains inside or near room bounds;
- hidden/low-zoom label behavior is deterministic if implemented.

If canvas pixel tests are not practical, add a render-model helper that produces bounded draw
instructions and test that helper.

### W18-D Auto Room Creation

Add pure model tests:

- new project with no room creates one room and one valid workstation template;
- repeated scans do not duplicate rooms for the same project key;
- generated room ids are stable;
- layout expansion respects `MAX_COLS` and `MAX_ROWS`;
- overflow uses unassigned fallback when no space remains;
- hidden/archived/killed agents do not trigger room creation;
- Codex multiple threads with same cwd create one project room;
- Claude/Cowork missing cwd uses unknown/unassigned fallback.

### W18-E Room Editor Support

Add editor/model tests:

- selecting a room does not select furniture underneath unless room tool is active;
- renaming updates only room metadata;
- assigning a project key validates safe fields;
- changing room kind updates seating preferences after repair;
- deleting room metadata does not delete furniture by default;
- export/import round-trips `projectRooms`;
- malformed imported room records are dropped or repaired without breaking layout load.

## 14. Rollout Order

Recommended W18 order:

1. W18-B: room-aware seating model.
   Establish room membership, assignment, and fallback rules before rendering labels.
2. W18-C: doorplates and room boundaries.
   Make existing/manual rooms visible without auto-generating layout changes.
3. W18-D: auto room creation.
   Generate default rooms only after seating/rendering behavior is proven.
4. W18-E: room editor support.
   Give the user explicit control after the model and visuals have settled.

This order keeps risk low. It avoids generating furniture before room semantics are tested, and it
keeps Team/Lab Mode out of scope until the local personal cockpit is reliable.

## 15. Acceptance Criteria

Project Rooms is acceptable when:

- existing layouts with no `projectRooms` behave exactly like the current office;
- with two or more projects, agents cluster by project room when room metadata exists;
- active agents use real workstation seats inside their project room when available;
- idle agents use room-local rest seats or public rest fallback;
- refresh/randomize is room-aware and does not stack agents;
- stale or invalid room metadata is repaired or ignored safely;
- doorplates show safe project labels without raw absolute paths;
- auto-created rooms do not exceed layout bounds;
- missing project metadata sends agents to unassigned/global fallback instead of failing;
- sub-agents remain near parents and do not become full room-seated top-level agents;
- all behavior is covered by pure model tests before installed visual QA.

## 16. Open Decisions For Implementation

The implementation packages should decide these with tests:

- Whether room boundaries can overlap public/rest rooms or must be exclusive.
- Whether auto room creation is always on, setting-gated, or prompt-gated.
- Whether generated furniture should be saved immediately or only after the next layout save.
- Whether room labels should use `label` only, or auto-update when project metadata changes.
- Whether `projectRooms` should be normalized to an empty array on every layout save.
- Whether low-zoom doorplates hide or abbreviate.

Default recommendation: choose the least surprising behavior that preserves current layouts and
never blocks agent visibility.
