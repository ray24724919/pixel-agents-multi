# Work Package W12-B - Handoff executor live QA

## Context (read first)

W12-A enabled package-backed handoff executor launch for both Codex and Claude:

- Handoff Queue and Recent Handoffs now expose `Launch Codex` and `Launch Claude`.
- Codex launch behavior is preserved.
- Claude handoff prompts are passed as CLI arguments through `shellPath`/`shellArgs`, not by raw
  shell prompt concatenation.
- Sidecar execution metadata is linked only after `launchNewTerminal` returns an agent.

W12-A passed automated validation, but it did not run manual VS Code / installed VSIX QA. This
package exists to validate the real local extension path: package, install, reload, open the panel,
launch package-backed handoff executors, and inspect linked sidecar/timeline/UI state.

This is primarily a QA/report package. Only make code changes if live QA finds a concrete bug.

## In scope

- Package and install the local VSIX from the current branch.
- Verify the installed extension identity is this fork: `raychen.pixel-agents-multi`.
- Run the standard build and automated tests.
- Perform live VS Code QA for package-backed handoff executor launch:
  - `Launch Codex`
  - `Launch Claude`
- Verify Handoff Queue / Recent Handoffs display provider-specific launch actions.
- Verify successful launch links sidecar execution metadata with the correct provider.
- Verify launch timeline events are visible/searchable or reported if not visible.
- Verify no blank Usage/Timeline regressions after installing/reloading.
- If live QA finds a bug, implement the smallest scoped fix and add focused automated coverage.
- Write the W12-B report and commit all W12-B changes as a single commit.

## Out of scope (do NOT touch)

- Do not redesign Agent Center, Handoff Queue, Timeline, Usage, Replay, or the pixel office.
- Do not change handoff Markdown generation unless a live QA blocker proves it is broken.
- Do not change provider discovery/adoption behavior.
- Do not change token accounting.
- Do not change extension identity, publisher, package version, or README files.
- Do not merge, push, rebase, amend, reset, stash, clean, or delete user branches.
- Do not commit disposable QA handoff artifacts, temporary work packages, temporary executor reports,
  or temporary VS Code settings unless they are part of an intentional bug fix and explicitly
  described in the report.

## Required preflight

From repo root:

```powershell
git status --short --branch
git log -1 --oneline
where.exe claude
code --version
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pixel-agents"
```

If the worktree is dirty before you start, stop and report the exact `git status --short --branch`
output.

If `claude` is not available, you may still run package/install/build/test QA, but mark Claude live
launch QA as blocked. Do not fake a pass.

## Required validation commands

Run:

```powershell
npm run build
npm run test:webview
npm run test:server
npm run package:vsix
npm run install:local
npm run verify:installed
git diff --check
```

Record the final summary lines and test counts in the report.

Combined automated test count must be at least 406 unless the runner output format changes.

## Live QA protocol

Use the installed extension or Extension Development Host, but state which one you used. Installed
VSIX QA is preferred because this package is verifying the local release path.

### 1. Reload and open the panel

1. Reload VS Code after install.
2. Open **Pixel Agents Multi**.
3. Click **Refresh**.
4. Open **Agents**.
5. Confirm Usage and Timeline/Handoff areas render a real state or empty state, not a blank panel.

### 2. Prepare package-backed handoffs

You need package-backed handoffs for both launch paths. Use one of these approaches:

- Preferred: create disposable QA handoffs through the extension UI and then create work packages
  from them.
- Acceptable fallback: create disposable QA handoffs/work packages using existing repo helper logic
  if the UI cannot create them because no timeline events are available.

Disposable QA artifacts must use a recognizable slug such as `w12-b-smoke-codex` and
`w12-b-smoke-claude`.

Do not commit disposable QA artifacts. Remove only artifacts you created for this QA package, and
list their paths in the report.

### 3. Verify Codex launch

1. In Recent Handoffs or Handoff Queue, find the Codex QA package-backed handoff.
2. Confirm `Launch Codex` is visible and enabled.
3. Click `Launch Codex`.
4. Confirm a terminal/agent is created or clearly report why launch is blocked.
5. Inspect the related `.handoff.json` sidecar and confirm:
   - `dispatchPackage.status` becomes `dispatched` unless already completed/blocked,
   - `dispatchPackage.execution.status` is `active`,
   - `dispatchPackage.execution.providerId` is `codex`,
   - linked agent id/name/session fields are present when available.
6. Confirm the Handoff Queue row reflects the linked executor.

### 4. Verify Claude launch

1. In Recent Handoffs or Handoff Queue, find the Claude QA package-backed handoff.
2. Confirm `Launch Claude` is visible and enabled.
3. Click `Launch Claude`.
4. Confirm a terminal/agent is created or clearly report why launch is blocked.
5. Inspect the related `.handoff.json` sidecar and confirm:
   - `dispatchPackage.status` becomes `dispatched` unless already completed/blocked,
   - `dispatchPackage.execution.status` is `active`,
   - `dispatchPackage.execution.providerId` is `claude`,
   - linked agent id/name/session fields are present when available.
6. Confirm the Handoff Queue row reflects the linked executor.

### 5. Cleanup after live QA

- Stop or close only the QA-launched agents you created for this package.
- Remove only disposable QA artifacts you created.
- Do not delete user-created handoffs, reports, branches, settings, or extension data.
- End with `git status --short --branch` showing only the W12-B report and any intentional code/test
  fixes.

## If live QA finds a bug

If you find a concrete bug, keep the fix tightly scoped:

- Fix only the broken launch/report/linking/UI state involved in W12-B.
- Add or update focused automated tests.
- Re-run all required validation commands.
- In the report, include:
  - exact reproduction,
  - root cause,
  - fix summary,
  - before/after behavior.

If fixing the bug would require broader provider discovery, timeline redesign, layout changes, or
token accounting changes, stop and report it as a follow-up instead of expanding scope.

## Guardrails

- Branch from current `main`.
- Use branch name: `product/w12-b-handoff-executor-live-qa`.
- One package = one commit on this branch.
- Do not push, merge, rebase, amend, reset, stash, clean, delete branches, or modify unrelated files.
- If you create disposable QA artifacts, remove only the exact files you created.
- Do not leave launched QA executors running.

## Acceptance criteria

1. Local VSIX package/install path succeeds for `raychen.pixel-agents-multi`.
2. Installed/reloaded Pixel Agents Multi panel opens.
3. Usage and Timeline/Handoff pages do not render blank.
4. `Launch Codex` is visible for package-backed handoffs.
5. `Launch Claude` is visible for package-backed handoffs.
6. Codex launch either passes live QA or is reported with a precise blocker.
7. Claude launch either passes live QA or is reported with a precise blocker.
8. Successful launches write correct provider-specific sidecar execution metadata.
9. No disposable QA artifacts, temporary settings, or QA-launched agents are left behind unless a
   retained artifact is explicitly justified in the report.
10. Required automated validation commands pass.

## Reporting back

Write your final report to:

```text
docs/roadmap/supervision/reports/W12-B-handoff-executor-live-qa-report.md
```

Commit the report as part of the same W12-B commit. If no code changes were needed, the commit may
contain only this report.

The report must contain:

1. Branch name + commit SHA
2. Installed extension identity and VSIX filename
3. Files touched
4. Validation command results and test counts
5. Live QA environment used: installed VSIX or Extension Development Host
6. Codex launch QA result
7. Claude launch QA result
8. Sidecar metadata findings for both providers
9. Disposable QA artifacts created and removed
10. Bugs found and fixes applied, or "none"
11. Remaining blockers/manual QA gaps, or "none"
