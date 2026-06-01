# Work Package W3-I - Installed VSIX Live Smoke

## Context

Pixel Agents Multi is the user's private Windows VS Code extension. The intended installed identity
is:

```text
raychen.pixel-agents-multi@1.3.0
```

W3-H added automated coverage for Claude Cowork/local-agent-mode adoption and provider filtering in
Extension Development Host E2E. The remaining gap is normal installed VS Code: the user needs the
real installed extension to show the current local agents correctly, without confusion with any
upstream/public Pixel Agents extension.

The current local artifact expectation before this package was:

- Codex: 3 active non-archived top-level threads.
- Claude: 1 active non-archived Claude Cowork/local-agent-mode session.
- All: 4 visible agents.

Re-derive this matrix from disk before making any claim, because local provider state can change.

## Goal

Normal installed VS Code on Windows shows the local Pixel Agents Multi extension working correctly:

- Only `raychen.pixel-agents-multi@1.3.0` is installed for Pixel Agents.
- The upstream/public Pixel Agents extension is not installed.
- The Pixel Agents Multi panel can be opened after reload.
- Provider filter **All** shows the current expected Codex + Claude matrix.
- Provider filter **Codex** shows the current expected Codex count.
- Provider filter **Claude** shows the current expected Claude count.
- Agent Center > **Agents** lists the Claude Cowork agent when the artifact matrix includes one.
- Agent Center > **Usage** renders visible content and is not blank.
- Refresh keeps counts stable and does not permanently stack all agents on the same seat/tile.

If the artifact matrix changed, document the new matrix and verify the UI matches it.

## Non-goals

Do not:

- change release identity, publisher, package name, command IDs, or view IDs,
- redesign Agent Center or Usage,
- mutate/delete/archive local Codex or Claude provider sessions,
- reset or overwrite the user's layout unless explicitly instructed,
- push, rebase, amend, or merge.

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
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
git checkout -b qa/w3-i-installed-vsix-live-smoke
```

Expected:

- `git log -1` shows `Merge W3-H: Claude live visibility guard` or later.
- Worktree is clean before branching.
- Installed extension list includes `raychen.pixel-agents-multi@1.3.0`.
- No upstream/public Pixel Agents extension is installed. If one is installed, document it and stop
  before changing anything.

Begin by reading:

```text
docs/roadmap/supervision/reports/W3-H-claude-live-visibility-report.md
docs/roadmap/supervision/work-packages/W3-H-claude-live-visibility.md
```

## Read-only artifact/state audit

Before interacting with VS Code, derive the expected provider matrix from disk. Do not mutate these
files.

Inspect:

- `%USERPROFILE%\.codex\state_5.sqlite`
- `%APPDATA%\Claude\local-agent-mode-sessions`
- `%APPDATA%\Code\User\workspaceStorage\**\state.vscdb`
- `%USERPROFILE%\.pixel-agents-multi`

Record:

- active non-archived Codex top-level thread count and IDs,
- active non-archived Claude Cowork/local-agent-mode sessions,
- each Claude selected folder and `audit.jsonl` existence,
- persisted Pixel Agents agent records and provider split,
- hidden/archived Pixel Agents state,
- panel hidden state.

## Build/package/install gate

Run:

```powershell
npm run build
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi|pablodelucca\.pixel-agents|pixel-agents"
```

Record the VSIX file count and size from `vsce`.

If code changes are needed later, also run:

```powershell
npm run check-types
npm run test:webview
npm run test:server
npm run e2e
```

Minimum expected counts when those suites are run:

- Webview: at least 22 passed.
- Server: at least 203 passed.
- E2E: at least 1 passed.

## Normal installed VS Code live smoke

Use normal installed VS Code, not Extension Development Host.

1. Open VS Code at `C:\Users\User\Documents\raychen\pixel-agents-multi`.
2. Run **Developer: Reload Window**.
3. Open **Pixel Agents Multi**. If the panel is hidden, run **Pixel Agents Multi: Show Panel**.
4. Wait 5 seconds.
5. Capture a screenshot of the initial panel.
6. Click **Refresh**.
7. Wait 5 seconds.
8. Verify provider filter **All** count.
9. Verify provider filter **Codex** count.
10. Verify provider filter **Claude** count.
11. Open Agent Center > **Agents** and verify Claude row presence if the matrix includes Claude.
12. Open Agent Center > **Usage** and verify visible nonblank content.
13. Click **Refresh** again.
14. Verify counts remain stable.
15. Verify agents are not all permanently stacked on one tile/seat after refresh.

Use Windows desktop automation if available. If automation is blocked, document exactly what failed
and use the strongest available screenshots, logs, and state evidence, but do not claim live visual
QA passed without visual evidence.

## If live smoke fails

Diagnose the owning layer before editing:

- installed extension identity/conflict,
- VSIX stale bundle,
- panel hidden/opening problem,
- extension activation/log error,
- artifact eligibility,
- provider restore/adoption,
- webview message delivery,
- provider filter,
- Agent Center rendering,
- seating/refresh randomization.

Fix the smallest owning layer and add or update a focused regression test. Keep release-identity
changes out of this package.

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-I-installed-vsix-live-smoke-report.md
```

Include:

- Summary verdict.
- Current branch and commit.
- Exact artifact/state matrix.
- Installed extension identity evidence.
- VSIX file count and size.
- Normal VS Code live smoke steps performed.
- Screenshots/log paths, if captured.
- Final live provider counts for **All**, **Codex**, and **Claude**.
- Agent Center > Agents result.
- Agent Center > Usage result.
- Refresh/stacking result.
- Any code changes made.
- Test/build/package/install results.
- Any remaining manual QA gap.

## Commit

Commit the report, and any required fix, on the same branch.

Suggested commit if this is QA/report only:

```text
test: verify installed VSIX live smoke
```

Suggested commit if a fix is needed:

```text
fix: restore installed VSIX live smoke
```

Do not push, merge, rebase, or amend.
