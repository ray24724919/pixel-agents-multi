# W18-G Project Rooms Installed Live QA Report

## Summary

W18-G performed installed VS Code UI QA for Project Rooms using the packaged
`raychen.pixel-agents-multi` extension. This was real VS Code webview/canvas inspection through
desktop automation against the installed extension, not source review only.

Supervisor follow-up after user review identified a generated-room workstation template bug: Auto
rooms could choose a coffee table as the work desk and pair it with a back-facing PC asset. The
follow-up fix now prefers a real front-oriented workstation desk and matching front/off electronics
for generated front-facing workstations.

## Branch And Commit

- Branch: `product/w18-g-project-rooms-installed-live-qa`
- Base commit: `2adb78a Merge W18-F: project rooms live QA report`
- Initial W18-G report commit: `c89a49d test: run project rooms installed live qa`
- Supervisor follow-up fix commit: recorded by the final W18-G supervisor commit on this branch.

## Files Changed

- `docs/roadmap/supervision/reports/W18-G-project-rooms-installed-live-qa-report.md`
- `webview-ui/src/office/projectRoomGeneration.ts`
- `webview-ui/test/project-room-generation.test.ts`

## Package / Install / Identity

- `npm run build`: passed.
- `npx vsce package`: passed.
  - VSIX: `pixel-agents-multi-1.3.0.vsix`
  - Initial package summary: 188 files, 728.65 KB.
  - Supervisor follow-up package summary after workstation orientation fix: 188 files, 728.82 KB.
- `code --install-extension pixel-agents-multi-1.3.0.vsix --force`: passed.
  - Re-run after supervisor follow-up fix: passed.
- `npm run verify:installed`: passed.
  - Installed extension verified: `raychen.pixel-agents-multi@1.3.0`.
  - Re-run after supervisor follow-up fix: passed.
- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"`:
  - Found `raychen.pixel-agents-multi@1.3.0`.
  - No public/old Pixel Agents extension was listed by this filter.

## Live QA Steps Performed

1. Reloaded the VS Code window with `Developer: Reload Window`.
2. Opened the installed Pixel Agents Multi panel.
3. Inspected Office and Agents views for stale Claude launch test agents.
4. Entered Layout mode and inspected room/zone overlays at normal zoom.
5. Opened the Rooms tool.
6. Created a temporary room metadata record on empty floor.
7. Edited room label, kind, project fields, and bounds through the Rooms form.
8. Opened the room kind dropdown and confirmed the available kinds: `project`, `public`, `rest`, `meeting`, `unassigned`.
9. Used Auto rooms with visible top-level agents from multiple projects.
10. Repeated Auto rooms to check duplicate prevention.
11. Saved layout and reloaded VS Code to verify `projectRooms` persistence.
12. Cleaned up W18-G disposable project-room artifacts from the user layout after persistence verification.
13. Reloaded VS Code again and confirmed the generated QA project rooms were removed.

## Stale Claude Launch Test Agent Result

Passed.

No stale long-name Claude launch test agents appeared in the Office view or Agents page. Specifically, agents named like `You are executing a Pixel Agents repo-ce...` were not visible after reload.

No direct edits were made to VS Code `workspaceStorage/state.vscdb`.

## Project Rooms Visual Observations

- Existing non-room layout content still looked normal after installed extension reload.
- Layout mode showed existing `WORK` / `REST` overlays clearly and without excess visual noise. These were zone/editor overlays, not Project Room metadata.
- After Auto rooms generated project rooms, room boundaries and labels were visible and readable.
- Doorplates for generated rooms such as `animfy_gs1` and `pixel-agents-multi` were readable at normal zoom.
- Low zoom remained acceptable: labels stayed legible enough and did not become severe clutter.
- Doorplates did not visibly cover agents, speech bubbles, status labels, or editor controls during the inspected states.

Evidence screenshots:

- `C:\Users\User\AppData\Local\Temp\w18-g-project-rooms-after-reload.png`
- `C:\Users\User\AppData\Local\Temp\w18-g-project-rooms-cleanup-after-reload.png`

## Rooms Editor Observations

- The Rooms tool was visible and usable in Layout mode.
- Controls did not appear clipped or overlapping at the inspected VS Code panel width.
- Creating a room on empty floor worked.
- Selecting the temporary room brought up the room metadata form without selecting furniture underneath.
- The room label, kind, project key/display name fields, and bounds controls were visible and usable.
- The room kind dropdown exposed all required values.
- The `Delete room` button was visible, but it was not clicked during this pass. Instead, disposable QA room metadata and generated furniture were cleaned up after the save/reload persistence check.

## Auto Rooms Observations

- Auto rooms generated rooms for real visible projects:
  - `animfy_gs1`
  - `pixel-agents-multi`
- Generated rooms included practical workstation furniture/seats, including desk/table, monitor/electronics, and work chair placement.
- Generated rest seating appeared where space permitted.
- Running Auto rooms a second time did not duplicate the generated project rooms.
- Save + VS Code reload preserved the generated `projectRooms` metadata and generated room content.

Supervisor follow-up note: after user review, the generated workstation template was found to be too
loose in source. With the real asset catalog, it could generate `COFFEE_TABLE + PC_BACK` as the work
setup. The source fix now makes generated rooms prefer `DESK_FRONT + PC_FRONT_OFF` when those assets
are available.

## Seating Truthfulness Observations

- Existing active top-level agents in the default office were visually seated at valid workstation areas.
- Generated project rooms provided valid workstation seats instead of rest-only seats.
- No active agent was observed typing in a rest seat.
- No active agent was observed typing in empty air.
- No agent was observed standing on chairs or furniture.
- No subagent was observed claiming a normal top-level project room seat.

Remaining limitation: this pass did not start a fresh task specifically to force every active/idle transition path. Seating truthfulness was checked through visible installed UI state and generated room structure, with the existing W18-B/CDE/F automated tests covering the deeper invariant model paths.

## Disposable Artifacts And Cleanup

Temporary QA artifacts created:

- Room metadata:
  - `QA Room`
  - `animfy_gs1`
  - `pixel-agents-multi`
- Generated Auto rooms furniture for:
  - `project-animfy-gs1-*`
  - `project-pixel-agents-multi-*`

Cleanup:

- Removed only W18-G disposable project-room metadata and generated furniture from `~/.pixel-agents-multi/layout.json`.
- Removed generated room floor areas and shrank trailing empty rows after cleanup.
- Reloaded VS Code and confirmed the visible office returned to a no-projectRooms layout.

Process note: the initial backup of the user layout was taken after Project Rooms had already been persisted by the live QA flow, so the backup was not a clean pre-QA copy. Cleanup therefore used targeted removal of W18-G-created room IDs and generated furniture UIDs. No VS Code workspace database was edited.

## Fixes Made

- Hardened generated-room workstation asset selection so Auto rooms prefers a real front-oriented
  desk over coffee/rest tables.
- Matched generated desk electronics to the selected desk orientation and preferred off/static
  electronics over animated/on variants.
- Added a focused regression test proving the generator does not pick `COFFEE_TABLE` or `PC_BACK`
  when `DESK_FRONT` and `PC_FRONT_OFF` are available.

## Validation

- `git diff --check`: passed.
- Focused `project-room-generation` test: 9 passed.
- `npm run test:webview`: 209 passed.
- `npm run test:server`: 284 passed.
- `npm run build`: passed.
- `npm run verify:installed`: passed.

Combined automated test count after supervisor follow-up fix: 493.

## Remaining Risks

- The Rooms editor `Delete room` button was visible but not explicitly clicked in this pass.
- Seating truthfulness was live-inspected visually, but no new active task was launched solely for this QA pass.
- The layout cleanup was targeted and successful visually, but the original pre-QA layout backup was contaminated by the persistence test timing.
- Narrow panel QA was limited to the available installed VS Code panel width and zoom checks.
