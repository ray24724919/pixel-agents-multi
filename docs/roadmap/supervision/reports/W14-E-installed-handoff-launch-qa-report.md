# W14-E Installed Handoff Launch QA Report

## Summary

W14-E validated the installed VSIX package-backed handoff launch workflow after W14-B/C/D. The installed extension identity was correct and both launch buttons wrote the required sidecar execution metadata. The UI pass was user-assisted because Computer Use hit the same Windows `GetCursorPos` access-denied blocker recorded in W14-D.

Claude launch metadata passed, but the user reported the Claude executor terminal/agent appeared stuck after launch. This report records that as a live QA finding. No source-code fix was made because the sidecar launch acceptance fields were written correctly and no concrete terminal error output was available from shell inspection.

## Branch And Installed Identity

- Branch: `product/w14-e-installed-handoff-launch-qa`
- Baseline: `03c7b7b Merge W14-D: installed handoff live validation`
- Installed extension list: `raychen.pixel-agents-multi@1.3.0`
- `npm run verify:installed`: passed, installed `raychen.pixel-agents-multi@1.3.0`

## QA Mode

- Computer Use automation was attempted first.
- `sky.list_apps()` found the running VS Code window: `Welcome - pixel-agents-multi - Visual Studio Code`.
- Capturing/activating the VS Code window failed with:

```text
GetCursorPos failed: 存取被拒。 (0x80070005)
```

- Per W14-E instructions, no fallback foreground keyboard/mouse scripts, stale coordinates, SendKeys, or shell-driven UI automation were used.
- The supervisor/user manually clicked the installed VS Code Pixel Agents UI while sidecar metadata was inspected from the shell.

## Disposable Smoke Artifacts

Created with repo handoff helper code and marked `dispatchPackage.status: "ready"` before UI launch:

- `docs/agent-handoffs/2026-06-07-1407-w14-e-smoke-codex-launch-handoff.md`
- `docs/agent-handoffs/2026-06-07-1407-w14-e-smoke-codex-launch-handoff.handoff.json`
- `docs/roadmap/supervision/work-packages/handoffs/w14-e-smoke-codex-launch-work-package.md`
- `docs/agent-handoffs/2026-06-07-1408-w14-e-smoke-claude-launch-handoff.md`
- `docs/agent-handoffs/2026-06-07-1408-w14-e-smoke-claude-launch-handoff.handoff.json`
- `docs/roadmap/supervision/work-packages/handoffs/w14-e-smoke-claude-launch-work-package.md`

No disposable executor reports were generated.

All listed disposable smoke handoff and work-package files were removed before committing this report. Empty disposable directories created by this QA pass were also removed.

## UI Steps Completed

The supervisor/user manually used the installed VS Code UI to:

- Open Pixel Agents Multi.
- Refresh handoff artifacts.
- Find the W14-E smoke rows in the handoff workflow surface.
- Click `Launch Codex` for `W14-E Smoke Codex Launch`.
- Click `Launch Claude` for `W14-E Smoke Claude Launch`.

Observed by user:

- Codex launch worked.
- Claude launch wrote metadata but appeared stuck after launch.

Not separately confirmed before the Claude stuck state:

- Operator summary target group label.
- State-specific checklist copy labels.

## Codex Launch Metadata Result

Sidecar inspected after clicking `Launch Codex`:

- artifact: `2026-06-07-1407-w14-e-smoke-codex-launch-handoff`
- `dispatchPackage.status`: `dispatched`
- `dispatchPackage.execution.status`: `active`
- `dispatchPackage.execution.providerId`: `codex`
- `dispatchPackage.execution.agentName`: `Codex`
- `dispatchPackage.execution.agentId`: `18`
- `dispatchPackage.execution.sessionId`: `916801bc-fdbd-448d-b437-44139f69e673`

The Codex launch also checked out the executor branch `product/handoff-w14-e-smoke-codex-launch` in the shared repo worktree. The W14-E QA branch was restored for report cleanup and commit. The executor branch was not deleted, per guardrails.

## Claude Launch Metadata Result

Sidecar inspected after clicking `Launch Claude`:

- artifact: `2026-06-07-1408-w14-e-smoke-claude-launch-handoff`
- `dispatchPackage.status`: `dispatched`
- `dispatchPackage.execution.status`: `active`
- `dispatchPackage.execution.providerId`: `claude`
- `dispatchPackage.execution.agentName`: `Claude`
- `dispatchPackage.execution.agentId`: `17`
- `dispatchPackage.execution.sessionId`: `6f3976eb-88d4-4681-98eb-2cd09c3fe844`

Shell preflight also confirmed Claude CLI was available:

- `C:\Users\User\.local\node-v22\claude`
- `C:\Users\User\.local\node-v22\claude.cmd`

## QA-Launched Agents / Terminals

The user reported Claude appeared stuck after launch. The user then instructed this run to record the state.

Potential QA-launched agents/terminals left for user cleanup:

- Codex smoke executor: agentId `18`, session `916801bc-fdbd-448d-b437-44139f69e673`
- Claude smoke executor: agentId `17`, session `6f3976eb-88d4-4681-98eb-2cd09c3fe844`

No shell process kill was attempted, and no unrelated agents/processes were touched.

## Bugs / Findings

- Sidecar metadata acceptance passed for both providers.
- Live UI automation remains blocked by Windows `GetCursorPos` access denied.
- Claude launch appeared stuck after metadata was written. No scoped source fix was applied because the required sidecar fields were correct and no concrete runtime error was captured.
- Operator summary and checklist copy labels were not independently confirmed in this pass; they remain a manual QA gap for this report.

## Validation

- `code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"`: `raychen.pixel-agents-multi@1.3.0`
- `npm run verify:installed`: passed
- `git diff --check`: passed
- `npm run test:webview`: passed, 154 tests
- `npm run test:server`: passed, 281 tests
- `npm run build`: passed
