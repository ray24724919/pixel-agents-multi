# W17-D Installed Work Queue Visual QA Report

## Summary

W17-D installed VSIX QA passed for the W17 Work Queue simplification after reloading the VS Code window so the newly installed webview bundle was active.

The installed extension identity remained the private fork:

- `raychen.pixel-agents-multi@1.3.0`

## Build, Package, Install

- `npm run build` passed.
  - Vite emitted the existing large chunk warning only.
- `npx vsce package` passed.
  - VSIX filename: `pixel-agents-multi-1.3.0.vsix`
  - Generated package size: 740,765 bytes.
- `code --install-extension pixel-agents-multi-1.3.0.vsix --force` passed.
  - VS Code reported the extension was successfully installed.
  - The command also printed the known Node `url.parse()` deprecation warning.
- `npm run verify:installed` passed.
  - Verified: `raychen.pixel-agents-multi@1.3.0`
- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"` showed:
  - `raychen.pixel-agents-multi@1.3.0`

## Visual QA Notes

Installed VS Code was opened on `C:\Users\User\Documents\raychen\pixel-agents-multi` and the Pixel Agents Multi panel was inspected.

Important reload note:

- Immediately after install, the open VS Code window still showed the previous webview copy with `RECENT HANDOFFS`.
- Running `Developer: Reload Window` loaded the newly installed bundle.
- After reload, the W17 labels and layout were visible.

Verified normal panel width:

- `Handoff Workflow` heading is visible.
- `Work Queue` heading is visible.
- `Handoff Library` heading is visible.
- With one package-backed handoff present, `Work Queue` appears before `Handoff Library`.
- The Work Queue operator summary is visible and points to the `report ready` group with a `Show report ready` action.
- The Work Queue row shows a decision strip:
  - Stage/status chips such as `READY`, `NEEDS REVIEW`, and warning count.
  - Review detail and next-step text.
  - Branch/report/validation cue chips.
- The row has one prominent primary next-step area:
  - `Open executor report`
- Secondary actions are grouped:
  - `Reference`: `Open handoff`, `Open work package`, `Copy handoff prompt`, `Copy work-package prompt`
  - `Executor`: `Launch Codex`, `Launch Claude`, `Refresh report status`, link-agent control
  - `Maintenance`: `Mark stale`, `Reset draft`, dispatch/execution status controls
- `Launch Codex` and `Launch Claude` remain visible for the ready package-backed row.
- `Open executor report` and `Refresh report status` remain available.
- The old section labels were not visible after reload:
  - `Handoff Queue`
  - `Recent Handoffs`
- The old standalone action labels were not visible after reload:
  - `Refresh completion`
  - `Open report`
  - `Copy dispatch prompt`
  - `Copy prompt`

Markdown-only visual state:

- The local handoff directory only contained one package-backed handoff during this QA pass.
- A markdown-only row was not available for direct visual inspection.
- No package-backed launch controls were observed outside the package-backed Work Queue row.

Narrow-width check:

- Not performed. The user desktop had an active VS Code window alongside another app, and resizing was not necessary for this installed pass.
- Normal VS Code panel width did not show clipped primary controls, unusable selects, or overlapping text in the inspected Work Queue area.

## Screenshots

Transient screenshots were captured for inspection and kept outside the repository:

- `C:\Users\User\AppData\Local\Temp\w17-d-after-reload-small-down.png`
- `C:\Users\User\AppData\Local\Temp\w17-d-workqueue-row.png`
- `C:\Users\User\AppData\Local\Temp\w17-d-handoff-library-row.png`

No screenshot files are committed with this report.

## Tests

- `npm run test:webview` passed: 174 tests.
- `npm run test:server` passed: 284 tests.

Expected minimums were met:

- webview tests >= 174
- server tests >= 284

## Readiness

W17 is ready to proceed to W18-A Project Rooms spec.

Recommended polish:

- Document in release QA playbooks that VS Code should be reloaded after installing a local VSIX before judging webview copy changes.
- Add a markdown-only fixture for future installed visual QA if the supervisor wants that state visually verified without creating disposable artifacts.
