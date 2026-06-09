# W18-F Project Rooms Live QA Polish Report

## Summary

W18-F validated the newly merged Project Rooms MVP with source review, local packaging,
installation, and automated test/build checks. No product bug was confirmed during this pass, so no
source code changes were made.

Installed/live VS Code canvas QA was not performed because this Codex run did not have a reliable
desktop automation tool available for inspecting or clicking the VS Code webview. I did not use
coordinate scripts, SendKeys, or direct edits to VS Code user storage as a substitute.

## Branch And Commit

- Branch: `product/w18-f-project-rooms-live-qa-polish`
- Base commit: `99c33f0 Merge W18-CDE: project rooms MVP`
- Package commit: `aae2a8b test: validate project rooms live qa`
- Supervisor report finalization commit: documents the actual package hash and repeats the installed
  extension identity check.

## Files Changed

- `docs/roadmap/supervision/reports/W18-F-project-rooms-live-qa-polish-report.md`

No product source files were changed.

## Files Reviewed

- `AGENTS.md`
- `docs/roadmap/product/project-rooms-spec.md`
- `docs/roadmap/product/project-rooms-roadmap.md`
- `docs/roadmap/supervision/reports/W18-A-project-rooms-spec-report.md`
- `docs/roadmap/supervision/reports/W18-B-room-aware-seating-model-report.md`
- `docs/roadmap/supervision/reports/W18-CDE-project-rooms-mvp-report.md`
- `webview-ui/src/office/projectRooms.ts`
- `webview-ui/src/office/roomRendering.ts`
- `webview-ui/src/office/projectRoomGeneration.ts`
- `webview-ui/src/office/editor/roomEditorActions.ts`
- `webview-ui/src/office/engine/renderer.ts`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- `webview-ui/src/hooks/useExtensionMessages.ts`
- `src/agentManager.ts`
- `src/PixelAgentsViewProvider.ts`
- `src/fileWatcher.ts`

## Source Review Notes

- Room rendering remains webview/layout-only and does not touch provider discovery, handoff,
  timeline, usage, or backend launch behavior.
- Doorplate labels are sanitized through `safeProjectRoomLabel` before rendering.
- Layouts without `projectRooms` continue to produce no room render instructions.
- Auto room creation remains explicit through the Rooms editor tool rather than silent background
  generation.
- Room editor actions update room metadata only; deleting a room does not delete furniture.
- Seating truthfulness remains enforced in `OfficeState` rather than in the renderer.

## Installed And Package Results

- `npm run build`
  - Passed.
  - Existing Vite warning remains: one webview chunk is larger than 500 kB after minification.
- `npx vsce package`
  - Passed.
  - Generated `pixel-agents-multi-1.3.0.vsix`.
  - Package output: 188 files, 728.65 KB.
- `code --install-extension pixel-agents-multi-1.3.0.vsix --force`
  - Passed.
  - VS Code reported the extension was successfully installed.
- `npm run verify:installed`
  - Passed.
  - Installed extension verified as `raychen.pixel-agents-multi@1.3.0`.
  - Node emitted the existing `url.parse()` deprecation warning from the verification script.
- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"`
  - Returned `raychen.pixel-agents-multi@1.3.0`.
- Supervisor verification repeated `npm run verify:installed` and the installed-extension list check
  after reviewing the report; both still passed.

## Automated Validation

- `git diff --check`
  - Passed.
- `npm run test:webview`
  - Passed: 208 tests.
- `npm run test:server`
  - Passed: 284 tests.
  - Existing expected stderr appeared in tests for malformed Claude settings, mocked missing Claude
    project dirs, and safe external kill failure paths.
- `npm run build`
  - Passed.
  - Existing Vite chunk-size warning remained.

Combined automated tests: 492.

## Manual / Live QA Results

Installed/live VS Code UI QA was not performed in this run.

Not visually verified:

- room boundaries visible but not noisy;
- doorplate readability at normal and low zoom;
- doorplates avoiding agents, bubbles, and editor controls;
- Rooms tool reachability and form layout in the real webview;
- create/rename/kind/project/bounds/delete room interactions through the installed UI;
- Auto rooms behavior with multiple visible real agents;
- save/reload preservation through the real UI;
- real seating animation after reload.

No screenshots were captured.

## Stale Claude Launch Test Agent Check

The old Claude launch test agent cleanup was not visually verified after reload because live UI QA
was not available. I did not inspect or edit VS Code `workspaceStorage/state.vscdb`.

Source review did not identify a new W18 regression path that would restore deleted Claude smoke
agents by room logic. The relevant restore/adoption behavior is unchanged by W18-CDE:

- persisted external agents are restored only when their JSONL/audit file still exists;
- non-external terminal agents require a matching live terminal name;
- Claude global/Cowork scanners can still adopt recent active sessions through normal provider
  discovery, independent of Project Rooms;
- W18 room rendering, room generation, and room editor code do not create or restore agents.

Remaining verification gap: after a manual VS Code reload, confirm the old Claude launch test
agents do not reappear in the installed Pixel Agents office.

## Fixes Made

None. No confirmed product bug was found in automated validation or source review, and installed UI
visual QA was not available to justify a polish patch.

## Remaining Risks

- Doorplate visual density, low-zoom hiding, and overlap with active agents still need real canvas
  QA.
- Room editor controls need real webview QA for clipping and small-panel usability.
- Auto rooms needs manual QA with multiple real visible projects to confirm practical generated
  rooms and save/reload behavior.
- Stale Claude smoke agent non-reappearance needs a manual reload check.
- The Vite large chunk warning remains existing/non-blocking but should be tracked separately if
  webview size becomes a release concern.
