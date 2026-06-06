# W14-D Installed Handoff Live Validation Report

## Summary

W14-D refreshed the locally installed VSIX from current main and attempted an installed-extension
live handoff workflow QA pass in the real VS Code window.

The release/install path passed, but live desktop validation was blocked before any Pixel Agents UI
control could be clicked. Computer Use listed the VS Code window successfully, then failed while
activating/capturing the window with the same Windows access error seen in W12-C:

```text
GetCursorPos failed: 存取被拒。 (0x80070005)
```

Per Computer Use safety rules, the run stopped without using fallback foreground keyboard/mouse
automation, stale coordinates, or shell-driven UI interaction.

## Branch And Baseline

- Branch: `product/w14-d-installed-handoff-live-validation`
- Baseline: `2aefc57 Merge W14-C: handoff checklist copy ergonomics`
- Installed extension identity: `raychen.pixel-agents-multi@1.3.0`

## Release / Install Result

`npm run release:local` passed from the W14-D branch.

The script completed:

- `npm run build`
- `npm run verify:identity`
- `npm run verify:vsix`
- `npm run package:vsix`
- `npm run install:local`
- `npm run verify:installed`

The generated VSIX was installed locally as:

- `pixel-agents-multi-1.3.0.vsix`
- `raychen.pixel-agents-multi@1.3.0`

## Disposable Smoke Artifacts

The run created disposable package-backed handoffs with repo helper code, then removed them after the
desktop automation blocker was confirmed.

Created and removed:

- `docs/agent-handoffs/2026-06-06-2217-pixel-agents-multi-handoff.md`
- `docs/agent-handoffs/2026-06-06-2217-pixel-agents-multi-handoff.handoff.json`
- `docs/roadmap/supervision/work-packages/handoffs/w14-d-smoke-codex-launch-work-package.md`
- `docs/agent-handoffs/2026-06-06-2218-pixel-agents-multi-handoff.md`
- `docs/agent-handoffs/2026-06-06-2218-pixel-agents-multi-handoff.handoff.json`
- `docs/roadmap/supervision/work-packages/handoffs/w14-d-smoke-claude-launch-work-package.md`

Both sidecars were initialized with `dispatchPackage.status: "ready"` so the installed UI could have
validated Handoff Queue needs-dispatch state, checklist copy labels, and package-backed launch
actions if desktop capture had succeeded.

## Desktop QA Result

Computer Use successfully listed the running VS Code app/window:

- App: `Microsoft.VisualStudioCode`
- Window: `Welcome - pixel-agents-multi - Visual Studio Code`

The next step attempted to activate/capture that window and failed with:

```text
GetCursorPos failed: 存取被拒。 (0x80070005)
```

No Pixel Agents UI controls were clicked. The Handoff Queue, operator summary, checklist copy button,
`Launch Codex`, and `Launch Claude` were not visually verified in the installed VS Code window.

## Launch Metadata Result

Result: blocked before UI interaction.

Because no launch button was clicked:

- No W14-D Codex executor was launched.
- No W14-D Claude executor was launched.
- No sidecar `dispatchPackage.execution` metadata was written.
- No QA-launched agents or terminals needed cleanup.

Expected installed-live checks still pending:

- Handoff Queue shows the package-backed smoke rows after refresh.
- Operator summary points to the correct queue group.
- Checklist copy labels match the current merge-readiness state.
- `Launch Codex` writes `dispatchPackage.execution.providerId: "codex"` and `status: "active"`.
- `Launch Claude` writes `dispatchPackage.execution.providerId: "claude"` and `status: "active"`.

## Bugs Found

No product bug was confirmed in this pass.

The blocker is the Windows desktop automation access failure, not a Pixel Agents runtime failure.

## Validation

- `npm run release:local`: passed.
- `git status --short`: clean after disposable artifact cleanup, before adding this report.
- `git diff --check`: passed.
- `npm run test:webview`: passed, 154 tests.
- `npm run test:server`: passed, 281 tests.
