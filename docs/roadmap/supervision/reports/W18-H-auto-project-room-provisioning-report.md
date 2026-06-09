# W18-H Auto Project Room Provisioning Report

## Summary

W18-H adds automatic, lobby-connected project room provisioning for visible top-level Codex and Claude agents. When the Office webview has a loaded layout, loaded furniture assets, and visible top-level agents with strong project identity, it coalesces provisioning work and creates missing project rooms through the existing layout mutation/save path.

Branch: `product/w18-h-auto-project-room-provisioning`

Base commit: `3d1a172 Merge W18-G: project rooms installed live QA`

Final commit hash: recorded by git after this report is committed; see final executor response.

Supervisor follow-up after user review: the first auto-generated rooms worked, but the default room
looked too sparse compared with the existing hand-built workroom. The generated room template now
prefers the existing lower-workroom style when assets are available: a larger room with a
`TABLE_FRONT` four-computer work table, `PC_SIDE`/`PC_SIDE:left` pairs, and
`WOODEN_CHAIR_SIDE`/`WOODEN_CHAIR_SIDE:left` seating.

## Files Changed

- `webview-ui/src/App.tsx`
- `webview-ui/src/constants.ts`
- `webview-ui/src/hooks/useEditorActions.ts`
- `webview-ui/src/office/projectRoomGeneration.ts`
- `webview-ui/test/project-room-generation.test.ts`
- `webview-ui/test/seating-invariants.test.ts`

## Provisioning Trigger Design

- `App.tsx` now watches the loaded layout/assets state and the visible top-level agent identity set.
- Provisioning is debounced with `PROJECT_ROOM_AUTO_PROVISION_DEBOUNCE_MS`.
- The trigger runs after layout and furniture assets are ready, and after agent state changes such as restored, adopted, refreshed, or newly created agents.
- The trigger passes runtime metadata for Codex and Claude agents into the room generation path.
- Provisioning is skipped while the layout editor has unsaved changes, so automatic generation does not overwrite active manual layout edits.
- The manual `Layout > Rooms > Auto rooms` behavior remains available as the repair/backfill path.

## Identity And Duplicate Prevention

- Project identity is derived from strong metadata in this order:
  - `projectDir`
  - `projectName`
  - `folderName`
- Unknown or weak identities such as `unknown`, `unknown project`, and `untitled` are ignored.
- Hidden, archived, killed, removed, and subagent entries are excluded from auto provisioning.
- Existing project room metadata for a normalized project key prevents duplicate generation.
- Multiple agents from the same project coalesce to one room.
- Repeated provisioning passes do not create duplicate rooms.
- Generated room ids are stable and based on normalized project keys.

## Lobby/Core Placement Design

- The placement model treats existing non-project office space as the lobby/public core.
- If public/rest/meeting/unassigned room metadata exists, that room metadata can anchor the core.
- If no explicit lobby room exists, the core is derived from the occupied/walkable non-project layout bounds.
- Candidate room positions are generated deterministically around the core, preferring below, right, left, then above, with outward rings as needed.
- New project rooms avoid existing room bounds, existing furniture, and non-void occupied areas.
- When a room must extend outside the current layout footprint, the layout expands within `MAX_COLS` and `MAX_ROWS`.
- A simple walkable floor corridor is painted from the lobby/core toward the new room so agents are not trapped in isolated rooms.
- If no candidate fits, generation returns a safe overflow result and leaves the layout valid.

## Generated Room Contents

Generated project rooms include:

- walkable floor tiles;
- safe `projectRooms` metadata with stable id, normalized project key, display name, provider ids, source, and timestamps;
- a default collaborative workroom template when assets are available:
  - `TABLE_FRONT`;
  - four side-facing PCs;
  - four side-facing wooden work chairs;
- fallback to one practical workstation using a real desk/table, a matching electronics item, and a work chair when collaborative assets are unavailable;
- one rest seat when room size permits.

The W18-G workstation regression remains protected:

- generation prefers `DESK_FRONT + PC_FRONT_OFF` when available;
- electronics orientation is matched to the workstation orientation;
- `COFFEE_TABLE + PC_BACK` is not used when a real desk/work PC combination exists.
- generated collaborative rooms now preserve the current office's lower work-table style and produce
  four valid workstation seats.

## Persistence Behavior

- Auto provisioning mutates the webview Office layout through the same runtime layout rebuild and `saveLayout` path used by normal layout operations.
- The extension persists the resulting layout to `~/.pixel-agents-multi/layout.json`.
- No repo files, VS Code workspace storage databases, or external artifacts are written by the product feature.
- Auto-created rooms survive reload because they are normal persisted layout metadata and furniture.
- Rooms are never auto-deleted.

## Seating Truthfulness

W18-B/W18-CDE/W18-G seating invariants remain intact:

- active top-level agents prefer valid workstation seats in their own project room;
- active agents do not type in rest seats;
- active agents do not type in empty air;
- idle agents can use project-local rest seats;
- duplicate seat ownership is still repaired deterministically;
- subagents remain near their parent and do not claim normal top-level room seats;
- delegating supervisors continue to use valid workstation seats.

## Tests Added

Added/expanded webview tests cover:

- Codex and Claude project identity provisioning;
- one room for multiple same-project agents;
- repeated provisioning without duplicates;
- existing room prevents generation;
- hidden, archived, killed, subagent, and weak unknown identities are skipped;
- serialization/normalization persistence of generated rooms;
- deterministic ordering by project key;
- lobby/core walkable connection;
- no overlap with existing rooms and furniture;
- `MAX_COLS`/`MAX_ROWS` overflow safety;
- stable non-overlapping rooms for multiple projects;
- real workstation selection and matching electronics orientation;
- collaborative four-computer default workroom generation;
- generated rest seats;
- active/idle seating behavior after generated rooms;
- no typing in generated rest seats;
- no top-level `TYPE` without a valid work seat;
- subagent and refresh/randomize regression behavior.

## Validation Results

Automated validation:

- `cd webview-ui; node --import tsx/esm --test test/project-room-generation.test.ts test/seating-invariants.test.ts`
  - Passed: 45 tests
- `npm run build`
  - Passed
- `npm run test:webview`
  - Passed: 223 tests after supervisor collaborative-room follow-up
- `npm run test:server`
  - Passed: 284 tests
- `npm run verify:installed`
  - Passed: `raychen.pixel-agents-multi@1.3.0`
- `git diff --check`
  - Passed

Package/install validation:

- `npx vsce package`
  - Passed
  - VSIX: `pixel-agents-multi-1.3.0.vsix`
  - Contents summary from package output after supervisor collaborative-room follow-up: 188 files, approximately 730.58 KB
- `code --install-extension pixel-agents-multi-1.3.0.vsix --force`
  - Passed
- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"`
  - Passed: only `raychen.pixel-agents-multi@1.3.0` matched

## Installed/Live QA

Installed VS Code UI QA was performed with Computer Use against the installed `raychen.pixel-agents-multi@1.3.0` extension.

Observed results:

- Pixel Agents Multi Office loaded with existing project rooms and normal agents.
- Agents page did not show stale Claude launch smoke agents named like `You are executing a Pixel Agents repo-ce...`.
- A temporary no-project-room layout was created from the user layout for controlled QA:
  - `projectRooms` metadata was removed;
  - generated `project-*` furniture was removed;
  - the previous generated bottom-room area was cleared to `VOID`;
  - a temporary backup was written to `C:\Users\User\AppData\Local\Temp\w18-h-layout-pre-temp-auto-test-20260609-094746.json`.
- After VS Code reload, the installed webview automatically generated two project rooms without pressing `Auto rooms`:
  - `animfy_gs1`
  - `pixel-agents-multi`
- The generated rooms were connected to the main office/lobby by walkable floor corridors.
- The generated room doorplates were visible at normal zoom and more legible after zooming out.
- Generated workstation content was visible: desk, matching PC/electronics, work chair, and rest seat.
- Reload preserved generated rooms.
- The temporary user layout was restored from the backup after QA and VS Code was reloaded.

Screenshot evidence:

- Computer Use screenshots were inspected in-session.
- No screenshot files were saved to the repository.

## Remaining Risks And Follow-Up

- No Settings toggle was added for disabling auto room creation. A future W18 follow-up can add `Auto-create project rooms` if supervisors want explicit control.
- The conservative placement model only creates new rooms in void/expanded space. It intentionally avoids reusing existing walkable floor areas to prevent accidental overwrite.
- Doorplate readability at very low zoom remains acceptable but small. W18 room rendering polish can further improve abbreviation/hide thresholds.
- The live QA used existing visible local agents from two projects. Additional manual QA with freshly launched agents in a brand-new project folder is still useful before a broader release.
