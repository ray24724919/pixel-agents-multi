# Work Package W3-I - Final Windows release handoff

## Context

Pixel Agents Multi is intended to be installed and shared as the user's own VS Code extension,
separate from the upstream public Pixel Agents extension.

The private extension identity is:

```text
raychen.pixel-agents-multi
```

Run this package only after W3-G and W3-H are finished and merged back to `main`.

W3-G should prove Agent Center > Usage is not blank. W3-H should prove the expected Claude
Cowork/local-agent-mode agent is visible when its local artifacts are active. W3-I is the final
Windows package/install/live smoke handoff; it should not be used to hide or defer those failures.

## Goal

Produce final evidence that the current `main` is ready for the user to install/share as a local
VSIX on Windows without confusion with the upstream public extension.

The final state must prove:

- VSIX builds from a clean `main`.
- Installed extension id is `raychen.pixel-agents-multi@1.3.0`.
- No upstream public Pixel Agents extension is installed.
- Package contents exclude dev-only/supervision artifacts.
- Normal installed VS Code loads the Pixel Agents Multi panel.
- Expected live Codex/Claude provider artifacts are represented in the UI.
- Agent Center tabs work: Agents, Usage, Timeline.
- Usage is not blank.
- Refresh is idempotent and does not stack all agents together.
- Work/rest seating invariants still look correct in the live canvas.

If local provider artifacts changed, document the new expected live matrix and verify against that
matrix instead of stale counts.

## Files likely involved

This should normally be report-only. If the final pass exposes a real bug, fix the smallest owning
layer and add/update a focused test.

Likely files if a fix is needed:

- `package.json`
- `.vscodeignore`
- `README.md`
- `CHANGELOG.md`
- `docs/release-identity.md`
- `src/PixelAgentsViewProvider.ts`
- `src/fileWatcher.ts`
- `webview-ui/src/App.tsx`
- `webview-ui/src/components/AgentCenter.tsx`
- `webview-ui/src/office/engine/officeState.ts`
- Existing tests under `server/__tests__/`, `webview-ui/test/`, or `e2e/`

Do not change these files unless current evidence proves the final release criteria fail.

## Non-goals

Do not:

- publish to Visual Studio Marketplace,
- publish to Open VSX,
- bump version unless the supervisor explicitly asks,
- change extension identity,
- mutate/delete/archive user-local Codex or Claude provider sessions,
- redesign Agent Center or Usage,
- push, merge, rebase, or amend.

## Required branch and preflight

Run from:

```text
C:\Users\User\Documents\raychen\pixel-agents-multi
```

Commands:

```powershell
git checkout main
git log -5 --oneline
git status --short --branch
git checkout -b cleanup/w3-i-final-windows-release-handoff
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
```

Expected:

- `main` includes completed W3-G and W3-H fixes/reports.
- Worktree is clean before branching.
- Installed extension list includes `raychen.pixel-agents-multi@1.3.0`.
- No upstream public Pixel Agents extension is installed. If one is installed, document it and stop
  before changing anything.

Begin by reading:

```text
docs/roadmap/supervision/reports/W3-D-release-identity-and-packaging-report.md
docs/roadmap/supervision/reports/W3-G-usage-blank-regression-report.md
docs/roadmap/supervision/reports/W3-H-claude-live-visibility-report.md
docs/release-identity.md
README.md
CHANGELOG.md
```

If the W3-G or W3-H report does not exist yet, stop and report that W3-I is premature.

## Static identity audit

Verify current source and package metadata still agree on the private fork identity:

- `package.json`:
  - `"name": "pixel-agents-multi"`
  - `"displayName": "Pixel Agents Multi"`
  - `"publisher": "raychen"`
  - command titles start with `Pixel Agents Multi:`
  - command ids use `pixel-agents-multi.*`
  - view ids use `pixel-agents-multi.*`
  - settings use `pixel-agents-multi.*`
- `src/constants.ts` and `server/src/constants.ts` use `pixel-agents-multi` keys and
  `~/.pixel-agents-multi` paths for this fork's live state.
- `docs/release-identity.md`, `README.md`, and `CHANGELOG.md` describe installation as
  `raychen.pixel-agents-multi`, not the upstream id.
- Any remaining `pixel-agents` references are intentional upstream attribution, migration fallback,
  or tests for not removing upstream hook entries.

Record exact evidence in the report.

## Read-only live artifact audit

Recompute the expected live provider matrix from local artifacts:

- `%USERPROFILE%\.codex\state_5.sqlite`
- `%APPDATA%\Claude\local-agent-mode-sessions`
- `%USERPROFILE%\.claude\projects`
- `%APPDATA%\Code\User\workspaceStorage\**\state.vscdb`
- `%USERPROFILE%\.pixel-agents-multi`

Record:

- active non-archived top-level Codex threads with existing rollout paths,
- active Claude Cowork/local-agent-mode metadata with existing audit logs,
- active Claude Code sessions, if any,
- persisted Pixel Agents records,
- hidden/archived counts,
- expected visible counts by provider.

Do not mutate these files.

## Build, test, package, install

Run:

```powershell
npm run check-types
npm run test:webview
npm run test:server
npm run build
npm run e2e
npx vsce ls
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
```

Expected minimum counts:

- Webview: at least 22 passed.
- Server: at least 203 passed.
- E2E: at least 1 passed.

Record:

- exact command results,
- VSIX file count and size,
- installed identity evidence,
- whether upstream public Pixel Agents appears in the installed extension list.

Inspect `npx vsce ls` output and confirm packaged contents include runtime/user-facing files and
exclude dev-only/supervision files:

Included examples:

- `dist/extension.js`
- `dist/hooks/claude-hook.js`
- `dist/assets/**`
- `dist/webview/**`
- `docs/external-assets.md`
- `docs/release-identity.md`
- `package.json`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `SECURITY.md`
- `icon.png`

Excluded examples:

- `.husky/**`
- `server/**`
- `docs/roadmap/**`
- `e2e/**`
- `eslint-rules/**`
- `playwright-report/**`
- `AGENTS.md`

## Normal VS Code live smoke

Use normal installed VS Code, not Extension Development Host unless normal VS Code cannot be driven.

1. Open VS Code at `C:\Users\User\Documents\raychen\pixel-agents-multi`.
2. Run **Developer: Reload Window**.
3. Open **Pixel Agents Multi**. If hidden, run **Pixel Agents Multi: Show Panel**.
4. Wait 5 seconds.
5. Click **Refresh**.
6. Wait another 5 seconds.
7. Set provider filter to **All** and record visible count.
8. Switch provider filters: **Codex**, **Claude**, **All**.
9. Open Agent Center > **Agents** and record rows by provider/project.
10. Open Agent Center > **Usage** and record whether the tab is populated, empty-state, or fallback
    error. It must not be blank.
11. Open Agent Center > **Timeline** and record whether it renders.
12. Click **Refresh** again, wait 5 seconds, and confirm no duplicate agents and no all-agent
    stacking.
13. Visually inspect active/idle work/rest placement.

Capture screenshots and output logs if available. If desktop automation cannot drive normal VS Code,
document the limitation and provide the strongest available evidence, but do not claim full live
smoke passed.

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-I-final-windows-release-handoff-report.md
```

Include:

- Summary verdict: pass / pass with caveats / fail.
- Current commit and branch.
- W3-G and W3-H completion evidence.
- Static identity audit.
- Read-only live provider artifact matrix.
- Test/build/package/install results.
- VSIX file count and size.
- `npx vsce ls` include/exclude evidence.
- Installed extension identity and upstream-extension absence/presence.
- Normal VS Code live smoke results.
- Usage tab result.
- Claude visibility result.
- Refresh/stacking result.
- Seating observations.
- Screenshots/log paths, if any.
- Any bugs fixed in this package.
- Remaining release blockers, if any.
- Explicit note that Marketplace/Open VSX publish was not performed.

## Commit

Commit the report and any required minimal fixes on the same branch.

Suggested commit if report-only:

```text
docs: add final Windows release handoff report
```

Suggested commit if fixes are needed:

```text
fix: finalize Windows release handoff
```

Do not push, merge, rebase, or amend.
