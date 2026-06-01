# Work Package W3-A - Windows release QA and adoption matrix

## Context

Pixel Agents Multi has recently landed the W2 stabilization wave:

- Codex external session sync and no-workspace fallback.
- Claude chat-mode filtering and cowork metadata fixes.
- Pause / resume, hide / archive / kill semantics.
- Seating invariants for work/rest behavior.
- Token usage accuracy improvements.
- Pixel Agent Center restored after a rejected dashboard experiment.
- Usage tab guard against blank renders.
- Webview cache busting for same-version VSIX installs.

The user is now using Windows VS Code with the packaged extension installed as
`raychen.pixel-agents-multi@1.3.0`. Before more feature work, we need a sober runtime QA pass
against the actual Windows environment.

## Goal

Produce a Windows live QA report that answers whether the current packaged extension is stable
enough for the next hardening/release work.

The report must verify:

1. VS Code loads the installed `raychen.pixel-agents-multi` extension, not the upstream public
   extension.
2. The Pixel Agents Multi panel renders after `Developer: Reload Window`.
3. Existing Codex and Claude sessions are discovered correctly.
4. Refresh does not duplicate, stack, or drop visible agents.
5. Claude agents appear when valid Claude code/cowork sessions exist.
6. Claude chat sessions remain hidden by default.
7. Agent Center tabs render: Agents, Usage, Timeline.
8. Usage tab is never blank; it shows either data, empty state, or a fallback error panel.
9. Active top-level agents go to valid work seats; idle top-level agents do not occupy work seats.
10. The installed VSIX can be rebuilt and reinstalled without stale webview assets.

## Non-goals

Do not implement code fixes in this package unless the QA is impossible without a tiny diagnostic
guard. If you find bugs, document exact reproduction steps and recommend the next package.

Do not:

- redesign Agent Center
- change token accounting
- change provider adoption logic
- modify the user's layout/config files
- clean unrelated dirty workspace files
- push, merge, rebase, or amend

## Required preflight

Run from the repository root:

```powershell
git status --short --branch
git log -1 --oneline
code --list-extensions --show-versions | rg "pixel-agents"
```

If the worktree is dirty, continue only for read-only QA/report work. Do not stash, reset, delete,
or clean files.

## QA checklist

### Build/package/install

Run:

```powershell
npm run check-types
npm run test:webview
npm run build
npx vsce package
code --install-extension pixel-agents-multi-1.3.0.vsix --force
code --list-extensions --show-versions | rg "raychen\.pixel-agents-multi"
```

Record pass/fail and key output lines.

### Installed extension identity

Inspect the installed extension under:

```text
%USERPROFILE%\.vscode\extensions\raychen.pixel-agents-multi-1.3.0
```

Verify:

- `package.json` has `"name": "pixel-agents-multi"`.
- `package.json` has `"publisher": "raychen"`.
- webview dist assets are present.
- no installed folder named only like the upstream extension is being confused with this fork.

### Runtime VS Code QA

Use normal VS Code, not only browser mocks.

1. Reload the VS Code window.
2. Open the Pixel Agents Multi panel.
3. Press Refresh.
4. Open Agent Center.
5. Switch between Agents / Usage / Timeline.
6. Press Refresh again and observe whether agent positions duplicate or collapse into one tile.

Capture:

- number of Codex agents expected
- number of Codex agents shown
- number of Claude agents expected
- number of Claude agents shown
- whether hidden agents are involved
- whether Usage tab is blank, empty-state, or populated
- any Output/Developer Console errors

### Provider/session artifacts

Read-only inspect likely sources:

- `%USERPROFILE%\.codex`
- `%USERPROFILE%\.claude`
- `%APPDATA%\Claude`
- `C:\Users\User\.pixel-agents`

Do not mutate provider databases. For every expected agent, identify the local artifact that should
prove it exists, such as Codex thread metadata or Claude JSONL/cowork metadata.

## Report

Write:

```text
docs/roadmap/supervision/reports/W3-A-windows-release-qa-report.md
```

The report must include:

- Summary verdict: pass / pass with caveats / fail.
- Exact commands run.
- Installed extension identity evidence.
- Runtime agent-count matrix.
- Agent Center tab results.
- Seating observations.
- Usage observations.
- Any error logs.
- Recommended next package: W3-B, W3-C, W3-D, or "no blocker".

## Commit

Commit only the report if it is created. Do not include unrelated workspace files.

Suggested commit:

```text
docs: add W3-A Windows release QA report
```
