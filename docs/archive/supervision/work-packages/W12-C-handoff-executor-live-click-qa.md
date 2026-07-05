# Work Package W12-C - Handoff executor live click QA

## Context (read first)

W12-A enabled package-backed handoff executor launch for both Codex and Claude.

W12-B validated the build/test/package/install/installed-identity path, but live VS Code UI QA was
blocked before launch actions could be clicked:

- installed extension identity passed: `raychen.pixel-agents-multi@1.3.0`,
- `npm run build` passed,
- `npm run test:webview` passed with 137 tests,
- `npm run test:server` passed with 269 tests,
- `npm run package:vsix`, `npm run install:local`, and `npm run verify:installed` passed,
- live UI automation was blocked by Windows access/visibility state before `Launch Codex` or
  `Launch Claude` could be clicked.

This package is a short retry focused only on the missing live click QA. Do not rerun the full W12-B
build/package/test checklist unless a code/product bug is found or the installed extension identity
has changed.

## In scope

- Confirm VS Code is visible and controllable before starting UI actions.
- Confirm installed identity remains `raychen.pixel-agents-multi@1.3.0`.
- Open Pixel Agents Multi in the installed VS Code extension.
- Confirm Usage and Timeline/Handoff render nonblank states after reload.
- Create disposable package-backed handoffs for:
  - Codex launch smoke test,
  - Claude launch smoke test.
- Click:
  - `Launch Codex`,
  - `Launch Claude`.
- Verify each successful launch writes provider-specific sidecar execution metadata.
- Verify Handoff Queue or Recent Handoffs displays linked executor state after launch.
- Clean up only disposable QA artifacts and launched QA agents created during this package.
- Write the W12-C report and commit it as a single commit.

## Out of scope (do NOT touch)

- Do not change source code unless live click QA finds a concrete bug.
- Do not rerun full build/test/package/install just to duplicate W12-B evidence.
- Do not redesign UI.
- Do not change extension identity, package version, README, usage accounting, provider discovery, or
  handoff schema.
- Do not commit disposable QA handoffs, temporary work packages, temporary reports, local settings,
  screenshots, or generated VSIX files.
- Do not push, merge, rebase, amend, reset, stash, clean, delete branches, or modify unrelated
  files.

## Required preflight

From repo root:

```powershell
git status --short --branch
git log -1 --oneline
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"
where.exe claude
```

If the worktree is dirty before you start, stop and report the exact `git status --short --branch`
output.

Before using desktop automation, make sure:

- VS Code is visible and not minimized,
- the user is not actively using the mouse/keyboard,
- the target VS Code window is not elevated in a way that blocks automation,
- Pixel Agents Multi is installed and the window has been reloaded after install.

If automation reports access denied or cannot control VS Code, stop and write a report instead of
continuing with stale coordinates.

## Live QA protocol

### 1. Open the installed extension

1. Bring the VS Code window to the foreground.
2. Open the **Pixel Agents Multi** panel.
3. Click **Refresh**.
4. Open **Agents**.
5. Confirm:
   - Usage renders a real state or empty state, not a blank panel,
   - Timeline/Handoff renders a real state or empty state, not a blank panel,
   - package-backed handoffs show provider-specific launch controls when available.

### 2. Create disposable QA handoffs

Create package-backed disposable handoffs with recognizable slugs:

- `w12-c-smoke-codex`
- `w12-c-smoke-claude`

Preferred path: use the UI.

Acceptable fallback: use repo helper/model code if the UI cannot create handoffs because no timeline
events exist. If you use this fallback, describe exactly how in the report.

Do not commit these artifacts.

### 3. Codex launch click

1. In Recent Handoffs or Handoff Queue, find the Codex QA handoff.
2. Confirm `Launch Codex` is visible and enabled.
3. Click `Launch Codex`.
4. Confirm a Codex terminal/agent is created or report the precise blocker.
5. Inspect the Codex QA sidecar and confirm:
   - `dispatchPackage.status` is `dispatched` unless it was already completed/blocked,
   - `dispatchPackage.execution.status` is `active`,
   - `dispatchPackage.execution.providerId` is `codex`,
   - linked agent id/name/session fields are present when available.

### 4. Claude launch click

1. In Recent Handoffs or Handoff Queue, find the Claude QA handoff.
2. Confirm `Launch Claude` is visible and enabled.
3. Click `Launch Claude`.
4. Confirm a Claude terminal/agent is created or report the precise blocker.
5. Inspect the Claude QA sidecar and confirm:
   - `dispatchPackage.status` is `dispatched` unless it was already completed/blocked,
   - `dispatchPackage.execution.status` is `active`,
   - `dispatchPackage.execution.providerId` is `claude`,
   - linked agent id/name/session fields are present when available.

### 5. Cleanup

- Close/kill only QA-launched agents created by this package.
- Remove only disposable W12-C artifacts created by this package.
- End with:

```powershell
git status --short --branch
git diff --check
```

Expected final dirty state before commit: only the W12-C report, unless a real bug fix was required.

## If live QA finds a bug

If a concrete product bug is found:

- implement the smallest scoped fix,
- add or update focused automated tests,
- then run:

```powershell
npm run build
npm run test:webview
npm run test:server
git diff --check
```

If no code changes are made, do not rerun the full automated suite unless needed for confidence.

## Acceptance criteria

1. Installed identity is confirmed as `raychen.pixel-agents-multi@1.3.0`.
2. Pixel Agents Multi panel opens in VS Code.
3. Usage and Timeline/Handoff pages do not render blank.
4. `Launch Codex` is visible and can be clicked, or a precise blocker is reported.
5. `Launch Claude` is visible and can be clicked, or a precise blocker is reported.
6. Successful Codex launch writes sidecar execution metadata with `providerId: codex`.
7. Successful Claude launch writes sidecar execution metadata with `providerId: claude`.
8. Handoff Queue/Recent Handoffs reflects linked executor state after successful launches.
9. Disposable QA artifacts and launched QA agents are cleaned up.
10. Final git status contains only the report or explicitly justified bug-fix files.

## Reporting back

Write your final report to:

```text
docs/roadmap/supervision/reports/W12-C-handoff-executor-live-click-qa-report.md
```

Commit the report as part of this package's single commit.

The report must contain:

1. Branch name + commit SHA
2. Installed extension identity
3. Live QA environment and whether automation was usable
4. Usage/Timeline/Handoff nonblank result
5. Codex launch result
6. Claude launch result
7. Sidecar metadata findings for both providers
8. Disposable QA artifacts created and removed
9. QA-launched agents/terminals cleaned up
10. Bugs found and fixes applied, or "none"
11. Remaining blockers/manual QA gaps, or "none"
