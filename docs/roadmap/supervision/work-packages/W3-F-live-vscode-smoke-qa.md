# Work Package W3-F - Live VS Code smoke QA

## Context

Pixel Agents Multi has now landed the Windows stabilization and packaging wave through W3-E:

- W3-B provider adoption hardening.
- W3-C usage token polish and blank-panel guard.
- W3-D Claude Cowork/local-agent-mode refresh visibility.
- W3-E release identity and packaging cleanup.

The repository is expected to be on current `main` after:

```text
Merge W3-E: release identity packaging
```

The installed extension should be:

```text
raychen.pixel-agents-multi@1.3.0
```

W3-F is the final live smoke pass before feature work continues. It must verify the actual installed
VS Code extension UI, not just the browser mock or unit tests.

## Goal

Prove whether the installed VSIX is stable in the user's Windows VS Code environment. If a live
smoke check fails, make the smallest code/test fix needed to make the expected state true.

The expected baseline on this machine is currently:

- 3 visible Codex agents.
- 1 visible Claude Desktop/Cowork local-agent-mode agent.
- Provider filter set to **All** shows all four agents.
- Agent Center tabs render: **Agents**, **Usage**, **Timeline**.
- Usage tab shows populated usage, an empty state, or fallback error text; it must not render a blank panel.
- Refresh does not duplicate agents, drop valid agents, or leave all agents stacked together.
- Working top-level agents use valid computer-adjacent work seats; idle top-level agents do not occupy work seats.

If local provider artifacts have changed since this package was written, document the new expected
matrix from the artifacts and explain the difference in the report.

## Files likely involved if fixes are needed

- `src/PixelAgentsViewProvider.ts`
- `src/agentManager.ts`
- `src/configPersistence.ts`
- `src/layoutPersistence.ts`
- `server/src/providers/file/claude.ts`
- `server/src/providers/file/codex.ts`
- `webview-ui/src/App.tsx`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/components/TokenCostSummary.tsx`
- `webview-ui/src/office/engine/officeState.ts`
- `webview-ui/src/office/engine/characters.ts`
- `webview-ui/src/office/components/OfficeCanvas.tsx`
- Existing tests under `server/__tests__/` and `webview-ui/test/`

Do not change these files unless live QA exposes a real failure.

## Non-goals

Do not:

- redesign Agent Center or Usage UI
- add a new dashboard
- change release identity or version
- modify user-local layout/config/session files
- archive, delete, or mutate provider sessions
- reinstall or debug unrelated extensions except to identify that an error is not from Pixel Agents Multi
- push, merge, rebase, or amend

## Required branch and preflight

Run from:

```text
C:\Users\User\Documents\raychen\pixel-agents-multi
```

Commands:

```powershell
git checkout main
git log -1 --oneline
git status --short --branch
git checkout -b cleanup/w3-f-live-vscode-smoke-qa
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
```

Expected:

- `git log -1` shows `Merge W3-E: release identity packaging` or later.
- Worktree is clean before branching.
- Installed extension list includes `raychen.pixel-agents-multi@1.3.0`.
- No upstream public Pixel Agents extension is installed. If one is installed, document it and stop
  before changing anything.

## Build/package/install gate

Run:

```powershell
npm run check-types
npm run test:webview
npm run test:server
npm run build
npx vsce ls
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

Expected test count must be at least:

- Webview: 22 passed.
- Server: 203 passed.
- Combined: 225 passed if using `npm test`.

Record the package file count/size from `npx vsce package`.

## Read-only provider artifact audit

Before opening the UI, derive the expected live matrix from local artifacts:

- Codex roots: `%USERPROFILE%\.codex`
- Claude Code roots: `%USERPROFILE%\.claude`
- Claude Desktop/Cowork roots: `%APPDATA%\Claude\local-agent-mode-sessions`
- Pixel Agents Multi user data: `%USERPROFILE%\.pixel-agents-multi`

Do not mutate these files. Record the exact artifacts that justify each expected visible agent.

For the current machine, prior evidence showed:

- 3 non-archived top-level Codex rows/rollouts across 2 project folders.
- 1 active Claude Cowork `local_*.json` metadata record with an existing `audit.jsonl`.

Re-check this instead of assuming it.

## Live VS Code UI smoke QA

Use normal installed VS Code, not Extension Development Host unless normal VS Code cannot be driven.
Use Windows desktop automation if available.

Steps:

1. Open VS Code at `C:\Users\User\Documents\raychen\pixel-agents-multi`.
2. Run **Developer: Reload Window**.
3. Open the **Pixel Agents Multi** panel.
4. Wait 5 seconds for initial scanners.
5. Click **Refresh**.
6. Wait another 5 seconds.
7. Set provider filter to **All**.
8. Count visible agents on the canvas and in Agent Center.
9. Switch filters: **Codex**, **Claude**, then **All**.
10. Open Agent Center tabs: **Agents**, **Usage**, **Timeline**.
11. Click **Refresh** again and wait 5 seconds.
12. Confirm agents did not duplicate, disappear unexpectedly, or collapse into one stacked position.

Capture evidence in the report:

- Screenshot path(s), if desktop automation can save them.
- Visible agent count by provider.
- Agent Center count by provider.
- Project labels for all visible agents.
- Usage tab state: populated, empty-state, or fallback error.
- Timeline tab state.
- Any Pixel Agents Output or Developer Console errors.
- Any unrelated extension errors that steal focus, with extension id if identifiable.

## Pass/fail criteria

Pass only if all are true:

1. Installed identity is `raychen.pixel-agents-multi@1.3.0`.
2. Pixel Agents Multi panel renders after reload.
3. Agent Center opens.
4. All expected live provider artifacts are represented unless the artifact audit proves they are no longer active/eligible.
5. Claude Cowork/local-agent-mode appears in the Claude filter when a valid active Cowork artifact exists.
6. Refresh is idempotent: no duplicate visual agents for the same provider session/thread.
7. Refresh randomizes/restores positions without leaving all agents stacked together.
8. Usage tab is not blank.
9. Timeline tab is not blank due to a render error.
10. Work/rest seating invariants appear correct in the live canvas, or the report explains why no active/idle state was available to visually verify.

If any pass criterion fails:

- Identify the smallest owning layer.
- Add or update a focused test that would have failed before the fix.
- Make the smallest code fix.
- Re-run the full validation gate.
- Rebuild, package, install, reload, and repeat the live smoke step.

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-F-live-vscode-smoke-qa-report.md
```

Include:

- Summary verdict: pass / pass with caveats / fail.
- Current commit and branch.
- Exact commands run.
- Build/test/package/install results.
- VSIX file count and size.
- Installed extension identity evidence.
- Provider artifact matrix.
- Runtime visible matrix.
- Agent Center tab results.
- Usage result.
- Refresh/stacking result.
- Seating observations.
- Error logs or screenshots.
- Fix summary if code changed.
- Remaining blockers, if any.

## Commit

Commit the report and any required minimal fixes on the same branch.

Suggested commit if report-only:

```text
docs: add W3-F live VS Code smoke QA report
```

Suggested commit if fixes are needed:

```text
fix: stabilize live Pixel Agents smoke QA
```

Do not push, merge, rebase, or amend.
