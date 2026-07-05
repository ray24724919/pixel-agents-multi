# W18-I Project Room Generator Polish Report

## Summary

W18-I polished automatic project room generation so new rooms look more like an extension of the shared office instead of plain floor rectangles. Generated project rooms now keep their collaborative workstation default while adding a lightweight room shell, an open doorway, and a walkable corridor back to the lobby/core.

The package also added a persisted "Auto-create Project Rooms" setting, defaulting to enabled, and aligned the manual Auto rooms path with automatic provisioning metadata so both routes derive project identity from the same safe agent/runtime fields.

## Visual Generation Changes

- Generated project rooms still prefer the W18-H collaborative layout: larger room, shared `TABLE_FRONT`, four workstation PCs/chairs when available, and a rest seat when space permits.
- Room interiors remain walkable floor.
- A perimeter shell is painted with wall tiles where safe.
- A single doorway is left open toward the lobby/corridor side.
- The generated corridor stays walkable and connects the doorway to the existing lobby/core.
- Furniture placement remains inside walkable room tiles and is not placed on wall or void tiles.
- W18-G's workstation preference remains intact: generated workstations still prefer real desk/table/electronics setups rather than coffee-table PC arrangements.

New shell constants were added in `webview-ui/src/constants.ts` instead of inline magic numbers.

## Auto-Create Setting

- Added globalState key: `pixel-agents-multi.autoCreateProjectRooms`.
- Default: `true`.
- The extension sends `autoCreateProjectRooms` in `settingsLoaded`.
- The webview handles `setAutoCreateProjectRooms` and stores it in React state.
- Settings modal now includes a checkbox labeled `Auto-create Project Rooms`.
- The setting gates only background automatic provisioning in `App.tsx`.
- Manual `Layout > Rooms > Auto rooms` still runs even when the setting is off.

## Manual Vs Automatic Metadata Consistency

Manual Auto rooms now uses the same provisioning shape as automatic provisioning where practical:

- visible agent ids from the current Office/canvas provider filter;
- hidden-agent state;
- runtime `projectDir`;
- runtime `projectName`;
- provider id;
- subagent filtering.

Extension/webview agent metadata messages now carry `projectName` alongside existing `projectDir`/`folderName` fields so generated rooms can use stable, display-safe project identity.

## Files Changed

- `src/constants.ts`
- `src/PixelAgentsViewProvider.ts`
- `src/agentManager.ts`
- `src/fileWatcher.ts`
- `server/__tests__/codexFollowon.test.ts`
- `webview-ui/src/App.tsx`
- `webview-ui/src/browserMock.ts`
- `webview-ui/src/components/SettingsModal.tsx`
- `webview-ui/src/constants.ts`
- `webview-ui/src/hooks/useEditorActions.ts`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `webview-ui/src/office/projectRoomGeneration.ts`
- `webview-ui/test/project-room-generation.test.ts`

## Tests Added / Updated

- Added project-room generation coverage for the shell, doorway, and corridor path.
- Extended collaborative room generation coverage to assert generated furniture remains on walkable floor, not wall or void tiles.
- Updated Codex metadata sync test expectations for the new safe `projectName` field.

## Validation

- `git diff --check` - passed.
- `cd webview-ui; node --import tsx/esm --test test/project-room-generation.test.ts test/seating-invariants.test.ts` - passed, 47 tests.
- `npm run test:webview` - passed, 224 tests.
- `npm run test:server` - passed after updating the expected `agentMetadata.projectName` field, 284 tests.
- `npm run build` - passed.

Combined webview + server count: 508 tests.

## Live QA

No live VS Code UI QA, Computer Use, VSIX packaging, or installed-extension testing was performed in this package, per W18-I constraints. No user-level `~/.pixel-agents-multi/layout.json` edits were made.

## Remaining Risks / Follow-Up

- Live visual QA is still recommended after merge to confirm the wall shell and doorway read cleanly at normal and low zoom.
- The generated room shell is intentionally minimal; future packages can refine wall sprites, doorplate placement, and corridor aesthetics after installed UI inspection.
- The auto-create setting is a simple global toggle. If supervisors later need workspace-specific behavior, that should be a separate product package.
